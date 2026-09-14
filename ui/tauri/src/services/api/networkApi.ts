/**
 * Fluffy Desktop - Network API & Contracts Client Service (Phase N7 / N8)
 * 
 * Provides typed wrappers for the authoritative Rust Network API:
 * - Snapshot retrieval: Coherent point-in-time snapshot
 * - Nodes: Authoritative cluster nodes
 * - Devices: Discovered network devices
 * - Connections: Active network connections & flows
 * - Interfaces: Host network interface adapters
 * - Traffic: Aggregate traffic metrics & rates
 * - Capabilities: Subsystem capabilities metadata
 * 
 * Transport Boundary Adapter:
 * 1. Tauri IPC: If running inside Tauri host runtime, attempts native invoke() commands.
 * 2. HTTP Client: Falls back to REST queries via apiClient if available.
 * 3. Typed Envelopes: Unwraps standardized N7 NetworkApiResponse<T> envelopes safely.
 * 
 * Zero Emojis, Zero N9+ functionality.
 */

import { apiClient, type RequestOptions } from "./client";
import type {
  NetworkStateSnapshot,
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
  TrafficMetrics,
  NetworkCapabilitiesMetadata,
  ConnectNodeResponse,
  DisconnectNodeResponse,
  GetConnectionInfoResponse,
  AdminCommandRequest,
  AdminCommandResult,
  AdminBatchCommandRequest,
  AdminBatchCommandResult,
  ExecuteAdminCommandResponse,
  ExecuteBatchAdminCommandResponse,
} from "../../types/contracts";

export interface ApiResponse<T> {
  ok?: boolean;
  success?: boolean;
  data?: T;
  snapshot?: T;
  revision?: number;
  nodes?: NetworkNode[];
  devices?: NetworkDevice[];
  connections?: NetworkConnection[];
  interfaces?: NetworkInterfaceInfo[];
  traffic?: TrafficMetrics;
  capabilities?: NetworkCapabilitiesMetadata;
  info?: unknown;
  node?: NetworkNode;
  connection?: NetworkConnection | null;
  result?: unknown;
  error?: unknown;
}

export type NetworkApiTransport = {
  getSnapshot: (options?: RequestOptions) => Promise<NetworkStateSnapshot>;
  getNodes: (options?: RequestOptions) => Promise<{ revision: number; nodes: NetworkNode[] }>;
  getNode: (id: string, options?: RequestOptions) => Promise<{ revision: number; node: NetworkNode }>;
  getDevices: (options?: RequestOptions) => Promise<{ revision: number; devices: NetworkDevice[] }>;
  getDevice: (id: string, options?: RequestOptions) => Promise<{ revision: number; device: NetworkDevice }>;
  getConnections: (options?: RequestOptions) => Promise<{ revision: number; connections: NetworkConnection[] }>;
  getInterfaces: (options?: RequestOptions) => Promise<{ revision: number; interfaces: NetworkInterfaceInfo[] }>;
  getTraffic: (options?: RequestOptions) => Promise<{ revision: number; traffic: TrafficMetrics }>;
  getCapabilities: (options?: RequestOptions) => Promise<NetworkCapabilitiesMetadata>;
  connectNode?: (nodeId: string, options?: RequestOptions) => Promise<ConnectNodeResponse>;
  disconnectNode?: (nodeId: string, options?: RequestOptions) => Promise<DisconnectNodeResponse>;
  getConnectionInfo?: (nodeId: string, options?: RequestOptions) => Promise<GetConnectionInfoResponse>;
  executeAdminCommand?: (request: AdminCommandRequest, options?: RequestOptions) => Promise<AdminCommandResult>;
  executeBatchAdminCommand?: (request: AdminBatchCommandRequest, options?: RequestOptions) => Promise<AdminBatchCommandResult>;
};

let customTransport: NetworkApiTransport | null = null;

export function setNetworkApiTransport(transport: NetworkApiTransport | null): void {
  customTransport = transport;
}

export function resetNetworkApiTransport(): void {
  customTransport = null;
}

