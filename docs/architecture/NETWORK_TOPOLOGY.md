# Network Topology Architecture (Phase N9)

## 1. Overview & Core Philosophy

Phase N9 establishes the interactive Network Topology visualization for Fluffy Desktop, turning the Phase N8 structural blueprint into a live, interactive topological surface.

### Authoritative Data Rule
The topology is a pure presentation projection derived directly from authoritative Rust `NetworkState`.

```text
Rust NetworkState (Authoritative Reality)
         ↓
N7 Network API / NetworkEventBus
         ↓
N8 networkWorkspaceStore (Client State)
         ↓
N9 Topology Projection (TopologyNode[] / TopologyEdge[])
         ↓
Interactive SVG Canvas (TopologyCanvas)
```

> [!IMPORTANT]
> **Real Connections Only Invariant**:
> The topology engine does NOT infer relationships simply because two devices share a subnet, appear in an ARP cache, or run Fluffy.
> An edge is drawn **if and only if** backed by an authoritative `NetworkConnection` entity.
> Isolated nodes and disconnected components are normal, expected, and accurately represented.

---

## 2. Canonical Node State Semantics vs Synchronization State

To prevent synthetic state corruption across client-server boundaries, Fluffy strictly separates **Authoritative Entity State** from **Workspace Synchronization State**:

### A. Authoritative Node State (N7 Backend Semantics)
- `NetworkNode.availability`: `available` | `busy` | `unreachable` | `offline`
- `NetworkNode.auth_state`: `unauthenticated` | `pairing` | `authenticating` | `authenticated` | `rejected`
- `NetworkNode.pairing_state`: `unpaired` | `requested` | `paired` | `revoked`

Nodes are never assigned synthetic statuses such as "degraded" or "reachable". Lack of ARP/neighbor discovery records does not mutate an authoritative node into "offline". Reachability is never inferred from ARP/discovery alone.

### B. Authoritative Device State
- `NetworkDevice.state`: `reachable` | `stale` | `delay` | `probe` | `failed` | `incomplete` | `unknown`

### C. Client Synchronization State
- `networkWorkspaceStore.status`: `healthy` | `stale` | `degraded`
- Event bus lag or reconnecting transport state marks the client cache as `degraded` or `stale`, but **never** mutates the backend availability of individual nodes or devices.

---

## 3. Unresolved Endpoint Resolution Policy

A legitimate `NetworkConnection` (e.g. `LocalSocketFlow` from local host to DNS `8.8.8.8:53` or external HTTPS `1.1.1.1:443`) often connects to a remote IP that has no corresponding `NetworkDevice` or `NetworkNode` discovery record.

Fluffy enforces the following deterministic policy:

1. **No Fabricated Entities**: Fluffy never invents or writes a fake `NetworkDevice` or `NetworkNode` record to backend authoritative state for unresolved IPs.
2. **Explicit Presentation Nodes (`external_endpoint`)**: In **Network** and **Traffic** modes, unresolved remote endpoints are projected as explicit `external_endpoint` topology nodes (`external:<remote_addr>`) with an active `TopologyEdge`.
3. **Cluster Mode Filtering**: In **Cluster** mode, only cluster nodes and `cluster_transport` connections between cluster members are visualized. Non-cluster external connections are omitted from the cluster graph.
4. **Omission Semantics**: Intentionally omitting non-cluster connections from Cluster mode does **not** mean the connection does not exist. All real socket connections remain fully represented in the Traffic workspace table, throughput metrics, and Traffic topology mode.

---

## 4. Topology Projection Data Model

The presentation model is derived on-demand via `projectTopology()` without duplicating or creating a secondary state store.

### TopologyNode
```typescript
interface TopologyNode {
  id: string; // Uniform ID (e.g., "node:node-1", "device:dev-1", "interface:eth0", "external:8.8.8.8")
  entityType: "node" | "device" | "interface" | "external_endpoint";
  sourceId: string; // Canonical NodeId, DeviceId, InterfaceId, or remote IP
  label: string;
  sublabel: string;
  ip: string | null;
  mac: string | null;
  status: NodeAvailabilityKind | DeviceStateKind | "up" | "down" | "active" | "external";
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
```

