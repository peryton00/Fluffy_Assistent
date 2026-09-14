import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { networkWorkspaceStore } from "./networkWorkspaceStore";
import * as networkApi from "../services/api/networkApi";
import { networkEventsService } from "../services/websocket/networkEvents";
import type {
  NetworkStateSnapshot,
  NetworkEvent,
} from "../types/contracts";

const mockSnapshot: NetworkStateSnapshot = {
  revision: 42,
  captured_at_epoch_ms: 1700000000000,
  nodes: [
    {
      id: "node-1",
      name: "Fluffy Master",
      os: "windows",
      arch: "x86_64",
      role: "admin",
      availability: "available",
      auth_state: "authenticated",
      pairing_state: "paired",
      last_seen_epoch: 1700000000,
    },
  ],
  devices: [
    {
      id: "dev-mac-00:11:22:33:44:55",
      ip_address: "192.168.1.50",
      mac_address: "00:11:22:33:44:55",
      hostname: "printer.local",
      vendor: "HP",
      category: "printer",
      state: "reachable",
      source: "arp_table",
      is_gateway: false,
      is_self: false,
      is_fluffy_node: false,
      last_seen_epoch: 1700000000,
    },
  ],
  connections: [
    {
      id: "conn-1",
      kind: "cluster_transport",
      protocol: "tcp",
      local_addr: "192.168.1.10",
      local_port: 9000,
      remote_addr: "192.168.1.20",
      remote_port: 9000,
      state: "established",
      direction: "outbound",
      established_at_epoch: 1700000000,
    },
  ],
  interfaces: [
    {
      id: "eth0",
      name: "eth0",
      mac_address: "00:aa:bb:cc:dd:ee",
      interface_type: "ethernet",
      status: "up",
      is_up: true,
      is_physical: true,
      is_loopback: false,
      is_default_gateway: true,
      ipv4_addresses: ["192.168.1.10/24"],
      ipv6_addresses: [],
      dns_servers: ["192.168.1.1"],
      mtu: 1500,
      total_received_bytes: 2097152,
      total_transmitted_bytes: 1048576,
      rates: {
        rx_bytes_per_sec: 1200,
        tx_bytes_per_sec: 500,
      },
    },
  ],
  traffic: {
    rx_bytes: 2097152,
    tx_bytes: 1048576,
    rx_packets: 2000,
    tx_packets: 1000,
    rx_errors: 0,
    tx_errors: 0,
    rx_drops: 0,
    tx_drops: 0,
    rates: {
      rx_bytes_per_sec: 20480,
      tx_bytes_per_sec: 10240,
    },
    top_talkers: [
      {
        entity_id: "node-1",
        entity_name: "Fluffy Master",
        rx_bytes: 2097152,
        tx_bytes: 1048576,
        rx_rate_bps: 20480,
        tx_rate_bps: 10240,
      },
    ],
  },
};

