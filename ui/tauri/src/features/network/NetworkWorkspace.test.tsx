import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkWorkspace } from "./NetworkWorkspace";
import {
  NetworkOverview,
  NetworkSystemsView,
  NetworkTopologyView,
  NetworkTrafficView,
  NetworkEventsView,
  NetworkSecurityView,
  NetworkInterfacesView,
} from "./views";
import { networkWorkspaceStore } from "../../stores/networkWorkspaceStore";
import { uiStore } from "../../stores/uiStore";
import * as networkApi from "../../services/api/networkApi";
import { networkEventsService } from "../../services/websocket/networkEvents";
import type { NetworkStateSnapshot } from "../../types/contracts";

const mockSnapshot: NetworkStateSnapshot = {
  revision: 88,
  captured_at_epoch_ms: 1700000000000,
  nodes: [
    {
      id: "node-alpha",
      name: "Fluffy Primary Alpha",
      os: "windows",
      arch: "x86_64",
      role: "admin",
      availability: "available",
      auth_state: "authenticated",
      pairing_state: "paired",
      last_seen_epoch: 1700000000,
    },
    {
      id: "node-beta",
      name: "Fluffy Worker Beta",
      os: "linux",
      arch: "aarch64",
      role: "worker",
      availability: "available",
      auth_state: "authenticated",
      pairing_state: "paired",
      last_seen_epoch: 1700000000,
    },
  ],
  devices: [
    {
      id: "dev-mac-11:22:33:44:55:66",
      ip_address: "192.168.1.75",
      mac_address: "11:22:33:44:55:66",
      hostname: "nas-storage.local",
      vendor: "Synology",
      category: "server",
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
      id: "conn-alpha-beta",
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
      name: "Ethernet0",
      mac_address: "00:50:56:c0:00:01",
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
      total_received_bytes: 10485760,
      total_transmitted_bytes: 5242880,
      rates: {
        rx_bytes_per_sec: 30720,
        tx_bytes_per_sec: 15360,
      },
    },
  ],
  traffic: {
    rx_bytes: 10485760,
    tx_bytes: 5242880,
    rx_packets: 10000,
    tx_packets: 5000,
    rx_errors: 0,
    tx_errors: 0,
    rx_drops: 0,
    tx_drops: 0,
    rates: {
      rx_bytes_per_sec: 30720,
      tx_bytes_per_sec: 15360,
    },
    top_talkers: [
      {
        entity_id: "node-alpha",
        entity_name: "Fluffy Primary Alpha",
        rx_bytes: 10485760,
        tx_bytes: 5242880,
        rx_rate_bps: 30720,
        tx_rate_bps: 15360,
      },
    ],
  },
};

