/**
 * Fluffy Desktop - Unified Network Inspector Resolution Model (Phase N11)
 * 
 * Provides pure, read-only entity resolution and projection functions.
 * Invariants:
 * - Read-only projection from authoritative networkWorkspaceStore state.
 * - No secondary entity cache, no polling, no independent event subscriptions.
 * - Distinguishes entity state (e.g. Disconnected) from entity existence (present in store).
 * - Deterministic external endpoint resolution from current active connections.
 */

import type {
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
  NetworkEvent,
  NetworkEntitySelection,
} from "../../../types/contracts";
import type { NetworkWorkspaceState } from "../../../stores/networkWorkspaceStore";

export interface ResolvedExternalEndpoint {
  id: string;
  remoteAddress: string;
  associatedConnections: NetworkConnection[];
  protocols: string[];
  ports: number[];
  firstSeenEpoch?: number;
  lastActiveEpoch?: number;
}

export type ResolvedEntity =
  | { type: "node"; data: NetworkNode }
  | { type: "device"; data: NetworkDevice }
  | { type: "connection"; data: NetworkConnection }
  | { type: "interface"; data: NetworkInterfaceInfo }
  | { type: "external_endpoint"; data: ResolvedExternalEndpoint }
  | null;

/**
 * Resolves the currently selected entity from authoritative network workspace state.
 * Returns null if no selection is active, or if the entity is no longer present in state.
 */
export function resolveSelectedEntity(
  selection: NetworkEntitySelection | null | undefined,
  state: Pick<NetworkWorkspaceState, "nodes" | "devices" | "connections" | "interfaces">
): ResolvedEntity {
  if (!selection || selection.type === "none" || !selection.id) {
    return null;
  }

  const { type, id } = selection;

  switch (type) {
    case "node": {
      const node = state.nodes.find((n) => n.id === id);
      return node ? { type: "node", data: node } : null;
    }
    case "device": {
      const device = state.devices.find((d) => d.id === id);
      return device ? { type: "device", data: device } : null;
    }
    case "connection": {
      const conn = state.connections.find((c) => c.id === id);
      return conn ? { type: "connection", data: conn } : null;
    }
    case "interface": {
      const iface = state.interfaces.find((i) => i.id === id || i.name === id);
      return iface ? { type: "interface", data: iface } : null;
    }
    case "external_endpoint": {
      const remoteAddr = id.startsWith("external:") ? id.slice("external:".length) : id;
      const matchingConns = state.connections.filter((c) => c.remote_addr === remoteAddr);

      if (matchingConns.length === 0) {
        return null;
      }

      const protocols = Array.from(new Set(matchingConns.map((c) => c.protocol.toUpperCase())));
      const ports = Array.from(
        new Set(
          matchingConns
            .map((c) => c.remote_port)
            .filter((p): p is number => typeof p === "number")
        )
      );

      const timestamps = matchingConns
        .map((c) => c.established_at_epoch)
        .filter((t): t is number => typeof t === "number");
      const activeTimestamps = matchingConns
        .map((c) => c.last_active_epoch)
        .filter((t): t is number => typeof t === "number");

      return {
        type: "external_endpoint",
        data: {
          id: `external:${remoteAddr}`,
          remoteAddress: remoteAddr,
          associatedConnections: matchingConns,
          protocols,
          ports,
          firstSeenEpoch: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
          lastActiveEpoch: activeTimestamps.length > 0 ? Math.max(...activeTimestamps) : undefined,
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Finds connections associated with the selected entity from current authoritative state.
 */
export function resolveAssociatedConnections(
  selection: NetworkEntitySelection | null | undefined,
  connections: NetworkConnection[],
  _nodes: NetworkNode[] = [],
  devices: NetworkDevice[] = []
): NetworkConnection[] {
  if (!selection || selection.type === "none" || !selection.id) {
    return [];
  }

  const { type, id } = selection;

  switch (type) {
    case "node":
      return connections.filter((c) => c.associated_node_id === id);
    case "device": {
      const dev = devices.find((d) => d.id === id);
      if (!dev) return [];
      return connections.filter(
        (c) =>
          c.remote_addr === dev.ip_address ||
          (dev.associated_node_id && c.associated_node_id === dev.associated_node_id)
      );
    }
    case "connection":
      return connections.filter((c) => c.id === id);
    case "interface": {
      // Return connections with local IP matching the interface
      return connections.filter((c) => c.local_addr === id);
    }
    case "external_endpoint": {
      const remoteAddr = id.startsWith("external:") ? id.slice("external:".length) : id;
      return connections.filter((c) => c.remote_addr === remoteAddr);
    }
    default:
      return [];
  }
}

/**
 * Filters existing recent events for the selected entity from the store's bounded window.
 * Strictly uses existing synchronized events; does not query or persist historical events.
 */
export function resolveRelatedEvents(
  selection: NetworkEntitySelection | null | undefined,
  events: NetworkEvent[]
): NetworkEvent[] {
  if (!selection || selection.type === "none" || !selection.id) {
    return [];
  }

  const { type, id } = selection;
  const rawId = id.startsWith("external:") ? id.slice("external:".length) : id;

  return events.filter((e) => {
    switch (type) {
      case "node":
        return e.target_node_id === id || e.source_node_id === id;
      case "device":
        return e.target_device_id === id || e.details?.ip_address === rawId;
      case "connection":
        return e.target_connection_id === id;
      case "interface":
        return e.details?.interface_id === id || e.details?.name === id;
      case "external_endpoint":
        return (
          e.details?.remote_addr === rawId ||
          e.details?.target_addr === rawId ||
          e.target_device_id === id
        );
      default:
        return false;
    }
  });
}