describe("NetworkWorkspaceStore Manager", () => {
  beforeEach(() => {
    networkWorkspaceStore.resetForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    networkWorkspaceStore.destroy();
    vi.restoreAllMocks();
  });

  // A. Initial snapshot loading
  it("A. loads initial snapshot and transitions status to healthy", async () => {
    vi.spyOn(networkApi, "fetchNetworkSnapshot").mockResolvedValue(mockSnapshot);
    vi.spyOn(networkEventsService, "connect").mockImplementation(async () => {});

    expect(networkWorkspaceStore.getState().status).toBe("idle");

    const promise = networkWorkspaceStore.initialize();
    expect(networkWorkspaceStore.getState().status).toBe("loading");

    await promise;

    const state = networkWorkspaceStore.getState();
    expect(state.status).toBe("healthy");
    expect(state.revision).toBe(42);
    expect(state.error).toBeNull();
  });

  // B. Snapshot populates nodes, devices, connections, interfaces, traffic
  it("B. populates all network domains accurately from snapshot", async () => {
    vi.spyOn(networkApi, "fetchNetworkSnapshot").mockResolvedValue(mockSnapshot);
    vi.spyOn(networkEventsService, "connect").mockImplementation(async () => {});

    await networkWorkspaceStore.initialize();
    const state = networkWorkspaceStore.getState();

    expect(state.nodes.length).toBe(1);
    expect(state.nodes[0].id).toBe("node-1");
    expect(state.devices.length).toBe(1);
    expect(state.devices[0].mac_address).toBe("00:11:22:33:44:55");
    expect(state.connections.length).toBe(1);
    expect(state.connections[0].id).toBe("conn-1");
    expect(state.interfaces.length).toBe(1);
    expect(state.interfaces[0].id).toBe("eth0");
    expect(state.traffic?.tx_bytes).toBe(1048576);
  });

  // C & D. Event application: Node update event
  it("C & D. applies node discovery and node status change events", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    const discoveryEvent: NetworkEvent = {
      event_id: "evt-1",
      sequence: 101,
      state_revision: 43,
      timestamp_epoch_ms: 1700000010000,
      severity: "info",
      category: "cluster",
      event_type: "NodeDiscovered",
      target_node_id: "node-2",
      summary: "New worker node discovered",
      details: { node_name: "Worker Node 2", os: "linux", arch: "aarch64" },
    };

    networkWorkspaceStore.applyEvent(discoveryEvent);
    expect(networkWorkspaceStore.getState().nodes.length).toBe(2);
    expect(networkWorkspaceStore.getState().nodes[1].id).toBe("node-2");

    // Status change event
    const disconnectEvent: NetworkEvent = {
      event_id: "evt-2",
      sequence: 102,
      state_revision: 44,
      timestamp_epoch_ms: 1700000020000,
      severity: "warning",
      category: "cluster",
      event_type: "NodeDisconnected",
      target_node_id: "node-2",
      summary: "Worker node 2 disconnected",
      details: {},
    };

    networkWorkspaceStore.applyEvent(disconnectEvent);
    const updatedNode = networkWorkspaceStore.getState().nodes.find((n) => n.id === "node-2");
    expect(updatedNode?.availability).toBe("disconnected");
  });

  // E. Device event
  it("E. applies device discovery and removal events", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    const devEvent: NetworkEvent = {
      event_id: "evt-dev-1",
      sequence: 103,
      state_revision: 45,
      timestamp_epoch_ms: 1700000050000,
      severity: "info",
      category: "discovery",
      event_type: "DeviceDiscovered",
      target_device_id: "dev-ip-192.168.1.99",
      summary: "Discovered NAS on LAN",
      details: { ip_address: "192.168.1.99", hostname: "nas.local" },
    };

    networkWorkspaceStore.applyEvent(devEvent);
    expect(networkWorkspaceStore.getState().devices.length).toBe(2);

    // Device removed
    const devRemovedEvent: NetworkEvent = {
      event_id: "evt-dev-2",
      sequence: 104,
      state_revision: 46,
      timestamp_epoch_ms: 1700000060000,
      severity: "info",
      category: "discovery",
      event_type: "DeviceRemoved",
      target_device_id: "dev-ip-192.168.1.99",
      summary: "Device expired",
      details: {},
    };

    networkWorkspaceStore.applyEvent(devRemovedEvent);
    expect(networkWorkspaceStore.getState().devices.length).toBe(1);
  });

  // F. Connection event
  it("F. applies connection closed event", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    networkWorkspaceStore.applyEvent({
      event_id: "evt-conn-2",
      sequence: 106,
      state_revision: 47,
      timestamp_epoch_ms: 1700000110000,
      severity: "info",
      category: "connection",
      event_type: "ConnectionClosed",
      target_connection_id: "conn-1",
      summary: "Connection closed",
      details: {},
    });

    expect(networkWorkspaceStore.getState().connections.length).toBe(0);
  });

  // G. Interface event
  it("G. applies interface removal events", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    networkWorkspaceStore.applyEvent({
      event_id: "evt-iface-1",
      sequence: 107,
      state_revision: 48,
      timestamp_epoch_ms: 1700000120000,
      severity: "info",
      category: "network",
      event_type: "InterfaceRemoved",
      summary: "Adapter disconnected",
      details: { interface_id: "eth0" },
    });

    expect(networkWorkspaceStore.getState().interfaces.length).toBe(0);
  });

  // H. Security event presentation
  it("H. captures security observations in the event stream", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    const secEvent: NetworkEvent = {
      event_id: "evt-sec-1",
      sequence: 108,
      state_revision: 49,
      timestamp_epoch_ms: 1700000150000,
      severity: "critical",
      category: "security",
      event_type: "SecurityObservationRecorded",
      target_device_id: "dev-unknown",
      summary: "Port scan detected from unknown host",
      details: {
        observation_type: "port_scan_detected",
        details: "Unusual TCP port sweep across ports 1-1024",
      },
    };

    networkWorkspaceStore.applyEvent(secEvent);

    const events = networkWorkspaceStore.getState().events;
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("security");
    expect(events[0].severity).toBe("critical");
  });

  // I & J. Bounded event list & sequence ordering
  it("I & J. bounds recent event list and maintains latest-first ordering", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    for (let i = 1; i <= 250; i++) {
      networkWorkspaceStore.applyEvent({
        event_id: `evt-seq-${i}`,
        sequence: i,
        timestamp_epoch_ms: 1700000000000 + i * 1000,
        severity: "info",
        category: "telemetry",
        event_type: "TelemetryUpdated",
        summary: `Telemetry tick ${i}`,
        details: { tick: i },
      });
    }

    const state = networkWorkspaceStore.getState();
    // Bounded to 200 events
    expect(state.events.length).toBe(200);
    // Newest event (sequence 250) is at index 0
    expect(state.events[0].sequence).toBe(250);
    // Oldest kept event is sequence 51
    expect(state.events[199].sequence).toBe(51);
  });

  // K. Event lag detection
  it("K. transitions to stale state when event lag is detected", () => {
    let capturedOnLag: ((droppedCount: number) => void) | null = null;
    vi.spyOn(networkEventsService, "onLag").mockImplementation((handler) => {
      capturedOnLag = handler;
      return () => {};
    });
    vi.spyOn(networkApi, "fetchNetworkSnapshot").mockResolvedValue(mockSnapshot);

    networkWorkspaceStore.initialize();
    expect(capturedOnLag).toBeDefined();

    // Trigger lag
    capturedOnLag!(15);
    expect(networkWorkspaceStore.getState().status).toBe("degraded");
    expect(networkWorkspaceStore.getState().isStale).toBe(true);
  });

  // L. Snapshot resynchronization after lag
  it("L. resynchronizes snapshot and returns to healthy after lag", async () => {
    const fetchSnapshotSpy = vi.spyOn(networkApi, "fetchNetworkSnapshot").mockResolvedValue({
      ...mockSnapshot,
      revision: 99,
    });

    networkWorkspaceStore.applySnapshot(mockSnapshot);
    networkWorkspaceStore.markStale();
    expect(networkWorkspaceStore.getState().status).toBe("degraded");

    await networkWorkspaceStore.resync();

    expect(fetchSnapshotSpy).toHaveBeenCalled();
    const state = networkWorkspaceStore.getState();
    expect(state.status).toBe("healthy");
    expect(state.revision).toBe(99);
  });

  // M, N, O, P. State representations
  it("M, N, O, P. handles loading, empty, error, and stale states properly", async () => {
    // Empty state
    const emptySnapshot: NetworkStateSnapshot = {
      revision: 1,
      captured_at_epoch_ms: 1700000000000,
      nodes: [],
      devices: [],
      connections: [],
      interfaces: [],
      traffic: {
        rx_bytes: 0,
        tx_bytes: 0,
        rx_packets: 0,
        tx_packets: 0,
        rx_errors: 0,
        tx_errors: 0,
        rx_drops: 0,
        tx_drops: 0,
        rates: null,
        top_talkers: [],
      },
    };

    networkWorkspaceStore.applySnapshot(emptySnapshot);
    expect(networkWorkspaceStore.getState().nodes.length).toBe(0);
    expect(networkWorkspaceStore.getState().devices.length).toBe(0);

    // Error state
    vi.spyOn(networkApi, "fetchNetworkSnapshot").mockRejectedValue(
      new Error("Connection refused on backend N7 port")
    );

    await networkWorkspaceStore.resync();
    expect(networkWorkspaceStore.getState().status).toBe("error");
    expect(networkWorkspaceStore.getState().error?.message).toContain("Connection refused");
  });

  // Q. Shared selection foundation
  it("Q. sets and clears shared entity selection", () => {
    networkWorkspaceStore.selectEntity({ type: "node", id: "node-1" });
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "node",
      id: "node-1",
    });

    networkWorkspaceStore.selectEntity("device", "dev-mac-1");
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "device",
      id: "dev-mac-1",
    });

    networkWorkspaceStore.clearSelection();
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "none",
      id: null,
    });
  });

  // R. N10 Controlled pairing & connect workflow
  it("R. executes connectNode workflow updating node and connection state", async () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    const connectedNode = {
      id: "node-2",
      name: "Remote Worker",
      os: "linux",
      arch: "x86_64",
      role: "worker" as const,
      availability: "connected" as const,
      auth_state: "authenticated" as const,
      pairing_state: "paired" as const,
      last_seen_epoch: 1700000000,
    };

    const newConn = {
      id: "conn-2",
      kind: "cluster_transport" as const,
      protocol: "tcp" as const,
      local_addr: "192.168.1.10",
      local_port: 9000,
      remote_addr: "192.168.1.30",
      remote_port: 9000,
      state: "established" as const,
      direction: "outbound" as const,
      associated_node_id: "node-2",
      established_at_epoch: 1700000000,
    };

    vi.spyOn(networkApi, "connectNode").mockResolvedValueOnce({
      revision: 45,
      node: connectedNode,
      connection: newConn,
    });

    const success = await networkWorkspaceStore.connectNode("node-2");
    expect(success).toBe(true);

    const state = networkWorkspaceStore.getState();
    expect(state.revision).toBe(45);
    expect(state.nodes.some((n) => n.id === "node-2" && n.availability === "connected")).toBe(true);
    expect(state.connections.some((c) => c.id === "conn-2")).toBe(true);
    expect(state.connectingNodeIds.has("node-2")).toBe(false);
  });

  // S. N10 Graceful disconnect workflow
  it("S. executes disconnectNode workflow removing active connection", async () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    const disconnectedNode = {
      id: "node-1",
      name: "Fluffy Master",
      os: "windows",
      arch: "x86_64",
      role: "admin" as const,
      availability: "disconnected" as const,
      auth_state: "unauthenticated" as const,
      pairing_state: "unpaired" as const,
      last_seen_epoch: 1700000000,
    };

    vi.spyOn(networkApi, "disconnectNode").mockResolvedValueOnce({
      revision: 46,
      node: disconnectedNode,
    });

    const success = await networkWorkspaceStore.disconnectNode("node-1");
    expect(success).toBe(true);

    const state = networkWorkspaceStore.getState();
    expect(state.revision).toBe(46);
    expect(state.nodes.find((n) => n.id === "node-1")?.availability).toBe("disconnected");
    expect(state.connections.some((c) => c.associated_node_id === "node-1")).toBe(false);
    expect(state.connectingNodeIds.has("node-1")).toBe(false);
  });

  // T. N10 Event-driven lifecycle updates
  it("T. processes canonical pairing and authentication events correctly", () => {
    networkWorkspaceStore.applySnapshot(mockSnapshot);

    // 1. pairingstarted
    networkWorkspaceStore.applyEvent({
      event_id: "evt-pair-1",
      sequence: 101,
      state_revision: 47,
      timestamp_epoch_ms: Date.now(),
      category: "cluster",
      event_type: "pairingstarted",
      severity: "info",
      target_node_id: "node-1",
      summary: "Pairing handshake initiated",
      details: {},
    });

    let node = networkWorkspaceStore.getState().nodes.find((n) => n.id === "node-1");
    expect(node?.availability).toBe("pairing");
    expect(node?.pairing_state).toBe("pairing_requested");

    // 2. authstarted
    networkWorkspaceStore.applyEvent({
      event_id: "evt-auth-1",
      sequence: 102,
      state_revision: 48,
      timestamp_epoch_ms: Date.now(),
      category: "cluster",
      event_type: "authstarted",
      severity: "info",
      target_node_id: "node-1",
      summary: "Authentication handshake initiated",
      details: {},
    });

    node = networkWorkspaceStore.getState().nodes.find((n) => n.id === "node-1");
    expect(node?.availability).toBe("authenticating");
    expect(node?.auth_state).toBe("authenticating");

    // 3. nodeconnected
    networkWorkspaceStore.applyEvent({
      event_id: "evt-conn-1",
      sequence: 103,
      state_revision: 49,
      timestamp_epoch_ms: Date.now(),
      category: "cluster",
      event_type: "nodeconnected",
      severity: "info",
      target_node_id: "node-1",
      summary: "Node connected successfully",
      details: {},
    });

    node = networkWorkspaceStore.getState().nodes.find((n) => n.id === "node-1");
    expect(node?.availability).toBe("connected");
    expect(node?.auth_state).toBe("authenticated");
    expect(node?.pairing_state).toBe("paired");
  });
});