describe("Network Workspace UI Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(networkApi, "fetchNetworkSnapshot").mockResolvedValue(mockSnapshot);
    vi.spyOn(networkEventsService, "connect").mockImplementation(async () => {});
    networkWorkspaceStore.applySnapshot(mockSnapshot);
    uiStore.setActiveDomain("network");
    uiStore.setActiveSidebarView("overview");
  });

  afterEach(() => {
    networkWorkspaceStore.destroy();
    vi.restoreAllMocks();
  });

  it("1. renders NetworkWorkspace shell header with revision and sync status", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkWorkspace));

    expect(html).toContain("Network Operations");
    expect(html).toContain("overview");
    expect(html).toContain("r88");
    expect(html).toContain("Resync");
  });

  it("2. renders NetworkOverview with operational KPI summaries and talkers", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkOverview));

    expect(html).toContain("Authoritative Network State Synced");
    expect(html).toContain("Cluster Nodes");
    expect(html).toContain("Subnet Devices");
    expect(html).toContain("Active Flows");
    expect(html).toContain("Host Adapters");
    expect(html).toContain("Fluffy Primary Alpha");
    expect(html).toContain("Prominent Traffic Generators (Top Talkers)");
  });

  it("3. renders NetworkSystemsView distinguishing Cluster Nodes from Discovered Devices", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkSystemsView));

    expect(html).toContain("Fluffy Cluster Nodes");
    expect(html).toContain("Fluffy Primary Alpha");
    expect(html).toContain("Fluffy Worker Beta");
    expect(html).toContain("Fluffy Cluster Nodes (2)");
    expect(html).toContain("Discovered Network Devices (1)");
    expect(html).toContain("nas-storage.local");
    expect(html).toContain("11:22:33:44:55:66");
  });

  it("4. renders NetworkTopologyView with interactive topology surface and modes", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkTopologyView));

    expect(html).toContain("Interactive Network Topology");
    expect(html).toContain("Cluster");
    expect(html).toContain("Network");
    expect(html).toContain("Traffic");
    expect(html).toContain("Security");
    expect(html).toContain("Observed Entities");
    expect(html).toContain("Fluffy Primary Alpha");
    expect(html).toContain("nas-storage.local");
  });

  it("5. renders NetworkTrafficView with telemetry rates and socket connections", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkTrafficView));

    expect(html).toContain("Aggregate Traffic Throughput");
    expect(html).toContain("Total Received (RX)");
    expect(html).toContain("Total Transmitted (TX)");
    expect(html).toContain("Active Socket Flows");
    expect(html).toContain("192.168.1.10:9000");
    expect(html).toContain("192.168.1.20:9000");
  });

  it("6. renders NetworkEventsView with live event stream and sequence info", () => {
    networkWorkspaceStore.applyEvent({
      event_id: "evt-test-1",
      sequence: 501,
      state_revision: 89,
      timestamp_epoch_ms: 1700000010000,
      severity: "info",
      category: "cluster",
      event_type: "NodeDiscovered",
      target_node_id: "node-alpha",
      summary: "Node alpha joined cluster",
      details: { name: "Fluffy Primary Alpha" },
    });

    const html = renderToStaticMarkup(React.createElement(NetworkEventsView));

    expect(html).toContain("Live Network Event Stream");
    expect(html).toContain("NodeDiscovered");
    expect(html).toContain("#501");
    expect(html).toContain("CLUSTER");
  });

  it("7. renders NetworkSecurityView with security observations", () => {
    networkWorkspaceStore.applyEvent({
      event_id: "evt-sec-test",
      sequence: 502,
      state_revision: 90,
      timestamp_epoch_ms: 1700000020000,
      severity: "critical",
      category: "security",
      event_type: "SecurityObservationRecorded",
      target_device_id: "dev-mac-11:22:33:44:55:66",
      summary: "Unauthorized probe detected on port 9000",
      details: {
        observation_type: "unauthorized_probe",
        details: "Port probe on port 9000",
      },
    });

    const html = renderToStaticMarkup(React.createElement(NetworkSecurityView));

    expect(html).toContain("Network Security Observations");
    expect(html).toContain("Security Observations &amp; Events");
    expect(html).toContain("SecurityObservationRecorded");
    expect(html).toContain("CRITICAL");
  });

  it("8. renders NetworkInterfacesView with host adapters and IP/MAC info", () => {
    const html = renderToStaticMarkup(React.createElement(NetworkInterfacesView));

    expect(html).toContain("Host Network Adapters");
    expect(html).toContain("Ethernet0");
    expect(html).toContain("00:50:56:c0:00:01");
    expect(html).toContain("192.168.1.10/24");
    expect(html).toContain("1500 B");
  });

  it("9. switches views dynamically in NetworkWorkspace router", () => {
    uiStore.setActiveSidebarView("systems");
    let html = renderToStaticMarkup(React.createElement(NetworkWorkspace));
    expect(html).toContain("Fluffy Cluster Nodes");

    uiStore.setActiveSidebarView("topology");
    html = renderToStaticMarkup(React.createElement(NetworkWorkspace));
    expect(html).toContain("Interactive Network Topology");

    uiStore.setActiveSidebarView("traffic");
    html = renderToStaticMarkup(React.createElement(NetworkWorkspace));
    expect(html).toContain("Aggregate Traffic Throughput");

    uiStore.setActiveSidebarView("events");
    html = renderToStaticMarkup(React.createElement(NetworkWorkspace));
    expect(html).toContain("Live Network Event Stream");

    uiStore.setActiveSidebarView("security");
    html = renderToStaticMarkup(React.createElement(NetworkWorkspace));
    expect(html).toContain("Network Security Observations");

    uiStore.setActiveSidebarView("interfaces");
    html = renderToStaticMarkup(React.createElement(NetworkWorkspace));
    expect(html).toContain("Host Network Adapters");
  });

  it("10. renders stale/degraded banner when event lag occurs", () => {
    networkWorkspaceStore.markStale();
    const html = renderToStaticMarkup(React.createElement(NetworkWorkspace));

    expect(html).toContain("Event Lag Detected");
    expect(html).toContain("degraded");
  });

  it("11. displays shared entity selection chip when an entity is selected", () => {
    networkWorkspaceStore.selectEntity({ type: "node", id: "node-alpha" });
    const html = renderToStaticMarkup(React.createElement(NetworkWorkspace));

    expect(html).toContain("Selected: node:node-alpha");
  });
});
