/**
 * Fluffy Desktop - Network Workspace Store (Phase N8)
 * 
 * Central client-side cache and view-model for the Network Operations workspace.
 * Consumes the Rust-owned N7 Network API and EventBus stream.
 * 
 * Invariants:
 * - Client representation only: Rust NetworkState remains the single authoritative store.
 * - Single coherent store: Avoids independent competing polling loops.
 * - Bounded event history: Retains a capped window (max 200) to prevent unbounded memory growth.
 * - Automatic lag recovery: Detects dropped broadcast events, marks state stale/degraded,
 *   and resynchronizes against a fresh snapshot.
 * - Generic entity selection foundation for Nodes, Devices, Connections, and Interfaces.
 */

import { useSyncExternalStore } from "react";
import {
  fetchNetworkSnapshot,
  fetchNetworkCapabilities,
  connectNode as connectNodeApi,
  disconnectNode as disconnectNodeApi,
  executeAdminCommand as executeAdminCommandApi,
  executeBatchAdminCommand as executeBatchAdminCommandApi,
} from "../services/api/networkApi";
import {
  networkEventsService,
  type NetworkEventsService,
} from "../services/websocket/networkEvents";
import type {
  NetworkStateSnapshot,
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
  TrafficMetrics,
  NetworkEvent,
  NetworkCapabilitiesMetadata,
  NetworkEntitySelection,
  AdminCommandRequest,
  AdminCommandResult,
  AdminBatchCommandRequest,
  AdminBatchCommandResult,
} from "../types/contracts";

export type NetworkWorkspaceStatus = "idle" | "loading" | "healthy" | "degraded" | "error";

export interface NetworkWorkspaceState {
  snapshot: NetworkStateSnapshot | null;
  nodes: NetworkNode[];
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  interfaces: NetworkInterfaceInfo[];
  traffic: TrafficMetrics | null;
  events: NetworkEvent[];
  capabilities: NetworkCapabilitiesMetadata | null;
  revision: number;
  status: NetworkWorkspaceStatus;
  isStale: boolean;
  error: Error | null;
  lastSynced: number | null;
  selectedEntity: NetworkEntitySelection;
  /** Transient in-flight request tracking for UI busy state only; never overrides backend lifecycle */
  connectingNodeIds: Set<string>;
  /** Transient in-flight admin command tracking for UI busy state only */
  executingCommandNodeIds: Set<string>;
}

export const MAX_EVENTS_WINDOW = 200;

class NetworkWorkspaceStoreManager {
  private state: NetworkWorkspaceState = {
    snapshot: null,
    nodes: [],
    devices: [],
    connections: [],
    interfaces: [],
    traffic: null,
    events: [],
    capabilities: null,
    revision: 0,
    status: "idle",
    isStale: false,
    error: null,
    lastSynced: null,
    selectedEntity: { type: "none", id: null },
    connectingNodeIds: new Set<string>(),
    executingCommandNodeIds: new Set<string>(),
  };

  private listeners = new Set<() => void>();
  private eventUnsubscribe: (() => void) | null = null;
  private lagUnsubscribe: (() => void) | null = null;
  private eventsService: NetworkEventsService;

  constructor(eventsService: NetworkEventsService = networkEventsService) {
    this.eventsService = eventsService;
  }

  public getState(): NetworkWorkspaceState {
    return this.state;
  }

  private setState(partial: Partial<NetworkWorkspaceState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[NetworkWorkspaceStore] Listener error:", err);
      }
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Initializes event listeners and loads the initial authoritative snapshot.
   */
  public initialize = async (): Promise<void> => {
    this.bindEventStreams();
    await Promise.all([this.loadSnapshot(), this.loadCapabilities()]);
  };

  /**
   * Binds stream listeners to the NetworkEventsService.
   */
  public bindEventStreams = (): void => {
    if (!this.eventUnsubscribe) {
      this.eventUnsubscribe = this.eventsService.onEvent((event) => {
        this.applyEvent(event);
      });
    }

    if (!this.lagUnsubscribe) {
      this.lagUnsubscribe = this.eventsService.onLag((droppedCount) => {
        this.handleLag(droppedCount);
      });
    }

    this.eventsService.connect();
  };

