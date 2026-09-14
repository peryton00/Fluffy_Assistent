/**
 * Fluffy Desktop - Interactive Network Topology Domain & Projection Model (Phase N9)
 * 
 * Derives presentation-ready TopologyNode[] and TopologyEdge[] projections
 * strictly from authoritative N7 NetworkState (via N8 networkWorkspaceStore).
 * 
 * Core Invariant:
 * REAL CONNECTIONS ONLY. No inferred edges between devices on the same subnet,
 * visible through ARP, or sharing interfaces unless backed by authoritative NetworkConnection data.
 * 
 * Zero Emojis, Zero N10+ functionality.
 */

import type {
  NetworkNode,
  NetworkDevice,
  NetworkConnection,
  NetworkInterfaceInfo,
  TrafficMetrics,
  NetworkEvent,
  ConnectionKindType,
  FlowProtocolType,
  FlowStateType,
  ConnectionDirectionType,
  NodeAvailabilityKind,
  DeviceStateKind,
} from "../../../types/contracts";

export type TopologyMode = "cluster" | "network" | "traffic" | "security";

export type TopologyNodeType = "node" | "device" | "interface" | "external_endpoint";

export type TopologyNodeStatus =
  | NodeAvailabilityKind
  | DeviceStateKind
  | "up"
  | "down"
  | "active"
  | "external";

export interface TopologyNode {
  id: string; // Uniform topology ID e.g. "node:node-1", "device:dev-1", "interface:eth0", "external:8.8.8.8"
  entityType: TopologyNodeType;
  sourceId: string; // Canonical NodeId, DeviceId, InterfaceId, or remote IP for external endpoints
  label: string;
  sublabel: string;
  ip: string | null;
  mac: string | null;
  status: TopologyNodeStatus;
  role?: string;
  category?: string;
  isGateway?: boolean;
  isSelf?: boolean;
  connectionCount: number;
  trafficRxBytes?: number;
  trafficTxBytes?: number;
  trafficRateBps?: number;
  securityObservationCount?: number;
  x: number;
  y: number;
}

export interface TopologyEdge {
  id: string; // e.g. "edge:conn-1"
  connectionId: string; // Real underlying NetworkConnection id
  sourceNodeId: string; // TopologyNode id of source endpoint
  targetNodeId: string; // TopologyNode id of target endpoint
  kind: ConnectionKindType;
  protocol: FlowProtocolType;
  localAddr: string;
  localPort: number;
  remoteAddr: string | null;
  remotePort: number | null;
  state: FlowStateType;
  direction: ConnectionDirectionType;
  trafficRxBytes?: number;
  trafficTxBytes?: number;
  trafficRateBps?: number;
}

export interface TopologyFilterState {
  searchQuery: string;
  entityType: "all" | "node" | "device" | "interface" | "external_endpoint";
  connectionKind: "all" | ConnectionKindType;
  availability: "all" | "available" | "busy" | "unreachable" | "offline";
}

export interface TopologyProjectionInput {
  nodes: NetworkNode[];
  devices: NetworkDevice[];
  connections: NetworkConnection[];
  interfaces: NetworkInterfaceInfo[];
  traffic: TrafficMetrics;
  events: NetworkEvent[];
}

export interface TopologyProjection {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  isolatedNodeCount: number;
  totalConnectionsCount: number;
  activeConnectionsCount: number;
  mode: TopologyMode;
}

/**
 * Returns canonical NetworkNode availability without mutating or fabricating state.
 * Network synchronization status (healthy/stale/degraded) remains strictly separated
 * from authoritative node availability.
 */
export function mapNodeStatus(node: NetworkNode): NodeAvailabilityKind {
  return node.availability;
}

/**
 * Derives a deterministic topology projection from authoritative network state.
 */
