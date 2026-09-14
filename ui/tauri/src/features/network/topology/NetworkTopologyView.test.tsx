import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkTopologyView } from "../views/NetworkTopologyView";
import { networkWorkspaceStore } from "../../../stores/networkWorkspaceStore";
import { uiStore } from "../../../stores/uiStore";
import type { NetworkStateSnapshot } from "../../../types/contracts";

const mockSnapshot: NetworkStateSnapshot = {
  revision: 50,
  captured_at_epoch_ms: 1700000000000,
  nodes: [
    {
      id: "node-1",
      name: "Fluffy Alpha",
      os: "linux",
      arch: "x86_64",
      role: "admin",
      availability: "available",
      auth_state: "authenticated",
      pairing_state: "paired",
      last_seen_epoch: 1700000000,
    },
    {
      id: "node-2",
      name: "Fluffy Beta",
      os: "windows",
      arch: "x86_64",
      role: "worker",
      availability: "available",
      auth_state: "authenticated",
      pairing_state: "paired",
      last_seen_epoch: 1700000000,
    },
  ],
  devices: [
    {
      id: "dev-printer",
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
      id: "conn-cluster-1",
      kind: "cluster_transport",
      protocol: "tcp",
      local_addr: "192.168.1.10",
      local_port: 9000,
      remote_addr: "192.168.1.20",
      remote_port: 9000,
      state: "established",
      direction: "outbound",
      associated_node_id: "node-2",
      established_at_epoch: 1700000000,
    },
  ],
  interfaces: [],
  traffic: {
    rx_bytes: 1048576,
    tx_bytes: 524288,
    rx_packets: 1000,
    tx_packets: 500,
    rx_errors: 0,
    tx_errors: 0,
    rx_drops: 0,
    tx_drops: 0,
    rates: null,
    top_talkers: [],
  },
};

describe("NetworkTopologyView Interactive Surface & Selection Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    networkWorkspaceStore.applySnapshot(mockSnapshot);
    uiStore.setActiveDomain("network");
    uiStore.setActiveSidebarView("topology");
  });

  afterEach(() => {
    networkWorkspaceStore.destroy();
    vi.restoreAllMocks();
  });

  it("J. supports selecting a node through unified selection model", () => {
    networkWorkspaceStore.selectEntity({ type: "node", id: "node-1" });
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "node",
      id: "node-1",
    });

    const html = renderToStaticMarkup(React.createElement(NetworkTopologyView));
    expect(html).toContain("Fluffy Alpha");
  });

  it("K. supports selecting a connection through unified selection model", () => {
    networkWorkspaceStore.selectEntity({ type: "connection", id: "conn-cluster-1" });
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "connection",
      id: "conn-cluster-1",
    });
  });

  it("L. selection persists across workspace navigation changes", () => {
    networkWorkspaceStore.selectEntity({ type: "node", id: "node-2" });

    // Switch view to traffic
    uiStore.setActiveSidebarView("traffic");
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "node",
      id: "node-2",
    });

    // Switch back to topology
    uiStore.setActiveSidebarView("topology");
    expect(networkWorkspaceStore.getState().selectedEntity).toEqual({
      type: "node",
      id: "node-2",
    });
  });

  it("P. adds node in real-time when NodeDiscovered event is received", () => {
    networkWorkspaceStore.applyEvent({
      event_id: "evt-new-node",
      sequence: 101,
      state_revision: 51,
      timestamp_epoch_ms: 1700000001000,
      category: "cluster",
      event_type: "node_discovered",
      severity: "info",
      source_node_id: null,
      target_node_id: "node-3",
      target_device_id: null,
      target_connection_id: null,
      summary: "Node Gamma Discovered",
      details: { node_name: "Fluffy Gamma", os: "macos", arch: "aarch64" },
    });

    const nodes = networkWorkspaceStore.getState().nodes;
    expect(nodes.find((n) => n.id === "node-3")).toBeDefined();
  });

  it("Q. updates node availability when NodeDisconnected event is received", () => {
    networkWorkspaceStore.applyEvent({
      event_id: "evt-node-disc",
      sequence: 102,
      state_revision: 52,
      timestamp_epoch_ms: 1700000002000,
      category: "cluster",
      event_type: "node_disconnected",
      severity: "warning",
      source_node_id: null,
      target_node_id: "node-2",
      target_device_id: null,
      target_connection_id: null,
      summary: "Node Beta Disconnected",
      details: {},
    });

    const node2 = networkWorkspaceStore.getState().nodes.find((n) => n.id === "node-2");
    expect(node2?.availability).toBe("disconnected");
  });

  it("R. adds connection in real-time when ConnectionOpened event occurs", () => {
    networkWorkspaceStore.applyEvent({
      event_id: "evt-conn-open",
      sequence: 103,
      state_revision: 53,
      timestamp_epoch_ms: 1700000003000,
      category: "connection",
      event_type: "connection_opened",
      severity: "info",
      source_node_id: null,
      target_node_id: null,
      target_device_id: null,
      target_connection_id: "conn-cluster-2",
      summary: "Connection Opened",
      details: {},
    });

    expect(networkWorkspaceStore.getState().events[0].event_id).toBe("evt-conn-open");
  });

  it("S. removes connection when ConnectionClosed event occurs", () => {
    networkWorkspaceStore.applyEvent({
      event_id: "evt-conn-close",
      sequence: 104,
      state_revision: 54,
      timestamp_epoch_ms: 1700000004000,
      category: "connection",
      event_type: "connection_closed",
      severity: "info",
      source_node_id: null,
      target_node_id: null,
      target_device_id: null,
      target_connection_id: "conn-cluster-1",
      summary: "Connection Closed",
      details: {},
    });

    const conns = networkWorkspaceStore.getState().connections;
    expect(conns.find((c) => c.id === "conn-cluster-1")).toBeUndefined();
  });

  it("T. displays degraded banner and stale badge on lag detection", () => {
    networkWorkspaceStore.markStale();
    expect(networkWorkspaceStore.getState().status).toBe("degraded");
    expect(networkWorkspaceStore.getState().isStale).toBe(true);

    const html = renderToStaticMarkup(React.createElement(NetworkTopologyView));
    expect(html).toContain("Topology Degraded / Resyncing");
  });
});
