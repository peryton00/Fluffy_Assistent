import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import { uiStore } from "../../../stores/uiStore";
import {
  resolveSelectedEntity,
} from "./inspectorModel";
import { NetworkInspector } from "./NetworkInspector";
import type {
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
  NetworkStateSnapshot,
} from "../../../types/contracts";

const mockNode: NetworkNode = {
  id: "node-alpha",
  name: "Fluffy Master",
  hostname: "master.lan",
  os: "windows",
  arch: "x86_64",
  role: "admin",
  availability: "connected",
  auth_state: "authenticated",
  pairing_state: "paired",
  ip_addresses: ["192.168.1.10"],
  last_seen_epoch: 1700000000,
};

const mockDevice: NetworkDevice = {
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
};

const mockConn1: NetworkConnection = {
  id: "conn-1",
  kind: "cluster_transport",
  protocol: "tcp",
  local_addr: "192.168.1.10",
  local_port: 9000,
  remote_addr: "192.168.1.20",
  remote_port: 9000,
  state: "established",
  direction: "outbound",
  associated_node_id: "node-alpha",
  established_at_epoch: 1700000000,
  last_active_epoch: 1700000010,
};

const mockConnExternal1: NetworkConnection = {
  id: "conn-ext-1",
  kind: "local_socket_flow",
  protocol: "tcp",
  local_addr: "192.168.1.10",
  local_port: 54321,
  remote_addr: "1.1.1.1",
  remote_port: 443,
  state: "established",
  direction: "outbound",
  established_at_epoch: 1700000000,
  last_active_epoch: 1700000020,
};

const mockConnExternal2: NetworkConnection = {
  id: "conn-ext-2",
  kind: "local_socket_flow",
  protocol: "tcp",
  local_addr: "192.168.1.10",
  local_port: 54322,
  remote_addr: "1.1.1.1",
  remote_port: 80,
  state: "established",
  direction: "outbound",
  established_at_epoch: 1700000005,
  last_active_epoch: 1700000025,
};

const mockInterface: NetworkInterfaceInfo = {
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
  dns_servers: ["1.1.1.1"],
  mtu: 1500,
  total_received_bytes: 2097152,
  total_transmitted_bytes: 1048576,
  rates: {
    rx_bytes_per_sec: 1200,
    tx_bytes_per_sec: 500,
  },
};