export function projectTopology(
  input: TopologyProjectionInput,
  mode: TopologyMode = "network",
  filters?: Partial<TopologyFilterState>,
  canvasWidth = 1000,
  canvasHeight = 700
): TopologyProjection {
  const {
    nodes = [],
    devices = [],
    connections = [],
    interfaces = [],
    traffic,
    events = [],
  } = input;

  const filterState: TopologyFilterState = {
    searchQuery: "",
    entityType: "all",
    connectionKind: "all",
    availability: "all",
    ...filters,
  };

  // 1. Build security observation counts map from authoritative security events
  const securityEventCounts = new Map<string, number>();
  for (const evt of events) {
    if (evt.category === "security") {
      if (evt.target_node_id) {
        securityEventCounts.set(
          evt.target_node_id,
          (securityEventCounts.get(evt.target_node_id) ?? 0) + 1
        );
      }
      if (evt.target_device_id) {
        securityEventCounts.set(
          evt.target_device_id,
          (securityEventCounts.get(evt.target_device_id) ?? 0) + 1
        );
      }
    }
  }

  // 2. Build top talkers traffic map from authoritative traffic metrics
  const topTalkersMap = new Map<string, { rx_bytes: number; tx_bytes: number; rate_bps: number }>();
  if (traffic?.top_talkers) {
    for (const tt of traffic.top_talkers) {
      topTalkersMap.set(tt.entity_id, {
        rx_bytes: tt.rx_bytes,
        tx_bytes: tt.tx_bytes,
        rate_bps: (tt.rx_rate_bps || 0) + (tt.tx_rate_bps || 0),
      });
    }
  }

  // 3. Project Nodes based on active TopologyMode
  const rawNodes: TopologyNode[] = [];
  const nodeLookupByIp = new Map<string, string>(); // ip -> topologyNode.id
  const nodeLookupById = new Map<string, string>(); // sourceId -> topologyNode.id

  // A. Cluster Nodes (included in all modes, mandatory in "cluster")
  for (const n of nodes) {
    const topoId = `node:${n.id}`;
    const status = mapNodeStatus(n);
    const secCount = securityEventCounts.get(n.id) ?? 0;
    const tt = topTalkersMap.get(n.id) ?? topTalkersMap.get(n.name);

    const topoNode: TopologyNode = {
      id: topoId,
      entityType: "node",
      sourceId: n.id,
      label: n.name || n.id,
      sublabel: `Node • ${n.role} • ${n.os}`,
      ip: null,
      mac: null,
      status,
      role: n.role,
      connectionCount: 0,
      trafficRxBytes: tt?.rx_bytes,
      trafficTxBytes: tt?.tx_bytes,
      trafficRateBps: tt?.rate_bps,
      securityObservationCount: secCount,
      x: 0,
      y: 0,
    };

    rawNodes.push(topoNode);
    nodeLookupById.set(n.id, topoId);
    nodeLookupById.set(topoId, topoId);
  }

  // B. Discovered Network Devices (omitted in "cluster" mode to keep cluster pure)
  if (mode !== "cluster") {
    const seenTopoIds = new Set<string>();
    for (const d of devices) {
      let devId = d.id || (d.mac_address ? `dev_${d.mac_address.replace(/[: -]/g, "").toLowerCase()}` : (d.ip_address ? `dev_${d.ip_address.replace(/[\.:]/g, "_")}` : `dev_${Math.random().toString(36).slice(2, 8)}`));
      let topoId = `device:${devId}`;

      if (seenTopoIds.has(topoId)) {
        if (d.ip_address) {
          devId = `${devId}_${d.ip_address.replace(/[\.:]/g, "_")}`;
          topoId = `device:${devId}`;
        }
        if (seenTopoIds.has(topoId)) {
          continue;
        }
      }
      seenTopoIds.add(topoId);

      const status: TopologyNodeStatus = d.state === "reachable" ? "reachable" : "unknown";
      const secCount = securityEventCounts.get(devId) ?? (d.id ? (securityEventCounts.get(d.id) ?? 0) : 0);
      const tt = (d.id ? topTalkersMap.get(d.id) : undefined) ?? topTalkersMap.get(devId) ?? (d.ip_address ? topTalkersMap.get(d.ip_address) : undefined);

      const topoNode: TopologyNode = {
        id: topoId,
        entityType: "device",
        sourceId: devId,
        label: d.hostname || d.ip_address,
        sublabel: `Device • ${d.category || "endpoint"}`,
        ip: d.ip_address,
        mac: d.mac_address ?? null,
        status,
        category: d.category,
        isGateway: d.is_gateway,
        isSelf: d.is_self,
        connectionCount: 0,
        trafficRxBytes: tt?.rx_bytes,
        trafficTxBytes: tt?.tx_bytes,
        trafficRateBps: tt?.rate_bps,
        securityObservationCount: secCount,
        x: 0,
        y: 0,
      };

      rawNodes.push(topoNode);
      if (d.id) {
        nodeLookupById.set(d.id, topoId);
      }
      nodeLookupById.set(devId, topoId);
      nodeLookupById.set(topoId, topoId);
      if (d.ip_address) {
        nodeLookupByIp.set(d.ip_address, topoId);
      }
      if (d.associated_node_id && nodeLookupById.has(d.associated_node_id)) {
        const linkedNodeTopoId = nodeLookupById.get(d.associated_node_id)!;
        nodeLookupByIp.set(d.ip_address, linkedNodeTopoId);
      }
    }
  }

  // C. Local Host Interfaces (only include up physical/virtual adapters in "network" mode)
  if (mode === "network") {
    for (const iface of interfaces) {
      if (iface.is_physical || iface.is_up) {
        const topoId = `interface:${iface.id}`;
        const status: TopologyNodeStatus = iface.is_up ? "up" : "down";

        const topoNode: TopologyNode = {
          id: topoId,
          entityType: "interface",
          sourceId: iface.id,
          label: iface.name,
          sublabel: `Adapter • ${iface.interface_type}`,
          ip: iface.ipv4_addresses[0] ?? null,
          mac: iface.mac_address ?? null,
          status,
          connectionCount: 0,
          trafficRxBytes: iface.total_received_bytes,
          trafficTxBytes: iface.total_transmitted_bytes,
          trafficRateBps: iface.rates?.rx_bytes_per_second
            ? (iface.rates.rx_bytes_per_second + (iface.rates.tx_bytes_per_second || 0)) * 8
            : undefined,
          x: 0,
          y: 0,
        };

        rawNodes.push(topoNode);
        nodeLookupById.set(iface.id, topoId);
        nodeLookupById.set(topoId, topoId);
        for (const addr of iface.ipv4_addresses) {
          const cleanIp = addr.split("/")[0];
          if (!nodeLookupByIp.has(cleanIp)) {
            nodeLookupByIp.set(cleanIp, topoId);
          }
        }
      }
    }
  }

  // D. Unresolved Remote Endpoints (Policy: represent explicitly as external endpoints in network/traffic/security modes)
  // Invariant: Do NOT fabricate a NetworkDevice or NetworkNode backend record.
  if (mode !== "cluster") {
    for (const conn of connections) {
      if (conn.remote_addr && !nodeLookupByIp.has(conn.remote_addr)) {
        if (!conn.associated_node_id || !nodeLookupById.has(conn.associated_node_id)) {
          const extTopoId = `external:${conn.remote_addr}`;
          if (!nodeLookupById.has(extTopoId)) {
            const secCount = securityEventCounts.get(conn.remote_addr) ?? 0;
            const tt = topTalkersMap.get(conn.remote_addr);

            const extNode: TopologyNode = {
              id: extTopoId,
              entityType: "external_endpoint",
              sourceId: conn.remote_addr,
              label: conn.remote_addr,
              sublabel: `External Endpoint • ${conn.protocol.toUpperCase()}${conn.remote_port ? `:${conn.remote_port}` : ""}`,
              ip: conn.remote_addr,
              mac: null,
              status: "external",
              connectionCount: 0,
              trafficRxBytes: tt?.rx_bytes,
              trafficTxBytes: tt?.tx_bytes,
              trafficRateBps: tt?.rate_bps,
              securityObservationCount: secCount,
              x: 0,
              y: 0,
            };

            rawNodes.push(extNode);
            nodeLookupById.set(extTopoId, extTopoId);
            nodeLookupByIp.set(conn.remote_addr, extTopoId);
          }
        }
      }
    }
  }

  // 4. Apply Mode & Filter Criteria on Nodes
  let filteredNodes = rawNodes.filter((node) => {
    // Mode-specific filtering
    if (mode === "cluster" && node.entityType !== "node") {
      return false;
    }
    if (
      mode === "security" &&
      (node.securityObservationCount ?? 0) === 0 &&
      (node.entityType === "device" || node.entityType === "external_endpoint")
    ) {
      return false;
    }

    // Entity Type Filter
    if (filterState.entityType !== "all" && node.entityType !== filterState.entityType) {
      return false;
    }

    // Availability Filter
    if (filterState.availability !== "all") {
      if (filterState.availability === "available" && node.status !== "available" && node.status !== "reachable" && node.status !== "up" && node.status !== "external") {
        return false;
      }
      if (filterState.availability === "offline" && node.status !== "offline" && node.status !== "failed" && node.status !== "down") {
        return false;
      }
      if (filterState.availability === "busy" && node.status !== "busy") {
        return false;
      }
      if (filterState.availability === "unreachable" && node.status !== "unreachable") {
        return false;
      }
    }

    // Search Query Filter
    if (filterState.searchQuery.trim()) {
      const q = filterState.searchQuery.toLowerCase();
      const matchLabel = node.label.toLowerCase().includes(q);
      const matchIp = node.ip?.toLowerCase().includes(q);
      const matchMac = node.mac?.toLowerCase().includes(q);
      const matchRole = node.role?.toLowerCase().includes(q);
      if (!matchLabel && !matchIp && !matchMac && !matchRole) {
        return false;
      }
    }

    return true;
  });

  // Create a set of active filtered node IDs for fast membership checking
  const activeNodeIds = new Set(filteredNodes.map((n) => n.id));

  // 5. Derive Real Edges strictly from authoritative NetworkConnection data
  const rawEdges: TopologyEdge[] = [];

  for (const conn of connections) {
    // Filter out connection kinds if filter is set
    if (filterState.connectionKind !== "all" && conn.kind !== filterState.connectionKind) {
      continue;
    }

    // Cluster mode only admits cluster_transport connections
    if (mode === "cluster" && conn.kind !== "cluster_transport") {
      continue;
    }

    // Determine Source & Target TopologyNode
    let srcTopoId: string | null = null;
    let tgtTopoId: string | null = null;

    // 1. Direct Node ID match
    if (conn.associated_node_id && nodeLookupById.has(conn.associated_node_id)) {
      tgtTopoId = nodeLookupById.get(conn.associated_node_id)!;
    }

    // 2. IP matching
    if (!srcTopoId && conn.local_addr) {
      srcTopoId = nodeLookupByIp.get(conn.local_addr) ?? null;
    }
    if (!tgtTopoId && conn.remote_addr) {
      tgtTopoId = nodeLookupByIp.get(conn.remote_addr) ?? null;
    }

    // If source is still null, check if any node is self / master
    if (!srcTopoId && filteredNodes.length > 0) {
      const selfNode = filteredNodes.find((n) => n.entityType === "node" || n.isSelf);
      if (selfNode) {
        srcTopoId = selfNode.id;
      }
    }

    // Strict Connection Validation: BOTH endpoints must be present in the active filtered graph
    if (
      srcTopoId &&
      tgtTopoId &&
      srcTopoId !== tgtTopoId &&
      activeNodeIds.has(srcTopoId) &&
      activeNodeIds.has(tgtTopoId)
    ) {
      rawEdges.push({
        id: `edge:${conn.id}`,
        connectionId: conn.id,
        sourceNodeId: srcTopoId,
        targetNodeId: tgtTopoId,
        kind: conn.kind,
        protocol: conn.protocol,
        localAddr: conn.local_addr,
        localPort: conn.local_port,
        remoteAddr: conn.remote_addr ?? null,
        remotePort: conn.remote_port ?? null,
        state: conn.state,
        direction: conn.direction,
      });
    }
  }

  // 6. Update Connection Counts on Nodes
  const connectionCounts = new Map<string, number>();
  for (const edge of rawEdges) {
    connectionCounts.set(edge.sourceNodeId, (connectionCounts.get(edge.sourceNodeId) ?? 0) + 1);
    connectionCounts.set(edge.targetNodeId, (connectionCounts.get(edge.targetNodeId) ?? 0) + 1);
  }

  filteredNodes = filteredNodes.map((n) => ({
    ...n,
    connectionCount: connectionCounts.get(n.id) ?? 0,
  }));

  // 7. Calculate Deterministic Layout Coordinates
  computeDeterministicLayout(filteredNodes, canvasWidth, canvasHeight);

  const isolatedCount = filteredNodes.filter((n) => n.connectionCount === 0).length;
  const activeConnCount = rawEdges.filter((e) => e.state === "established").length;

  return {
    nodes: filteredNodes,
    edges: rawEdges,
    isolatedNodeCount: isolatedCount,
    totalConnectionsCount: rawEdges.length,
    activeConnectionsCount: activeConnCount,
    mode,
  };
}

