import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchNetworkSnapshot,
  fetchNetworkNodes,
  fetchNetworkNode,
  fetchNetworkDevices,
  fetchNetworkDevice,
  fetchNetworkConnections,
  fetchNetworkInterfaces,
  fetchNetworkTraffic,
  fetchNetworkCapabilities,
  connectNode,
  disconnectNode,
  getConnectionInfo,
  executeAdminCommand,
  executeBatchAdminCommand,
  setNetworkApiTransport,
  resetNetworkApiTransport,
} from "./networkApi";
import { apiClient } from "./client";
import type {
  NetworkStateSnapshot,
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
} from "../../types/contracts";

describe("NetworkApi Transport & Contract Adapter", () => {
  const mockNode: NetworkNode = {
    id: "node-1",
    name: "Test Node",
    os: "linux",
    arch: "x86_64",
    role: "worker",
    availability: "available",
    auth_state: "authenticated",
    pairing_state: "paired",
    last_seen_epoch: 1700000000,
  };

  const mockDevice: NetworkDevice = {
    id: "dev-1",
    ip_address: "192.168.1.100",
    mac_address: "00:11:22:33:44:55",
    hostname: "device.lan",
    vendor: null,
    category: "workstation",
    state: "reachable",
    source: "arp_table",
    is_gateway: false,
    is_self: false,
    is_fluffy_node: false,
    last_seen_epoch: 1700000000,
  };

  const mockConnection: NetworkConnection = {
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
    dns_servers: ["192.168.1.1"],
    mtu: 1500,
    total_received_bytes: 2048,
    total_transmitted_bytes: 1024,
    rates: null,
  };

  const mockSnapshot: NetworkStateSnapshot = {
    revision: 10,
    captured_at_epoch_ms: 1700000000000,
    nodes: [mockNode],
    devices: [mockDevice],
    connections: [mockConnection],
    interfaces: [mockInterface],
    traffic: {
      rx_bytes: 1024,
      tx_bytes: 512,
      rx_packets: 10,
      tx_packets: 5,
      rx_errors: 0,
      tx_errors: 0,
      rx_drops: 0,
      tx_drops: 0,
      rates: null,
      top_talkers: [],
    },
  };

  afterEach(() => {
    resetNetworkApiTransport();
    vi.restoreAllMocks();
  });

  it("fetches snapshot and all individual domains via custom transport adapter", async () => {
    setNetworkApiTransport({
      getSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
      getNodes: vi.fn().mockResolvedValue({ revision: 10, nodes: [mockNode] }),
      getNode: vi.fn().mockResolvedValue({ revision: 10, node: mockNode }),
      getDevices: vi.fn().mockResolvedValue({ revision: 10, devices: [mockDevice] }),
      getDevice: vi.fn().mockResolvedValue({ revision: 10, device: mockDevice }),
      getConnections: vi.fn().mockResolvedValue({ revision: 10, connections: [mockConnection] }),
      getInterfaces: vi.fn().mockResolvedValue({ revision: 10, interfaces: [mockInterface] }),
      getTraffic: vi.fn().mockResolvedValue({ revision: 10, traffic: mockSnapshot.traffic }),
      getCapabilities: vi.fn().mockResolvedValue({
        protocol_version: { major: 1, minor: 0 },
        subsystem_available: true,
        supported_read_operations: ["snapshot", "nodes", "devices", "connections", "interfaces", "traffic"],
        supported_event_categories: ["cluster", "network"],
        supported_connection_kinds: ["cluster_transport"],
        supported_node_roles: ["worker"],
        telemetry_supported: true,
        event_buffer_capacity: 1024,
      }),
    });

    const snapshot = await fetchNetworkSnapshot();
    expect(snapshot.revision).toBe(10);
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.devices).toHaveLength(1);

    const nodesRes = await fetchNetworkNodes();
    expect(nodesRes.nodes).toHaveLength(1);

    const nodeRes = await fetchNetworkNode("node-1");
    expect(nodeRes.node.name).toBe("Test Node");

    const devsRes = await fetchNetworkDevices();
    expect(devsRes.devices).toHaveLength(1);

    const devRes = await fetchNetworkDevice("dev-1");
    expect(devRes.device.ip_address).toBe("192.168.1.100");

    const connsRes = await fetchNetworkConnections();
    expect(connsRes.connections).toHaveLength(1);

    const ifacesRes = await fetchNetworkInterfaces();
    expect(ifacesRes.interfaces).toHaveLength(1);

    const trafficRes = await fetchNetworkTraffic();
    expect(trafficRes.traffic.rx_bytes).toBe(1024);
  });

  it("unwraps standardized ApiResponse envelope from HTTP client", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      ok: true,
      data: mockSnapshot,
    });

    const snapshot = await fetchNetworkSnapshot();
    expect(snapshot.revision).toBe(10);
    expect(snapshot.nodes[0].id).toBe("node-1");
  });

  it("handles flat snapshot responses from HTTP client directly", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce(mockSnapshot);

    const snapshot = await fetchNetworkSnapshot();
    expect(snapshot.revision).toBe(10);
    expect(snapshot.nodes[0].id).toBe("node-1");
  });

  it("fetches capabilities and unwraps default metadata safely", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      ok: true,
      data: {
        protocol_version: { major: 1, minor: 0 },
        subsystem_available: true,
        supported_read_operations: ["snapshot"],
        supported_event_categories: ["cluster"],
        supported_connection_kinds: ["cluster_transport"],
        supported_node_roles: ["worker"],
        telemetry_supported: true,
        event_buffer_capacity: 1024,
      },
    });

    const caps = await fetchNetworkCapabilities();
    expect(caps.subsystem_available).toBe(true);
    expect(caps.protocol_version.major).toBe(1);
  });

  it("connectNode posts to /network/connect and unwraps response", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      revision: 11,
      node: { ...mockNode, availability: "connected", auth_state: "authenticated", pairing_state: "paired" },
      connection: mockConnection,
    });

    const res = await connectNode("node-1");
    expect(res.revision).toBe(11);
    expect(res.node.availability).toBe("connected");
    expect(res.connection?.id).toBe("conn-1");
  });

  it("disconnectNode posts to /network/disconnect and unwraps response", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      revision: 12,
      node: { ...mockNode, availability: "disconnected", auth_state: "unauthenticated", pairing_state: "unpaired" },
    });

    const res = await disconnectNode("node-1");
    expect(res.revision).toBe(12);
    expect(res.node.availability).toBe("disconnected");
  });

  it("getConnectionInfo fetches projection from /network/nodes/:id/connection-info", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      revision: 13,
      info: {
        node_id: "node-1",
        node_name: "Test Node",
        availability: "connected",
        pairing_state: "paired",
        auth_state: "authenticated",
        transport_mode: "legacy_compatibility",
        auth_mode: "compatibility",
      },
    });

    const res = await getConnectionInfo("node-1");
    expect(res.revision).toBe(13);
    expect(res.info.node_id).toBe("node-1");
    expect(res.info.transport_mode).toBe("legacy_compatibility");
  });

  it("executeAdminCommand posts single command and unwraps result", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      result: {
        request_id: "req-cmd-1",
        target_node_id: "node-1",
        capability_id: "System.GetHardware",
        success: true,
        data: { os: "linux", arch: "x86_64" },
        execution_duration_ms: 25,
        timestamp_epoch_ms: 1700000000000,
      },
    });

    const res = await executeAdminCommand({
      request_id: "req-cmd-1",
      target_node_id: "node-1",
      capability: { id: "System.GetHardware", parameters: {} },
    });
    expect(res.request_id).toBe("req-cmd-1");
    expect(res.success).toBe(true);
    expect(res.capability_id).toBe("System.GetHardware");
    expect((res.data as any).os).toBe("linux");
  });

  it("executeBatchAdminCommand posts batch command and unwraps aggregated result", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      result: {
        batch_id: "batch-1",
        total_targets: 2,
        successful_targets: 2,
        failed_targets: 0,
        results: [
          {
            request_id: "batch-1_node-1",
            target_node_id: "node-1",
            capability_id: "System.GetHardware",
            success: true,
            data: {},
            execution_duration_ms: 30,
            timestamp_epoch_ms: 1700000000000,
          },
          {
            request_id: "batch-1_node-2",
            target_node_id: "node-2",
            capability_id: "System.GetHardware",
            success: true,
            data: {},
            execution_duration_ms: 35,
            timestamp_epoch_ms: 1700000000000,
          },
        ],
        total_duration_ms: 40,
        timestamp_epoch_ms: 1700000000000,
      },
    });

    const res = await executeBatchAdminCommand({
      batch_id: "batch-1",
      target_node_ids: ["node-1", "node-2"],
      capability: { id: "System.GetHardware", parameters: {} },
    });
    expect(res.batch_id).toBe("batch-1");
    expect(res.total_targets).toBe(2);
    expect(res.successful_targets).toBe(2);
    expect(res.results).toHaveLength(2);
  });
});