/**
 * Checks whether the environment is running inside a native Tauri desktop container.
 */
function isTauriEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/**
 * Invokes a Tauri command safely if available.
 */
async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriEnvironment()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch {
    return null;
  }
}

/**
 * Fetches a point-in-time coherent snapshot of authoritative NetworkState.
 */
export async function fetchNetworkSnapshot(options?: RequestOptions): Promise<NetworkStateSnapshot> {
  if (customTransport) {
    return customTransport.getSnapshot(options);
  }

  // 1. Attempt native Tauri IPC invoke
  const ipcResult = await invokeTauri<NetworkStateSnapshot | ApiResponse<NetworkStateSnapshot>>("get_network_snapshot");
  if (ipcResult) {
    if ("nodes" in ipcResult && "devices" in ipcResult && "connections" in ipcResult) {
      return ipcResult as NetworkStateSnapshot;
    }
    const env = ipcResult as ApiResponse<NetworkStateSnapshot>;
    if (env.data) return env.data;
    if (env.snapshot) return env.snapshot;
  }

  // 2. Fall back to HTTP apiClient
  const res = await apiClient.get<ApiResponse<NetworkStateSnapshot> | NetworkStateSnapshot>(
    "/network/snapshot",
    options
  );

  if ("nodes" in res && "devices" in res && "connections" in res) {
    return res as NetworkStateSnapshot;
  }

  const envelope = res as ApiResponse<NetworkStateSnapshot>;
  if (envelope.data) {
    return envelope.data;
  }
  if (envelope.snapshot) {
    return envelope.snapshot;
  }

  return {
    revision: envelope.revision ?? 0,
    captured_at_epoch_ms: Date.now(),
    nodes: envelope.nodes ?? [],
    devices: envelope.devices ?? [],
    connections: envelope.connections ?? [],
    interfaces: envelope.interfaces ?? [],
    traffic: envelope.traffic ?? {
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
}

/**
 * Fetches all authoritative cluster nodes.
 */
export async function fetchNetworkNodes(
  options?: RequestOptions
): Promise<{ revision: number; nodes: NetworkNode[] }> {
  if (customTransport) {
    return customTransport.getNodes(options);
  }

  const ipcResult = await invokeTauri<{ revision: number; nodes: NetworkNode[] } | ApiResponse<NetworkNode[]>>("get_network_nodes");
  if (ipcResult) {
    if ("nodes" in ipcResult && Array.isArray(ipcResult.nodes)) {
      return ipcResult as { revision: number; nodes: NetworkNode[] };
    }
    const env = ipcResult as ApiResponse<NetworkNode[]>;
    return {
      revision: env.revision ?? 0,
      nodes: env.data ?? env.nodes ?? [],
    };
  }

  const res = await apiClient.get<ApiResponse<NetworkNode[]> | { revision: number; nodes: NetworkNode[] }>(
    "/network/nodes",
    options
  );
  if ("nodes" in res && Array.isArray(res.nodes)) {
    return res as { revision: number; nodes: NetworkNode[] };
  }
  const envelope = res as ApiResponse<NetworkNode[]>;
  return {
    revision: envelope.revision ?? 0,
    nodes: envelope.data ?? envelope.nodes ?? [],
  };
}

/**
 * Fetches a single cluster node by NodeId.
 */
export async function fetchNetworkNode(
  id: string,
  options?: RequestOptions
): Promise<{ revision: number; node: NetworkNode }> {
  if (customTransport) {
    return customTransport.getNode(id, options);
  }

  const ipcResult = await invokeTauri<{ revision: number; node: NetworkNode } | ApiResponse<NetworkNode>>("get_network_node", { id });
  if (ipcResult) {
    if ("node" in ipcResult) {
      return ipcResult as { revision: number; node: NetworkNode };
    }
    const env = ipcResult as ApiResponse<NetworkNode>;
    if (env.data) {
      return { revision: env.revision ?? 0, node: env.data };
    }
  }

  const res = await apiClient.get<ApiResponse<NetworkNode> | { revision: number; node: NetworkNode }>(
    `/network/nodes/${encodeURIComponent(id)}`,
    options
  );
  if ("node" in res) {
    return res as { revision: number; node: NetworkNode };
  }
  const envelope = res as ApiResponse<NetworkNode>;
  return {
    revision: envelope.revision ?? 0,
    node: envelope.data as NetworkNode,
  };
}

/**
 * Fetches all discovered network devices.
 */
export async function fetchNetworkDevices(
  options?: RequestOptions
): Promise<{ revision: number; devices: NetworkDevice[] }> {
  if (customTransport) {
    return customTransport.getDevices(options);
  }

  const ipcResult = await invokeTauri<{ revision: number; devices: NetworkDevice[] } | ApiResponse<NetworkDevice[]>>("get_network_devices");
  if (ipcResult) {
    if ("devices" in ipcResult && Array.isArray(ipcResult.devices)) {
      return ipcResult as { revision: number; devices: NetworkDevice[] };
    }
    const env = ipcResult as ApiResponse<NetworkDevice[]>;
    return {
      revision: env.revision ?? 0,
      devices: env.data ?? env.devices ?? [],
    };
  }

  const res = await apiClient.get<ApiResponse<NetworkDevice[]> | { revision: number; devices: NetworkDevice[] }>(
    "/network/devices",
    options
  );
  if ("devices" in res && Array.isArray(res.devices)) {
    return res as { revision: number; devices: NetworkDevice[] };
  }
  const envelope = res as ApiResponse<NetworkDevice[]>;
  return {
    revision: envelope.revision ?? 0,
    devices: envelope.data ?? envelope.devices ?? [],
  };
}

/**
 * Fetches a single discovered device by DeviceId.
 */
export async function fetchNetworkDevice(
  id: string,
  options?: RequestOptions
): Promise<{ revision: number; device: NetworkDevice }> {
  if (customTransport) {
    return customTransport.getDevice(id, options);
  }

  const ipcResult = await invokeTauri<{ revision: number; device: NetworkDevice } | ApiResponse<NetworkDevice>>("get_network_device", { id });
  if (ipcResult) {
    if ("device" in ipcResult) {
      return ipcResult as { revision: number; device: NetworkDevice };
    }
    const env = ipcResult as ApiResponse<NetworkDevice>;
    if (env.data) {
      return { revision: env.revision ?? 0, device: env.data };
    }
  }

  const res = await apiClient.get<ApiResponse<NetworkDevice> | { revision: number; device: NetworkDevice }>(
    `/network/devices/${encodeURIComponent(id)}`,
    options
  );
  if ("device" in res) {
    return res as { revision: number; device: NetworkDevice };
  }
  const envelope = res as ApiResponse<NetworkDevice>;
  return {
    revision: envelope.revision ?? 0,
    device: envelope.data as NetworkDevice,
  };
}

/**
 * Fetches all active network connections and socket flows.
 */
export async function fetchNetworkConnections(
  options?: RequestOptions
): Promise<{ revision: number; connections: NetworkConnection[] }> {
  if (customTransport) {
    return customTransport.getConnections(options);
  }

  const ipcResult = await invokeTauri<{ revision: number; connections: NetworkConnection[] } | ApiResponse<NetworkConnection[]>>("get_network_connections");
  if (ipcResult) {
    if ("connections" in ipcResult && Array.isArray(ipcResult.connections)) {
      return ipcResult as { revision: number; connections: NetworkConnection[] };
    }
    const env = ipcResult as ApiResponse<NetworkConnection[]>;
    return {
      revision: env.revision ?? 0,
      connections: env.data ?? env.connections ?? [],
    };
  }

  const res = await apiClient.get<ApiResponse<NetworkConnection[]> | { revision: number; connections: NetworkConnection[] }>(
    "/network/connections",
    options
  );
  if ("connections" in res && Array.isArray(res.connections)) {
    return res as { revision: number; connections: NetworkConnection[] };
  }
  const envelope = res as ApiResponse<NetworkConnection[]>;
  return {
    revision: envelope.revision ?? 0,
    connections: envelope.data ?? envelope.connections ?? [],
  };
}

/**
 * Fetches all authoritative host network interfaces.
 */
export async function fetchNetworkInterfaces(
  options?: RequestOptions
): Promise<{ revision: number; interfaces: NetworkInterfaceInfo[] }> {
  if (customTransport) {
    return customTransport.getInterfaces(options);
  }

  const ipcResult = await invokeTauri<{ revision: number; interfaces: NetworkInterfaceInfo[] } | ApiResponse<NetworkInterfaceInfo[]>>("get_network_interfaces");
  if (ipcResult) {
    if ("interfaces" in ipcResult && Array.isArray(ipcResult.interfaces)) {
      return ipcResult as { revision: number; interfaces: NetworkInterfaceInfo[] };
    }
    const env = ipcResult as ApiResponse<NetworkInterfaceInfo[]>;
    return {
      revision: env.revision ?? 0,
      interfaces: env.data ?? env.interfaces ?? [],
    };
  }

  const res = await apiClient.get<ApiResponse<NetworkInterfaceInfo[]> | { revision: number; interfaces: NetworkInterfaceInfo[] }>(
    "/network/interfaces",
    options
  );
  if ("interfaces" in res && Array.isArray(res.interfaces)) {
    return res as { revision: number; interfaces: NetworkInterfaceInfo[] };
  }
  const envelope = res as ApiResponse<NetworkInterfaceInfo[]>;
  return {
    revision: envelope.revision ?? 0,
    interfaces: envelope.data ?? envelope.interfaces ?? [],
  };
}

/**
 * Fetches authoritative aggregate network traffic metrics.
 */
export async function fetchNetworkTraffic(
  options?: RequestOptions
): Promise<{ revision: number; traffic: TrafficMetrics }> {
  if (customTransport) {
    return customTransport.getTraffic(options);
  }

  const ipcResult = await invokeTauri<{ revision: number; traffic: TrafficMetrics } | ApiResponse<TrafficMetrics>>("get_network_traffic");
  if (ipcResult) {
    if ("traffic" in ipcResult) {
      return ipcResult as { revision: number; traffic: TrafficMetrics };
    }
    const env = ipcResult as ApiResponse<TrafficMetrics>;
    if (env.data) {
      return { revision: env.revision ?? 0, traffic: env.data };
    }
  }

  const res = await apiClient.get<ApiResponse<TrafficMetrics> | { revision: number; traffic: TrafficMetrics }>(
    "/network/traffic",
    options
  );
  if ("traffic" in res) {
    return res as { revision: number; traffic: TrafficMetrics };
  }
  const envelope = res as ApiResponse<TrafficMetrics>;
  return {
    revision: envelope.revision ?? 0,
    traffic: envelope.data ?? envelope.traffic ?? {
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
}

/**
 * Fetches current implemented capabilities metadata of the Network subsystem.
 */
export async function fetchNetworkCapabilities(
  options?: RequestOptions
): Promise<NetworkCapabilitiesMetadata> {
  if (customTransport) {
    return customTransport.getCapabilities(options);
  }

  const ipcResult = await invokeTauri<NetworkCapabilitiesMetadata | ApiResponse<NetworkCapabilitiesMetadata>>("get_network_capabilities");
  if (ipcResult) {
    if ("protocol_version" in ipcResult && "supported_read_operations" in ipcResult) {
      return ipcResult as NetworkCapabilitiesMetadata;
    }
    const env = ipcResult as ApiResponse<NetworkCapabilitiesMetadata>;
    if (env.data) return env.data;
  }

  const res = await apiClient.get<ApiResponse<NetworkCapabilitiesMetadata> | NetworkCapabilitiesMetadata>(
    "/network/capabilities",
    options
  );
  if ("protocol_version" in res && "supported_read_operations" in res) {
    return res as NetworkCapabilitiesMetadata;
  }
  const envelope = res as ApiResponse<NetworkCapabilitiesMetadata>;
  return (
    envelope.data ??
    envelope.capabilities ?? {
      protocol_version: { major: 1, minor: 0 },
      subsystem_available: true,
      supported_read_operations: [],
      supported_event_categories: [],
      supported_connection_kinds: [],
      supported_node_roles: [],
      telemetry_supported: true,
      event_buffer_capacity: 1024,
    }
  );
}

export const getNetworkSnapshot = fetchNetworkSnapshot;
export const getNetworkNodes = fetchNetworkNodes;
export const getNetworkNode = fetchNetworkNode;
export const getNetworkDevices = fetchNetworkDevices;
export const getNetworkDevice = fetchNetworkDevice;
export const getNetworkConnections = fetchNetworkConnections;
export const getNetworkInterfaces = fetchNetworkInterfaces;
export const getNetworkTraffic = fetchNetworkTraffic;
export const getNetworkCapabilities = fetchNetworkCapabilities;

/**
 * Initiates controlled pairing and connection workflow for a remote node (N10).
 * Path: Available -> Pairing -> Authenticating -> Connected.
 */
export async function connectNode(
  nodeId: string,
  options?: RequestOptions
): Promise<ConnectNodeResponse> {
  if (customTransport?.connectNode) {
    return customTransport.connectNode(nodeId, options);
  }

  const ipcResult = await invokeTauri<ConnectNodeResponse | ApiResponse<ConnectNodeResponse>>("connect_node", {
    node_id: nodeId,
  });
  if (ipcResult) {
    if ("node" in ipcResult && "revision" in ipcResult) {
      return ipcResult as ConnectNodeResponse;
    }
    const env = ipcResult as ApiResponse<ConnectNodeResponse>;
    if (env.data) return env.data;
  }

  const res = await apiClient.post<ApiResponse<ConnectNodeResponse> | ConnectNodeResponse>(
    "/network/connect",
    { node_id: nodeId },
    options
  );
  if ("node" in res && "revision" in res) {
    return res as ConnectNodeResponse;
  }
  const envelope = res as ApiResponse<ConnectNodeResponse>;
  if (envelope.data) return envelope.data;
  if (envelope.node) {
    return {
      revision: envelope.revision ?? 0,
      node: envelope.node,
      connection: envelope.connection ?? null,
    };
  }
  throw new Error((envelope.error as string) || "Failed to connect node");
}

/**
 * Gracefully disconnects an active node and terminates its authoritative connection (N10).
 */
export async function disconnectNode(
  nodeId: string,
  options?: RequestOptions
): Promise<DisconnectNodeResponse> {
  if (customTransport?.disconnectNode) {
    return customTransport.disconnectNode(nodeId, options);
  }

  const ipcResult = await invokeTauri<DisconnectNodeResponse | ApiResponse<DisconnectNodeResponse>>("disconnect_node", {
    node_id: nodeId,
  });
  if (ipcResult) {
    if ("node" in ipcResult && "revision" in ipcResult) {
      return ipcResult as DisconnectNodeResponse;
    }
    const env = ipcResult as ApiResponse<DisconnectNodeResponse>;
    if (env.data) return env.data;
  }

  const res = await apiClient.post<ApiResponse<DisconnectNodeResponse> | DisconnectNodeResponse>(
    "/network/disconnect",
    { node_id: nodeId },
    options
  );
  if ("node" in res && "revision" in res) {
    return res as DisconnectNodeResponse;
  }
  const envelope = res as ApiResponse<DisconnectNodeResponse>;
  if (envelope.data) return envelope.data;
  if (envelope.node) {
    return {
      revision: envelope.revision ?? 0,
      node: envelope.node,
    };
  }
  throw new Error((envelope.error as string) || "Failed to disconnect node");
}

/**
 * Retrieves pure non-secret connection and session projection for a node (N10).
 */
export async function getConnectionInfo(
  nodeId: string,
  options?: RequestOptions
): Promise<GetConnectionInfoResponse> {
  if (customTransport?.getConnectionInfo) {
    return customTransport.getConnectionInfo(nodeId, options);
  }

  const ipcResult = await invokeTauri<GetConnectionInfoResponse | ApiResponse<GetConnectionInfoResponse>>("get_connection_info", {
    node_id: nodeId,
  });
  if (ipcResult) {
    if ("info" in ipcResult && "revision" in ipcResult) {
      return ipcResult as GetConnectionInfoResponse;
    }
    const env = ipcResult as ApiResponse<GetConnectionInfoResponse>;
    if (env.data) return env.data;
  }

  const res = await apiClient.get<ApiResponse<GetConnectionInfoResponse> | GetConnectionInfoResponse>(
    `/network/nodes/${encodeURIComponent(nodeId)}/connection-info`,
    options
  );
  if ("info" in res && "revision" in res) {
    return res as GetConnectionInfoResponse;
  }
  const envelope = res as ApiResponse<GetConnectionInfoResponse>;
  if (envelope.data) return envelope.data;
  if (envelope.info) {
    return {
      revision: envelope.revision ?? 0,
      info: envelope.info as any,
    };
  }
  throw new Error((envelope.error as string) || "Failed to get connection info");
}

/**
 * Executes a single-target administrative capability command via the canonical control plane (N13).
 */
export async function executeAdminCommand(
  request: AdminCommandRequest,
  options?: RequestOptions
): Promise<AdminCommandResult> {
  if (customTransport?.executeAdminCommand) {
    return customTransport.executeAdminCommand(request, options);
  }

  const ipcResult = await invokeTauri<ExecuteAdminCommandResponse | ApiResponse<ExecuteAdminCommandResponse>>(
    "execute_admin_command",
    { request }
  );
  if (ipcResult) {
    if ("result" in ipcResult && (ipcResult as any).result) {
      return (ipcResult as ExecuteAdminCommandResponse).result;
    }
    const env = ipcResult as ApiResponse<ExecuteAdminCommandResponse>;
    if (env.data && env.data.result) return env.data.result;
  }

  const res = await apiClient.post<ApiResponse<ExecuteAdminCommandResponse> | ExecuteAdminCommandResponse>(
    "/network/admin/command",
    request,
    options
  );
  if ("result" in res && (res as any).result) {
    return (res as ExecuteAdminCommandResponse).result;
  }
  const envelope = res as ApiResponse<ExecuteAdminCommandResponse>;
  if (envelope.data && envelope.data.result) return envelope.data.result;
  if ((envelope as any).result) return (envelope as any).result;
  throw new Error((envelope.error as string) || "Failed to execute admin command");
}

/**
 * Executes a batch administrative capability command across multiple targets (N13).
 */
export async function executeBatchAdminCommand(
  request: AdminBatchCommandRequest,
  options?: RequestOptions
): Promise<AdminBatchCommandResult> {
  if (customTransport?.executeBatchAdminCommand) {
    return customTransport.executeBatchAdminCommand(request, options);
  }

  const ipcResult = await invokeTauri<ExecuteBatchAdminCommandResponse | ApiResponse<ExecuteBatchAdminCommandResponse>>(
    "execute_batch_admin_command",
    { request }
  );
  if (ipcResult) {
    if ("result" in ipcResult && (ipcResult as any).result) {
      return (ipcResult as ExecuteBatchAdminCommandResponse).result;
    }
    const env = ipcResult as ApiResponse<ExecuteBatchAdminCommandResponse>;
    if (env.data && env.data.result) return env.data.result;
  }

  const res = await apiClient.post<ApiResponse<ExecuteBatchAdminCommandResponse> | ExecuteBatchAdminCommandResponse>(
    "/network/admin/batch",
    request,
    options
  );
  if ("result" in res && (res as any).result) {
    return (res as ExecuteBatchAdminCommandResponse).result;
  }
  const envelope = res as ApiResponse<ExecuteBatchAdminCommandResponse>;
  if (envelope.data && envelope.data.result) return envelope.data.result;
  if ((envelope as any).result) return (envelope as any).result;
  throw new Error((envelope.error as string) || "Failed to execute batch admin command");
}