/**
 * Computes deterministic, stable 2D layout coordinates for topology nodes.
 * 
 * Invariants:
 * - Deterministic: Stable coordinates based on node ID ordering.
 * - Multi-tier structure: Concentric rings for cluster core vs peripherals vs external.
 * - Zero physics jitter or unpredictable drift across renders.
 */
export function computeDeterministicLayout(
  nodes: TopologyNode[],
  canvasWidth = 1000,
  canvasHeight = 700
): void {
  if (nodes.length === 0) return;

  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2 - 20;

  // Group nodes by entity tier
  const clusterNodes = nodes.filter((n) => n.entityType === "node").sort((a, b) => a.id.localeCompare(b.id));
  const deviceNodes = nodes.filter((n) => n.entityType === "device").sort((a, b) => a.id.localeCompare(b.id));
  const externalNodes = nodes.filter((n) => n.entityType === "external_endpoint").sort((a, b) => a.id.localeCompare(b.id));
  const interfaceNodes = nodes.filter((n) => n.entityType === "interface").sort((a, b) => a.id.localeCompare(b.id));

  // Tier 1: Cluster Core (Center circle / ring)
  if (clusterNodes.length === 1) {
    clusterNodes[0].x = centerX;
    clusterNodes[0].y = centerY;
  } else if (clusterNodes.length > 1) {
    const clusterRadius = Math.max(120, clusterNodes.length * 35);
    clusterNodes.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / clusterNodes.length - Math.PI / 2;
      node.x = Math.round(centerX + clusterRadius * Math.cos(angle));
      node.y = Math.round(centerY + clusterRadius * Math.sin(angle));
    });
  }

  // Tier 2: Subnet Devices (Multi-ring with anti-collision spacing)
  if (deviceNodes.length > 0) {
    const nodesPerRing = 8;
    const baseRadius = clusterNodes.length > 0 ? 190 : 130;
    const ringSpacing = 100;

    deviceNodes.forEach((dev, idx) => {
      const ringIdx = Math.floor(idx / nodesPerRing);
      const posInRing = idx % nodesPerRing;
      const countInThisRing = Math.min(nodesPerRing, deviceNodes.length - ringIdx * nodesPerRing);
      const ringRadius = baseRadius + ringIdx * ringSpacing;
      const angleOffset = (ringIdx % 2) * (Math.PI / Math.max(1, countInThisRing));
      const angle = (2 * Math.PI * posInRing) / countInThisRing - Math.PI / 4 + angleOffset;
      dev.x = Math.round(centerX + ringRadius * Math.cos(angle));
      dev.y = Math.round(centerY + ringRadius * Math.sin(angle));
    });
  }

  // Tier 3: External Endpoints (Outer tiered rings with anti-collision spacing)
  if (externalNodes.length > 0) {
    const nodesPerRing = 10;
    const devRings = deviceNodes.length > 0 ? Math.ceil(deviceNodes.length / 8) : 0;
    const baseRadius = (clusterNodes.length > 0 ? 190 : 130) + devRings * 100 + 40;
    const ringSpacing = 110;

    externalNodes.forEach((ext, idx) => {
      const ringIdx = Math.floor(idx / nodesPerRing);
      const posInRing = idx % nodesPerRing;
      const countInThisRing = Math.min(nodesPerRing, externalNodes.length - ringIdx * nodesPerRing);
      const ringRadius = baseRadius + ringIdx * ringSpacing;
      const angleOffset = (ringIdx % 2) * (Math.PI / Math.max(1, countInThisRing));
      const angle = (2 * Math.PI * posInRing) / countInThisRing + Math.PI / 6 + angleOffset;
      ext.x = Math.round(centerX + ringRadius * Math.cos(angle));
      ext.y = Math.round(centerY + ringRadius * Math.sin(angle));
    });
  }

  // Tier 4: Interfaces (Bottom dedicated shelf)
  if (interfaceNodes.length > 0) {
    const ifaceSpacing = Math.min(160, Math.max(140, (canvasWidth - 100) / (interfaceNodes.length + 1)));
    const startX = centerX - ((interfaceNodes.length - 1) * ifaceSpacing) / 2;
    const ifaceY = canvasHeight - 70;
    interfaceNodes.forEach((iface, idx) => {
      iface.x = Math.round(startX + idx * ifaceSpacing);
      iface.y = ifaceY;
    });
  }
}