### TopologyEdge
```typescript
interface TopologyEdge {
  id: string; // Uniform Edge ID (e.g., "edge:conn-1")
  connectionId: string; // Canonical NetworkConnection ID
  sourceNodeId: string; // Source TopologyNode ID
  targetNodeId: string; // Target TopologyNode ID
  kind: ConnectionKindType; // "cluster_transport" | "local_socket_flow" | "ipc_stream" | "web_socket_bridge"
  protocol: FlowProtocolType; // "tcp" | "udp"
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
```

---

## 5. Four Topology Modes

| Mode | Semantic Focus | Entity Scope | Edge Scope | Visual Treatment |
| :--- | :--- | :--- | :--- | :--- |
| **Cluster** | Fluffy Cluster Mesh | Cluster Nodes (`nodes`) only | `cluster_transport` connections only | Focuses strictly on cluster members, roles, and inter-node links. |
| **Network** | Subnet & Local Environment | Cluster Nodes, Discovered Devices, Host Adapters, External Endpoints | All active `NetworkConnection` flows | Full network overview with interfaces, subnet devices, and outbound endpoints. |
| **Traffic** | Active Bandwidth & Flows | High-throughput entities & active socket endpoints | Active socket flows & rates | Edge line widths scale with throughput; top-talker badge annotations. |
| **Security** | Security Observation Attribution | Entities with security observations | Flagged socket flows | Highlights anomaly counts and security alert indicators from real events. |

---

## 6. Deterministic Layout & Canvas Controls

- **Deterministic Multi-Tier Layout**: Node coordinates $(x, y)$ are calculated deterministically across concentric tiers:
  - **Tier 1 (Center Core)**: Cluster Nodes
  - **Tier 2 (Inner Orbit)**: Discovered Subnet Devices
  - **Tier 3 (Outer Orbit)**: External Endpoints
  - **Tier 4 (Bottom Band)**: Host Network Adapters / Interfaces
- **Interactive Controls**:
  - **Pan**: Click-and-drag canvas background.
  - **Zoom**: Smooth scaling from $0.4\times$ to $2.5\times$ via toolbar buttons or mouse wheel.
  - **Fit View**: Instantly centers and resets canvas transform.
- **Hover Previews**: Floating summary overlay showing Name, Canonical ID, IP, MAC, Status, and Connection count.
- **Double-Click Hook**: Double-clicking a node preserves selection and switches the active workspace view to Systems.

---

## 7. Unified Selection Synchronization

Selection is mediated through `networkWorkspaceStore.selectedEntity`:
- Selecting a node, device, external endpoint, or connection in **Topology** updates `selectedEntity`.
- Navigating to **Overview**, **Systems**, **Traffic**, **Events**, **Security**, or **Interfaces** preserves the exact selected entity.

---

## 8. Real-Time Event Bus Synchronization & Degradation

1. **Live State Updates**: Events received from `NetworkEventBus` (`NodeDiscovered`, `NodeDisconnected`, `ConnectionOpened`, `ConnectionClosed`, etc.) update `networkWorkspaceStore`, which immediately re-projects the topology.
2. **Lag Detection**: If the bounded event ring buffer drops events, `networkEventsService` emits `onLag`, setting `status: "degraded"` and triggering snapshot resynchronization (`resync()`).
3. **Degraded Banner**: When degraded or stale, the toolbar displays a warning indicator with a one-click manual resynchronization trigger. Individual node availability remains untouched.

---

## 9. Deferred & Out-of-Scope Capabilities (Strict Phase Boundary)

The following capabilities are deliberately out of scope for N9 and deferred to later phases:
- **N10**: Node & Connection Inspection Workspace.
- **N11**: Unified Node Detail Inspector & Management.
- **N12**: Guardian Autonomous Defense & deep policy enforcement.
- **No interactive canvas physics engines** or force simulation animations.
- **No pairing / authentication handshake triggers**.
