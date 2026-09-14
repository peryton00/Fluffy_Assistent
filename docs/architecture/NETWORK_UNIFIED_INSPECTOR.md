# Unified Network Inspector Architecture (Phase N11)

## 1. Executive Summary

Phase N11 establishes a single, unified, read-only Inspector panel for the Fluffy Desktop Network Workspace. The Inspector provides structured inspection across all 7 workspace views (`Overview`, `Systems`, `Topology`, `Traffic`, `Events`, `Security`, `Interfaces`) for 5 canonical entity types:
1. `node` (Cluster nodes)
2. `device` (Discovered LAN neighbors)
3. `connection` (Active cluster transports and socket flows)
4. `interface` (Host network adapters)
5. `external_endpoint` (Derived WAN target endpoints)

The Inspector adheres strictly to the authoritative state architecture established in N6–N10: it does NOT maintain secondary caches, does NOT introduce background polling loops, does NOT create Inspector-specific event subscriptions, and does NOT synthesize fake backend nodes or devices.

---

## 2. Selection Representation & Lifecycle

### 2.1 Canonical Selection Model

Selection state is owned globally by `networkWorkspaceStore` and represented as:

```typescript
export type NetworkEntityType =
  | "node"
  | "device"
  | "connection"
  | "interface"
  | "external_endpoint"
  | "none";

export interface NetworkEntitySelection {
  type: "node" | "device" | "connection" | "interface" | "external_endpoint" | "none";
  id: string;
}
```

The store holds only `{ type, id }` identity pointers, never serialized or cached snapshots of entity objects.

### 2.2 Live Projection & Entity Resolution

On every state update or snapshot ingestion, `resolveSelectedEntity(selection, state)` resolves the live object directly from canonical `networkWorkspaceStore` state slices:
- `node` -> `state.nodes.find(n => n.id === id)`
- `device` -> `state.devices.find(d => d.id === id)`
- `connection` -> `state.connections.find(c => c.id === id)`
- `interface` -> `state.interfaces.find(i => i.name === id)`
- `external_endpoint` -> derived on-the-fly from `state.connections.filter(c => c.remote_addr === remoteIp)`

### 2.3 Entity State vs Entity Existence

The Inspector distinguishes between an entity's operational lifecycle state and its presence in the workspace:
- **State Changes (e.g. Connected -> Disconnected)**: The entity remains in `state.nodes` with `availability: "disconnected"`. The Inspector stays open, updates reactively, and displays the canonical `DISCONNECTED` status badge.
- **Entity Removal**: When an entity is removed from authoritative state (or a closed connection is pruned), `resolveSelectedEntity` returns `null`. The Inspector displays an explicit **Entity Unavailable / Removed** notice with a button to dismiss or navigate back.
- **Synchronization State**: Degraded or stale workspace synchronization (e.g., event lag or disconnected websocket) is surfaced via a subtle `STALE SYNC` indicator in the header without corrupting or overriding the canonical entity properties.

---

## 3. Derived External Endpoints

External endpoints represent remote WAN targets observed in active socket flows (e.g., DNS servers, cloud APIs, peer endpoints).

- **Deterministic Identity**: `external:<remote_addr>` (e.g. `external:1.1.1.1`).
- **Zero Backend Pollution**: External endpoints are NEVER persisted in Rust `NetworkState` as fake `NetworkNode` or `NetworkDevice` entries.
- **Aggregation**: If multiple connections reference the same remote address, the Inspector aggregates all associated flows under that single endpoint.
- **Labeling**: Explicitly tagged as `External Endpoint` / `WAN Target` with full flow telemetry and target port summaries.

---

## 4. Cross-View Navigation & Interaction

All 7 Network views share the same global selection. Selecting an entity in any view instantly updates the Inspector. Users can seamlessly cross-navigate between subviews using context-aware action buttons:
- `View in Topology`: Switches active view to `topology` and focuses the selected node/device/connection.
- `View in Systems`: Switches active view to `systems` (for cluster nodes and devices).
- `View in Traffic`: Switches active view to `traffic` (for active connections, nodes, and interfaces).
- `View in Interfaces`: Switches active view to `interfaces` (for host network interfaces).

Keyboard shortcut `Escape` immediately deselects the current entity and closes the Inspector panel.

---

## 5. Architectural Invariants

1. **Authoritative Projection**: All inspected fields (IPs, MACs, roles, auth states, pairing states, flow bytes, rates) originate directly from Rust N7 `NetworkState`. Zero fabricated or guessed metadata.
2. **Zero Secondary Storage**: No `InspectorStore`, no `InspectorCache`, and no independent entity registry.
3. **No Independent Event Subscriptions or Polling**: The Inspector relies 100% on existing `networkWorkspaceStore` event ingestion (`NetworkEventBus` over Tauri IPC).
4. **Style Compliance**: Zero emojis across all section components, headers, badges, and fallback states. Clean typography and vector SVGs only.