  /**
   * Unbinds event stream listeners.
   */
  public cleanup = (): void => {
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }
    if (this.lagUnsubscribe) {
      this.lagUnsubscribe();
      this.lagUnsubscribe = null;
    }
  };

  /**
   * Loads a fresh, coherent snapshot from the N7 Network API.
   */
  public loadSnapshot = async (): Promise<void> => {
    if (this.state.status === "idle") {
      this.setState({ status: "loading" });
    }

    try {
      const snapshot = await fetchNetworkSnapshot();
      this.setState({
        snapshot,
        nodes: snapshot.nodes,
        devices: snapshot.devices,
        connections: snapshot.connections,
        interfaces: snapshot.interfaces,
        traffic: snapshot.traffic,
        revision: snapshot.revision,
        status: "healthy",
        isStale: false,
        error: null,
        lastSynced: Date.now(),
      });
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.setState({
        status: "error",
        error: errorObj,
      });
    }
  };

  /**
   * Directly applies an authoritative snapshot to client state.
   */
  public applySnapshot = (snapshot: NetworkStateSnapshot): void => {
    this.setState({
      snapshot,
      nodes: snapshot.nodes,
      devices: snapshot.devices,
      connections: snapshot.connections,
      interfaces: snapshot.interfaces,
      traffic: snapshot.traffic,
      revision: snapshot.revision,
      status: "healthy",
      isStale: false,
      error: null,
      lastSynced: Date.now(),
    });
  };

  /**
   * Alias for cleanup.
   */
  public destroy = (): void => {
    this.cleanup();
  };

  /**
   * Alias for loadSnapshot.
   */
  public resync = async (): Promise<void> => {
    await this.loadSnapshot();
  };

  /**
   * Manually marks state degraded/stale (used by lag detection / tests).
   */
  public markStale = (): void => {
    this.handleLag(1);
  };

  /**
   * Loads subsystem capabilities metadata.
   */
  public loadCapabilities = async (): Promise<void> => {
    try {
      const capabilities = await fetchNetworkCapabilities();
      this.setState({ capabilities });
    } catch (err) {
      console.warn("[NetworkWorkspaceStore] Failed to load capabilities metadata:", err);
    }
  };

  /**
   * Applies an incoming canonical NetworkEvent with targeted state updates.
   */
  public applyEvent = (event: NetworkEvent): void => {
    // 1. Prepend to bounded events window
    const updatedEvents = [event, ...this.state.events].slice(0, MAX_EVENTS_WINDOW);

    // 2. Compute state revision bump if present
    const updatedRevision =
      event.state_revision !== undefined && event.state_revision !== null
        ? Math.max(this.state.revision, event.state_revision)
        : this.state.revision;

    let updatedNodes = this.state.nodes;
    let updatedDevices = this.state.devices;
    let updatedConnections = this.state.connections;
    let updatedInterfaces = this.state.interfaces;
    let updatedTraffic = this.state.traffic;

    const eventType = event.event_type.toLowerCase().replace(/_/g, "");

    // Node-related events
    if (
      eventType.includes("node") ||
      eventType.includes("pairing") ||
      eventType.includes("auth") ||
      eventType.includes("role") ||
      eventType.includes("heartbeat")
    ) {
      if (event.target_node_id) {
        const nodeId = event.target_node_id;
        const existingIdx = updatedNodes.findIndex((n) => n.id === nodeId);

        if (eventType === "noderemoved") {
          updatedNodes = updatedNodes.filter((n) => n.id !== nodeId);
        } else if (existingIdx >= 0) {
          let updatedNode = { ...updatedNodes[existingIdx], last_seen_epoch: Date.now() / 1000 };

          if (eventType === "pairingstarted") {
            updatedNode.availability = "pairing";
            updatedNode.pairing_state = "pairing_requested";
          } else if (eventType === "pairingfailed") {
            updatedNode.availability = "available";
            updatedNode.pairing_state = "pairing_failed";
          } else if (eventType === "pairingcompleted") {
            updatedNode.pairing_state = "paired";
          } else if (eventType === "authstarted") {
            updatedNode.availability = "authenticating";
            updatedNode.auth_state = "authenticating";
          } else if (eventType === "authsucceeded") {
            updatedNode.auth_state = "authenticated";
          } else if (eventType === "authfailed") {
            updatedNode.availability = "available";
            updatedNode.auth_state = "failed";
          } else if (eventType === "nodeconnected") {
            updatedNode.availability = "connected";
            updatedNode.auth_state = "authenticated";
            updatedNode.pairing_state = "paired";
          } else if (eventType === "nodedisconnected") {
            updatedNode.availability = "disconnected";
            updatedNode.auth_state = "unauthenticated";
            updatedNode.pairing_state = "unpaired";
          } else if (eventType === "nodeavailable") {
            updatedNode.availability = "available";
          } else if (eventType === "noderecovered") {
            updatedNode.availability = "connected";
          }

          updatedNodes = updatedNodes.map((n, idx) => (idx === existingIdx ? updatedNode : n));
        } else if (eventType === "nodediscovered" || eventType === "nodeavailable") {
          const newNode: NetworkNode = {
            id: nodeId,
            name: String(event.details?.node_name ?? nodeId),
            os: String(event.details?.os ?? "unknown"),
            arch: String(event.details?.arch ?? "unknown"),
            role: "worker",
            availability: "available",
            auth_state: "unauthenticated",
            pairing_state: "unpaired",
            last_seen_epoch: Date.now() / 1000,
          };
          updatedNodes = [...updatedNodes, newNode];
        }
      }
    }

    // Device-related events
    if (eventType.includes("device")) {
      if (event.target_device_id) {
        const devId = event.target_device_id;
        const existingIdx = updatedDevices.findIndex((d) => d.id === devId);

        if (eventType === "deviceremoved") {
          updatedDevices = updatedDevices.filter((d) => d.id !== devId);
        } else if (existingIdx >= 0) {
          updatedDevices = updatedDevices.map((d, idx) =>
            idx === existingIdx ? { ...d, last_seen_epoch: Date.now() / 1000 } : d
          );
        } else if (eventType === "devicediscovered") {
          const newDev: NetworkDevice = {
            id: devId,
            ip_address: String(event.details?.ip_address ?? "0.0.0.0"),
            mac_address: event.details?.mac_address ? String(event.details.mac_address) : null,
            hostname: event.details?.hostname ? String(event.details.hostname) : null,
            vendor: null,
            category: "unknown",
            state: "reachable",
            source: "arp_table",
            is_gateway: false,
            is_self: false,
            is_fluffy_node: false,
            last_seen_epoch: Date.now() / 1000,
          };
          updatedDevices = [...updatedDevices, newDev];
        }
      }
    }

    // Connection-related events
    if (eventType.includes("connection")) {
      if (event.target_connection_id) {
        const connId = event.target_connection_id;
        if (eventType === "connectionclosed") {
          updatedConnections = updatedConnections.filter((c) => c.id !== connId);
        }
      }
    }

    // Interface-related events
    if (eventType.includes("interface")) {
      if (event.details?.interface_id || event.details?.name) {
        const ifaceId = String(event.details?.interface_id ?? event.details?.name);
        if (eventType === "interfaceremoved") {
          updatedInterfaces = updatedInterfaces.filter((i) => i.id !== ifaceId && i.name !== ifaceId);
        }
      }
    }

    // Traffic-related events
    if (eventType.includes("traffic")) {
      if (event.details?.rx_bytes !== undefined || event.details?.tx_bytes !== undefined) {
        updatedTraffic = {
          rx_bytes: Number(event.details.rx_bytes ?? updatedTraffic?.rx_bytes ?? 0),
          tx_bytes: Number(event.details.tx_bytes ?? updatedTraffic?.tx_bytes ?? 0),
          rx_packets: Number(event.details.rx_packets ?? updatedTraffic?.rx_packets ?? 0),
          tx_packets: Number(event.details.tx_packets ?? updatedTraffic?.tx_packets ?? 0),
          rx_errors: updatedTraffic?.rx_errors ?? 0,
          tx_errors: updatedTraffic?.tx_errors ?? 0,
          rx_drops: updatedTraffic?.rx_drops ?? 0,
          tx_drops: updatedTraffic?.tx_drops ?? 0,
          rates: updatedTraffic?.rates ?? null,
          top_talkers: updatedTraffic?.top_talkers ?? [],
        };
      }
    }

    this.setState({
      events: updatedEvents,
      revision: updatedRevision,
      nodes: updatedNodes,
      devices: updatedDevices,
      connections: updatedConnections,
      interfaces: updatedInterfaces,
      traffic: updatedTraffic,
      lastSynced: Date.now(),
    });
  };

  /**
   * Initiates controlled pairing and connection workflow for a remote node (N10).
   * Note: connectingNodeIds is a transient in-flight UI tracking state only.
   */
  public connectNode = async (nodeId: string): Promise<boolean> => {
    const nextConnecting = new Set(this.state.connectingNodeIds);
    nextConnecting.add(nodeId);
    this.setState({ connectingNodeIds: nextConnecting });

    try {
      const res = await connectNodeApi(nodeId);
      if (res && res.node) {
        const updatedNodes = this.state.nodes.map((n) => (n.id === nodeId ? res.node : n));
        if (!updatedNodes.some((n) => n.id === nodeId)) {
          updatedNodes.push(res.node);
        }

        let updatedConnections = this.state.connections;
        if (res.connection) {
          const connIdx = updatedConnections.findIndex((c) => c.id === res.connection!.id);
          if (connIdx >= 0) {
            updatedConnections = updatedConnections.map((c, i) => (i === connIdx ? res.connection! : c));
          } else {
            updatedConnections = [...updatedConnections, res.connection];
          }
        }

        this.setState({
          nodes: updatedNodes,
          connections: updatedConnections,
          revision: Math.max(this.state.revision, res.revision ?? 0),
          lastSynced: Date.now(),
        });
      }
      return true;
    } catch (err) {
      console.error("[NetworkWorkspaceStore] Connect node failed:", err);
      return false;
    } finally {
      const finishedConnecting = new Set(this.state.connectingNodeIds);
      finishedConnecting.delete(nodeId);
      this.setState({ connectingNodeIds: finishedConnecting });
    }
  };

  /**
   * Gracefully disconnects an active node and terminates its authoritative connection (N10).
   */
  public disconnectNode = async (nodeId: string): Promise<boolean> => {
    const nextConnecting = new Set(this.state.connectingNodeIds);
    nextConnecting.add(nodeId);
    this.setState({ connectingNodeIds: nextConnecting });

    try {
      const res = await disconnectNodeApi(nodeId);
      if (res && res.node) {
        const updatedNodes = this.state.nodes.map((n) => (n.id === nodeId ? res.node : n));
        const updatedConnections = this.state.connections.filter((c) => c.associated_node_id !== nodeId);

        this.setState({
          nodes: updatedNodes,
          connections: updatedConnections,
          revision: Math.max(this.state.revision, res.revision ?? 0),
          lastSynced: Date.now(),
        });
      }
      return true;
    } catch (err) {
      console.error("[NetworkWorkspaceStore] Disconnect node failed:", err);
      return false;
    } finally {
      const finishedConnecting = new Set(this.state.connectingNodeIds);
      finishedConnecting.delete(nodeId);
      this.setState({ connectingNodeIds: finishedConnecting });
    }
  };

  /**
   * Executes an administrative capability command against a single target node (N13).
   */
  public executeCommand = async (
    targetNodeId: string,
    capabilityId: string,
    parameters?: Record<string, unknown> | null,
    confirmed?: boolean
  ): Promise<AdminCommandResult> => {
    const nextExecuting = new Set(this.state.executingCommandNodeIds);
    nextExecuting.add(targetNodeId);
    this.setState({ executingCommandNodeIds: nextExecuting });

    try {
      const req: AdminCommandRequest = {
        request_id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        target_node_id: targetNodeId,
        capability: {
          id: capabilityId,
          parameters: parameters ?? {},
        },
        confirmed: confirmed ?? false,
      };
      const result = await executeAdminCommandApi(req);
      return result;
    } finally {
      const finished = new Set(this.state.executingCommandNodeIds);
      finished.delete(targetNodeId);
      this.setState({ executingCommandNodeIds: finished });
    }
  };

  /**
   * Executes a batch administrative capability command across multiple target nodes (N13).
   */
  public executeBatchCommand = async (
    targetNodeIds: string[],
    capabilityId: string,
    parameters?: Record<string, unknown> | null,
    confirmed?: boolean
  ): Promise<AdminBatchCommandResult> => {
    const nextExecuting = new Set(this.state.executingCommandNodeIds);
    targetNodeIds.forEach((id) => nextExecuting.add(id));
    this.setState({ executingCommandNodeIds: nextExecuting });

    try {
      const req: AdminBatchCommandRequest = {
        batch_id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        target_node_ids: targetNodeIds,
        capability: {
          id: capabilityId,
          parameters: parameters ?? {},
        },
        confirmed: confirmed ?? false,
      };
      const result = await executeBatchAdminCommandApi(req);
      return result;
    } finally {
      const finished = new Set(this.state.executingCommandNodeIds);
      targetNodeIds.forEach((id) => finished.delete(id));
      this.setState({ executingCommandNodeIds: finished });
    }
  };

  /**
   * Handles subscriber lag by marking state degraded/stale and resynchronizing.
   */
  public handleLag = (_droppedCount: number): void => {
    // 1. Mark state degraded/stale immediately
    this.setState({
      isStale: true,
      status: "degraded",
    });

    // 2. Request a fresh snapshot to resynchronize
    this.loadSnapshot();
  };

  /**
   * Sets the active shared entity selection.
   */
  public selectEntity = (
    typeOrSelection: NetworkEntitySelection["type"] | NetworkEntitySelection,
    id?: string | null
  ): void => {
    const sel = typeof typeOrSelection === "object" && typeOrSelection !== null
      ? typeOrSelection
      : { type: typeOrSelection, id: id ?? null };

    this.setState({
      selectedEntity: sel,
    });

    if (sel.type !== "none" && sel.id) {
      import("./uiStore").then(({ uiStore }) => {
        uiStore.setSelectedItem({
          type: sel.type as any,
          id: sel.id!,
          title: sel.id!,
          data: { entityType: sel.type, id: sel.id },
        }, true);
      }).catch(() => {});
    }
  };

  /**
   * Clears the active entity selection.
   */
  public clearSelection = (): void => {
    this.setState({
      selectedEntity: { type: "none", id: null },
    });
    import("./uiStore").then(({ uiStore }) => {
      const cur = uiStore.getState().selectedItem;
      if (cur && (cur.type === "node" || cur.type === "device" || cur.type === "connection" || cur.type === "interface" || cur.type === "external_endpoint" || cur.type.startsWith("network"))) {
        uiStore.setSelectedItem(null, false);
      }
    }).catch(() => {});
  };

  /**
   * Reset store state (for testing isolation).
   */
  public resetForTesting = (): void => {
    this.cleanup();
    this.state = {
      snapshot: null,
      nodes: [],
      devices: [],
      connections: [],
      interfaces: [],
      traffic: null,
      events: [],
      capabilities: null,
      revision: 0,
      status: "idle",
      isStale: false,
      error: null,
      lastSynced: null,
      selectedEntity: { type: "none", id: null },
      connectingNodeIds: new Set<string>(),
      executingCommandNodeIds: new Set<string>(),
    };
    this.notify();
  };
}

// Singleton store manager instance
export const networkWorkspaceStore = new NetworkWorkspaceStoreManager();

/**
 * Custom React hook for subscribing to NetworkWorkspaceStore with selector support.
 */
export function useNetworkWorkspaceStore<T = NetworkWorkspaceState>(
  selector: (state: NetworkWorkspaceState) => T = (s) => s as unknown as T
): T {
  return useSyncExternalStore(
    networkWorkspaceStore.subscribe,
    () => selector(networkWorkspaceStore.getState()),
    () => selector(networkWorkspaceStore.getState())
  );
}
