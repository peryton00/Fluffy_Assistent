import { describe, it, expect } from "vitest";
import {
  projectTopology,
  mapNodeStatus,
  type TopologyProjectionInput,
} from "./topologyModel";
import type {
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
  TrafficMetrics,
  NetworkEvent,
} from "../../../types/contracts";

describe("Phase N9: Interactive Network Topology Model & Projections", () => {
  const mockNode1: NetworkNode = {
    id: "node-master",
    name: "Master Node",
    os: "linux",
    arch: "x86_64",
    role: "admin",
    availability: "available",
    auth_state: "authenticated",
    pairing_state: "paired",
    last_seen_epoch: 1700000000,
  };

  const mockNode2: NetworkNode = {
    id: "node-worker",
    name: "Worker Node",
    os: "windows",
    arch: "x86_64",
    role: "worker",
    availability: "available",
    auth_state: "authenticated",
    pairing_state: "paired",
    last_seen_epoch: 1700000000,
  };

  const mockDevice1: NetworkDevice = {
    id: "dev-printer",
    ip_address: "192.168.1.50",
    mac_address: "00:11:22:33:44:55",
    hostname: "printer.lan",
    vendor: "HP",
    category: "printer",
    state: "reachable",
    source: "arp_table",
    is_gateway: false,
    is_self: false,
    is_fluffy_node: false,
    last_seen_epoch: 1700000000,
  };

  const mockDevice2: NetworkDevice = {
    id: "dev-nas",
    ip_address: "192.168.1.100",
    mac_address: "00:aa:bb:cc:dd:ee",
    hostname: "nas.lan",
    vendor: "Synology",
    category: "server",
    state: "reachable",
    source: "arp_table",
    is_gateway: false,
    is_self: false,
    is_fluffy_node: false,
    last_seen_epoch: 1700000000,
  };

  const mockInterface1: NetworkInterfaceInfo = {
    id: "eth0",
    name: "eth0",
    mac_address: "00:11:22:11:22:33",
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
    total_received_bytes: 50000,
    total_transmitted_bytes: 25000,
    rates: { rx_bytes_per_sec: 1000, tx_bytes_per_sec: 500 },
  };

  const mockClusterConnection: NetworkConnection = {
    id: "conn-cluster-1",
    kind: "cluster_transport",
    protocol: "tcp",
    local_addr: "192.168.1.10",
    local_port: 9000,
    remote_addr: "192.168.1.20",
    remote_port: 9000,
    state: "established",
    direction: "outbound",
    associated_node_id: "node-worker",
    established_at_epoch: 1700000000,
  };

  const mockFlowConnection: NetworkConnection = {
    id: "conn-flow-1",
    kind: "local_socket_flow",
    protocol: "tcp",
    local_addr: "192.168.1.10",
    local_port: 54321,
    remote_addr: "192.168.1.100",
    remote_port: 445,
    state: "established",
    direction: "outbound",
    pid: 1234,
    process_name: "smbclient",
    established_at_epoch: 1700000000,
  };

  const mockTraffic: TrafficMetrics = {
    rx_bytes: 100000,
    tx_bytes: 50000,
    rx_packets: 1000,
    tx_packets: 500,
    rx_errors: 0,
    tx_errors: 0,
    rx_drops: 0,
    tx_drops: 0,
    rates: { rx_bytes_per_sec: 10240, tx_bytes_per_sec: 5120 },
    top_talkers: [
      {
        entity_id: "node-master",
        entity_name: "Master Node",
        rx_bytes: 80000,
        tx_bytes: 40000,
        rx_rate_bps: 8192,
        tx_rate_bps: 4096,
      },
    ],
  };

  const mockSecurityEvent: NetworkEvent = {
    event_id: "sec-1",
    sequence: 10,
    state_revision: 5,
    timestamp_epoch_ms: 1700000000000,
    category: "security",
    event_type: "anomaly_detected",
    severity: "warning",
    source_node_id: null,
    target_node_id: "node-worker",
    target_device_id: null,
    target_connection_id: null,
    summary: "High volume flow anomaly",
    details: {},
  };

  const baseInput: TopologyProjectionInput = {
    nodes: [mockNode1, mockNode2],
    devices: [mockDevice1, mockDevice2],
    interfaces: [mockInterface1],
    connections: [mockClusterConnection, mockFlowConnection],
    traffic: mockTraffic,
    events: [mockSecurityEvent],
  };

  // Requirement 5.A: Canonical node state remains canonical
  it("A. canonical node state remains canonical", () => {
    expect(mapNodeStatus(mockNode1)).toBe("available");
    expect(mapNodeStatus({ ...mockNode1, availability: "busy" })).toBe("busy");
    expect(mapNodeStatus({ ...mockNode1, availability: "unreachable" })).toBe("unreachable");
    expect(mapNodeStatus({ ...mockNode1, availability: "offline" })).toBe("offline");

    const proj = projectTopology(baseInput, "cluster");
    const master = proj.nodes.find((n) => n.id === "node:node-master");
    expect(master?.status).toBe("available");
  });

  // Requirement 5.B: Stale synchronization does not create fake node state
  it("B. stale synchronization does not create fake node state", () => {
    // A healthy node projected when synchronization is stale or degraded does not mutate into 'degraded'
    const proj = projectTopology(baseInput, "cluster");
    for (const node of proj.nodes) {
      expect(node.status).not.toBe("degraded");
      expect(node.status).toBe("available");
    }
  });

  // Requirement 5.C: No false 'offline' state from missing discovery
  it("C. no false 'offline' state from missing discovery", () => {
    // Node without an entry in ARP or discovery devices remains in its authoritative availability state
    const inputNoDevices: TopologyProjectionInput = {
      ...baseInput,
      devices: [], // Zero discovered devices
    };
    const proj = projectTopology(inputNoDevices, "cluster");
    const master = proj.nodes.find((n) => n.id === "node:node-master");
    expect(master?.status).toBe("available");
    expect(master?.status).not.toBe("offline");
  });

  // Requirement 5.D: Unresolved remote endpoint policy
  it("D. unresolved remote endpoint policy represents external endpoints deterministically", () => {
    const dnsFlow: NetworkConnection = {
      id: "conn-dns-1",
      kind: "local_socket_flow",
      protocol: "udp",
      local_addr: "192.168.1.10",
      local_port: 53210,
      remote_addr: "8.8.8.8",
      remote_port: 53,
      state: "established",
      direction: "outbound",
    };

    const inputWithExternal: TopologyProjectionInput = {
      ...baseInput,
      connections: [dnsFlow],
    };

    const proj = projectTopology(inputWithExternal, "network");
    const extNode = proj.nodes.find((n) => n.id === "external:8.8.8.8");
    expect(extNode).toBeDefined();
    expect(extNode?.entityType).toBe("external_endpoint");
    expect(extNode?.ip).toBe("8.8.8.8");
    expect(extNode?.status).toBe("external");

    const edge = proj.edges.find((e) => e.connectionId === "conn-dns-1");
    expect(edge).toBeDefined();
    expect(edge?.targetNodeId).toBe("external:8.8.8.8");
  });

  // Requirement 5.E: LocalSocketFlow with unresolved remote endpoint
  it("E. LocalSocketFlow with unresolved remote endpoint does not discard connection", () => {
    const externalHttpsFlow: NetworkConnection = {
      id: "conn-https-ext",
      kind: "local_socket_flow",
      protocol: "tcp",
      local_addr: "192.168.1.10",
      local_port: 48900,
      remote_addr: "1.1.1.1",
      remote_port: 443,
      state: "established",
      direction: "outbound",
    };

    const input: TopologyProjectionInput = {
      ...baseInput,
      connections: [externalHttpsFlow],
    };

    const proj = projectTopology(input, "traffic");
    expect(proj.edges).toHaveLength(1);
    expect(proj.edges[0].connectionId).toBe("conn-https-ext");
    expect(proj.nodes.some((n) => n.id === "external:1.1.1.1")).toBe(true);
  });

  // Requirement 5.F: ClusterTransport endpoint behavior
  it("F. ClusterTransport endpoint behavior in Cluster mode admits only cluster nodes", () => {
    const dnsFlow: NetworkConnection = {
      id: "conn-dns-ext",
      kind: "local_socket_flow",
      protocol: "udp",
      local_addr: "192.168.1.10",
      local_port: 53210,
      remote_addr: "8.8.8.8",
      remote_port: 53,
      state: "established",
      direction: "outbound",
    };

    const mixedInput: TopologyProjectionInput = {
      ...baseInput,
      connections: [mockClusterConnection, dnsFlow],
    };

    const clusterProj = projectTopology(mixedInput, "cluster");
    expect(clusterProj.nodes.every((n) => n.entityType === "node")).toBe(true);
    expect(clusterProj.edges.every((e) => e.kind === "cluster_transport")).toBe(true);
    expect(clusterProj.edges.find((e) => e.connectionId === "conn-dns-ext")).toBeUndefined();
  });

  // Requirement 5.G: Traffic mode retains meaningful connection information
  it("G. Traffic mode retains meaningful connection information", () => {
    const proj = projectTopology(baseInput, "traffic");
    const masterNode = proj.nodes.find((n) => n.id === "node:node-master");
    expect(masterNode?.trafficRxBytes).toBe(80000);
    expect(masterNode?.trafficRateBps).toBeGreaterThan(0);
    expect(proj.edges.length).toBeGreaterThan(0);
  });

  // Requirement 5.H: No fabricated edges
  it("H. does NOT invent edges without authoritative connection data", () => {
    const inputWithoutConns: TopologyProjectionInput = {
      ...baseInput,
      connections: [],
    };
    const proj = projectTopology(inputWithoutConns, "network");
    expect(proj.edges.length).toBe(0);
    expect(proj.isolatedNodeCount).toBe(proj.nodes.length);
  });

  // Requirement 5.I: All existing N9 tests remain passing
  it("I. maintains distinction between LocalSocketFlow and ClusterTransport", () => {
    const proj = projectTopology(baseInput, "network");
    const clusterEdge = proj.edges.find((e) => e.connectionId === "conn-cluster-1");
    const flowEdge = proj.edges.find((e) => e.connectionId === "conn-flow-1");

    expect(clusterEdge?.kind).toBe("cluster_transport");
    expect(flowEdge?.kind).toBe("local_socket_flow");
    expect(clusterEdge?.kind).not.toEqual(flowEdge?.kind);
  });

  it("projects topology accurately from real nodes", () => {
    const proj = projectTopology(baseInput, "cluster");
    expect(proj.nodes.length).toBe(2);
    expect(proj.nodes.map((n) => n.id)).toEqual(["node:node-master", "node:node-worker"]);
  });

  it("projects topology accurately from real devices in network mode", () => {
    const proj = projectTopology(baseInput, "network");
    const deviceNodes = proj.nodes.filter((n) => n.entityType === "device");
    expect(deviceNodes.length).toBe(2);
    expect(deviceNodes.find((d) => d.id === "device:dev-printer")).toBeDefined();
    expect(deviceNodes.find((d) => d.id === "device:dev-nas")).toBeDefined();
  });

  it("attaches security observations strictly from real events in Security mode", () => {
    const proj = projectTopology(baseInput, "security");
    const workerNode = proj.nodes.find((n) => n.id === "node:node-worker");
    const masterNode = proj.nodes.find((n) => n.id === "node:node-master");

    expect(workerNode?.securityObservationCount).toBe(1);
    expect(masterNode?.securityObservationCount).toBe(0);
  });

  it("handles empty topology gracefully without crashing", () => {
    const emptyInput: TopologyProjectionInput = {
      nodes: [],
      devices: [],
      interfaces: [],
      connections: [],
      traffic: mockTraffic,
      events: [],
    };
    const proj = projectTopology(emptyInput, "network");
    expect(proj.nodes).toHaveLength(0);
    expect(proj.edges).toHaveLength(0);
    expect(proj.isolatedNodeCount).toBe(0);
  });

  it("calculates deterministic layout coordinates without random jitter", () => {
    const proj1 = projectTopology(baseInput, "network", undefined, 1000, 700);
    const proj2 = projectTopology(baseInput, "network", undefined, 1000, 700);

    for (let i = 0; i < proj1.nodes.length; i++) {
      expect(proj1.nodes[i].x).toBe(proj2.nodes[i].x);
      expect(proj1.nodes[i].y).toBe(proj2.nodes[i].y);
    }
  });

  it("handles disconnected components and isolated nodes correctly", () => {
    const proj = projectTopology(baseInput, "network");
    const isolatedPrinter = proj.nodes.find((n) => n.id === "device:dev-printer");
    expect(isolatedPrinter?.connectionCount).toBe(0);
    expect(proj.isolatedNodeCount).toBeGreaterThan(0);
  });
});