const mockSnapshot: NetworkStateSnapshot = {
  revision: 1,
  captured_at_epoch_ms: 1700000000000,
  nodes: [mockNode],
  devices: [mockDevice],
  connections: [mockConn1, mockConnExternal1, mockConnExternal2],
  interfaces: [mockInterface],
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

describe("Unified Network Inspector (Phase N11)", () => {
  beforeEach(() => {
    networkWorkspaceStore.resetForTesting();
    networkWorkspaceStore.applySnapshot(mockSnapshot);
  });

  // A. Selection stores correct entity type + ID
  it("A. selection stores correct entity type and ID", () => {
    networkWorkspaceStore.selectEntity("node", "node-alpha");
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "node",
      id: "node-alpha",
    });

    networkWorkspaceStore.selectEntity("external_endpoint", "external:1.1.1.1");
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "external_endpoint",
      id: "external:1.1.1.1",
    });
  });

  // B. Selecting a node opens node Inspector
  it("B. resolves selected node from current store state", () => {
    const res = resolveSelectedEntity(
      { type: "node", id: "node-alpha" },
      networkWorkspaceStore.getState()
    );
    expect(res).not.toBeNull();
    expect(res?.type).toBe("node");
    if (res?.type === "node") {
      expect(res.data.name).toBe("Fluffy Master");
      expect(res.data.role).toBe("admin");
      expect(res.data.availability).toBe("connected");
    }
  });

  // C. Selecting a device opens device Inspector
  it("C. resolves selected device from current store state", () => {
    const res = resolveSelectedEntity(
      { type: "device", id: "dev-mac-00:11:22:33:44:55" },
      networkWorkspaceStore.getState()
    );
    expect(res).not.toBeNull();
    expect(res?.type).toBe("device");
    if (res?.type === "device") {
      expect(res.data.ip_address).toBe("192.168.1.50");
      expect(res.data.category).toBe("printer");
    }
  });

  // D. Selecting a connection opens connection Inspector
  it("D. resolves selected connection from current store state", () => {
    const res = resolveSelectedEntity(
      { type: "connection", id: "conn-1" },
      networkWorkspaceStore.getState()
    );
    expect(res).not.toBeNull();
    expect(res?.type).toBe("connection");
    if (res?.type === "connection") {
      expect(res.data.local_port).toBe(9000);
      expect(res.data.kind).toBe("cluster_transport");
    }
  });

  // E. Selecting an interface opens interface Inspector
  it("E. resolves selected interface from current store state", () => {
    const res = resolveSelectedEntity(
      { type: "interface", id: "eth0" },
      networkWorkspaceStore.getState()
    );
    expect(res).not.toBeNull();
    expect(res?.type).toBe("interface");
    if (res?.type === "interface") {
      expect(res.data.name).toBe("eth0");
      expect(res.data.is_up).toBe(true);
    }
  });

  // F. Selecting external endpoint resolves deterministically from current connections
  it("F. resolves external endpoint deterministically from current connections", () => {
    const res = resolveSelectedEntity(
      { type: "external_endpoint", id: "external:1.1.1.1" },
      networkWorkspaceStore.getState()
    );
    expect(res).not.toBeNull();
    expect(res?.type).toBe("external_endpoint");
    if (res?.type === "external_endpoint") {
      expect(res.data.remoteAddress).toBe("1.1.1.1");
      expect(res.data.associatedConnections).toHaveLength(2);
      expect(res.data.ports).toContain(443);
      expect(res.data.ports).toContain(80);
    }
  });

  // G. Selected node remains selected after its authoritative state changes (Connected -> Disconnected)
  it("G. selected node changes Connected -> Disconnected without becoming removed", () => {
    networkWorkspaceStore.selectEntity("node", "node-alpha");

    // Apply NodeDisconnected event
    networkWorkspaceStore.applyEvent({
      event_id: "evt-dc-1",
      sequence: 2,
      state_revision: 2,
      timestamp_epoch_ms: Date.now(),
      category: "cluster",
      event_type: "nodedisconnected",
      severity: "warning",
      target_node_id: "node-alpha",
      summary: "Node disconnected",
      details: {},
    });

    const state = networkWorkspaceStore.getState();
    expect(state.selectedEntity).toEqual({ type: "node", id: "node-alpha" });

    const res = resolveSelectedEntity(state.selectedEntity, state);
    expect(res).not.toBeNull();
    expect(res?.type).toBe("node");
    if (res?.type === "node") {
      expect(res.data.availability).toBe("disconnected");
      expect(res.data.auth_state).toBe("unauthenticated");
    }
  });

  // H. Selected connection becomes unavailable when authoritative connection closes
  it("H. selected connection becomes unavailable when connection disappears from store", () => {
    networkWorkspaceStore.selectEntity("connection", "conn-1");

    // Close connection event
    networkWorkspaceStore.applyEvent({
      event_id: "evt-close-1",
      sequence: 3,
      state_revision: 3,
      timestamp_epoch_ms: Date.now(),
      category: "connection",
      event_type: "connectionclosed",
      severity: "info",
      target_connection_id: "conn-1",
      summary: "Connection closed",
      details: {},
    });

    const state = networkWorkspaceStore.getState();
    const res = resolveSelectedEntity(state.selectedEntity, state);
    expect(res).toBeNull(); // Correctly marked unavailable
  });

  // I. Cross-view selection survives switching among all seven views
  it("I. shared selection survives switching among all seven Network views", () => {
    networkWorkspaceStore.selectEntity("node", "node-alpha");

    const views = [
      "overview",
      "systems",
      "topology",
      "traffic",
      "events",
      "security",
      "interfaces",
    ];

    for (const view of views) {
      uiStore.setActiveSidebarView(view);
      expect(uiStore.getState().activeSidebarView).toBe(view);
      expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
        type: "node",
        id: "node-alpha",
      });
    }
  });

  // J. Stale / degraded workspace synchronization state does not overwrite entity state
  it("J. stale/degraded sync state does not overwrite canonical entity state", () => {
    networkWorkspaceStore.selectEntity("node", "node-alpha");
    networkWorkspaceStore.markStale();

    const state = networkWorkspaceStore.getState();
    expect(state.status).toBe("degraded");
    expect(state.isStale).toBe(true);

    const res = resolveSelectedEntity(state.selectedEntity, state);
    expect(res).not.toBeNull();
    if (res?.type === "node") {
      expect(res.data.availability).toBe("connected"); // Still authoritative connected
    }
  });

  // K. NetworkInspector component renders without crashing
  it("K. renders NetworkInspector component cleanly for selected entities", () => {
    networkWorkspaceStore.selectEntity("node", "node-alpha");
    const htmlNode = renderToStaticMarkup(<NetworkInspector />);
    expect(htmlNode).toContain("Fluffy Master");
    expect(htmlNode).toContain("NODE");
    expect(htmlNode).toContain("CONNECTED");

    networkWorkspaceStore.selectEntity("external_endpoint", "external:1.1.1.1");
    const htmlExt = renderToStaticMarkup(<NetworkInspector />);
    expect(htmlExt).toContain("Target 1.1.1.1");
    expect(htmlExt).toContain("EXTERNAL ENDPOINT");
    expect(htmlExt).toContain("WAN Target");

    // Unavailable entity
    networkWorkspaceStore.selectEntity("node", "non-existent-node");
    const htmlUnavailable = renderToStaticMarkup(<NetworkInspector />);
    expect(htmlUnavailable).toContain("Entity Unavailable");
  });
});
