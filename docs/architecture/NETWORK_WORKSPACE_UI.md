# Phase N8: Network Workspace UI Architecture & Implementation Guide

## 1. Purpose & Scope

Phase N8 establishes the first unified **Network Operations Workspace** UI for Fluffy Desktop (`ui/tauri/`), directly backed by the Rust-owned Network subsystem and the stable N7 Network API & Contracts.

The primary objective is operational data presentation and real-time event synchronization across distributed cluster nodes, discovered network devices, active socket flows, host network interfaces, traffic metrics, and security observations.

### Scope Boundaries:
- **Phase N8 (Current Phase)**:
  - Persistent Network Workspace shell and domain navigation.
  - 7 operational views: **Overview**, **Systems**, **Topology**, **Traffic**, **Events**, **Security**, and **Interfaces**.
  - Single coherent client-side state cache (`networkWorkspaceStore.ts`).
  - Authoritative point-in-time snapshot synchronization (`GET /network/snapshot`).
  - Real-time event stream subscription (`NetworkEventBus` WebSocket / bridge).
  - Event lag detection (`onLag`) and automatic degraded-state resynchronization.
  - Bounded in-memory event window (maximum 200 events).
  - Shared entity selection foundation (`NetworkEntitySelection`).
  - Visual and behavioral zero-emoji compliance with Fluffy's design system.
- **Strictly Deferred to Future Phases (N9+)**:
  - *Phase N9*: Interactive topology canvas, graph layout physics, zoom/pan, drag-and-drop, and link editing.
  - *Phase N10*: Node pairing workflows, authentication handshakes, and `CONNECT` actions.
  - *Phase N11*: Detailed entity inspectors, deep system telemetry pages, and node detail modals.
  - *Phase N12*: Guardian behavioral risk engines, intrusion analysis, and automated network mitigations.
  - *Phase N13*: Historical traffic time-series databases and persistent event logs.

---

## 2. Workspace Navigation & Structural Breakdown

The Network Workspace is organized into 7 distinct operational sections accessible via the contextual sidebar:

```text
NETWORK WORKSPACE
├── 1. Overview      -> High-level operational health, KPI metrics, talkers, sync state
├── 2. Systems       -> Authoritative Cluster Nodes & Discovered Subnet Devices
├── 3. Topology      -> Structural blueprint surface of nodes, devices, and interfaces
├── 4. Traffic       -> Live traffic rates, throughput, packet counters, active socket flows
├── 5. Events        -> Real-time bounded log of canonical NetworkEvents with sequence & details
├── 6. Security      -> Network security observations, anomalies, and policy alerts
└── 7. Interfaces    -> Host network adapter details, MAC, IPv4/IPv6, MTU, and link throughput
```

### Navigation Integration:
- `ActivityBar.tsx`: Registers `"network"` as a top-level domain icon (`NetworkIcon`).
- `ContextualSidebar.tsx`: Dynamically renders the 7 views declared in `DOMAIN_DEFINITIONS.network`.
- `Workspace.tsx`: Lazy-loads `NetworkWorkspace.tsx` in full-bleed desktop layout.
- `uiStore.ts`: Manages active domain and `networkSection` state transitions.

---

## 3. UI → N7 API Architecture & Synchronization Model

```text
+-------------------------------------------------------------------------+
|                              RUST BACKEND                               |
|                                                                         |
|  OS / Sockets / ARP  -->  NetworkState  -->  NetworkEventBus (Bounded)   |
|                             (Authoritative)        |                    |
|                                   ^                |                    |
|                                   |                v                    |
|                            N7 HTTP REST      N7 WebSocket Stream        |
+-----------------------------------+----------------+--------------------+
                                    |                |
                                    | (JSON)         | (JSON Events)
                                    v                v
+-------------------------------------------------------------------------+
|                        TAURI FRONTEND CLIENT LAYER                      |
|                                                                         |
|    networkApi.ts                          networkEvents.ts              |
|    - fetchNetworkSnapshot()               - onEvent()                   |
|    - fetchNetworkCapabilities()           - onLag(droppedCount)         |
|                     \                            /                      |
|                      v                          v                       |
|               +-----------------------------------------+               |
|               |        networkWorkspaceStore.ts         |               |
|               | (Central Client Cache & View-Model)     |               |
|               +-----------------------------------------+               |
|                                    |                                    |
|                                    v                                    |
|               +-----------------------------------------+               |
|               |          NetworkWorkspace.tsx           |               |
|               |   [Overview, Systems, Topology, etc.]   |               |
|               +-----------------------------------------+               |
+-------------------------------------------------------------------------+
```

### Invariants:
1. **Rust Authority**: The Rust `NetworkState` remains the single source of authoritative truth. The client layer maintains only a cached view-model representation.
2. **Snapshot Initialization**: On mounting `NetworkWorkspace`, `networkWorkspaceStore.initialize()` fetches a full coherent snapshot (`fetchNetworkSnapshot()`) and establishes the WebSocket event subscription.
3. **Targeted Event Application**: When `NetworkEvent`s arrive over the stream:
   - Node events (`NodeDiscovered`, `NodeDisconnected`, etc.) update or append to `nodes[]`.
   - Device events (`DeviceDiscovered`, `DeviceRemoved`) mutate `devices[]`.
   - Connection events (`ConnectionOpened`, `ConnectionClosed`) mutate `connections[]`.
   - Interface events (`InterfaceUpdated`, `InterfaceRemoved`) mutate `interfaces[]`.
   - Events are prepended to the bounded `events[]` window (capped at 200).
   - Monotonic revision is updated: `Math.max(current_revision, event.state_revision)`.

---

## 4. Event Lag Detection & Self-Healing Resynchronization

Because broadcast channels (`tokio::sync::broadcast`) drop oldest messages if a client falls behind, N7 emits `EventTryRecvError::Lagged(dropped_count)`:

```text
[Broadcast Buffer Overflow]
           |
           v
[networkEventsService receives lag notification]
           |
           v
[onLag callback triggered in networkWorkspaceStore]
           |
           +---> 1. Mark status: "degraded", isStale: true
           |     2. Render yellow "Event Lag Detected" warning banner in UI
           |
           v
[Automatic Resync: fetchNetworkSnapshot()]
           |
           v
[Snapshot applied: status -> "healthy", isStale -> false, revision updated]
           |
           v
[UI recovers to healthy state with 0 user intervention]
```

---

## 5. Shared Entity Selection Model

To support seamless cross-view entity inspection in N8 and future N9/N11 phases, `networkWorkspaceStore` defines a standardized selection model:

```typescript
export interface NetworkEntitySelection {
  type: "node" | "device" | "connection" | "interface" | "none";
  id: string | null;
}
```

- Clicking any row in Systems, Connections, or Interfaces highlights the row and selects the entity.
- The workspace header displays a selected entity badge (e.g. `Selected: node:node-alpha`) with a clear button (`XIcon`).
- Selecting an entity updates `selectedEntity` across all 7 views.

---

## 6. Legacy UI Coexistence & Preservation Principle

Following the **KEEP / EXTEND / ADAPTER / REPLACE** architectural rule:
- Legacy network stores and views are preserved under `src/features/systems/` and `src/stores/`:
  - `localNetworkStore.ts` & `LocalNetworkView.tsx`: Preserved for local LAN scans.
  - `networkIntelligenceStore.ts` & `NetworkIntelligenceView.tsx`: Preserved for intelligence graphs.
  - `networkStore.ts` & `NetworkView.tsx`: Preserved for legacy Python cluster integration.
- No existing tests or functionality were broken or deprecated.

---

## 7. Verification & Test Coverage

The implementation includes comprehensive unit and integration tests across all required criteria:

| Test Identifier | Description | Test Location |
| :--- | :--- | :--- |
| **A** | Initial snapshot loading | `networkWorkspaceStore.test.ts` |
| **B** | Snapshot populates nodes, devices, connections, interfaces, traffic | `networkWorkspaceStore.test.ts` |
| **C & D** | Targeted node event application (`NodeDiscovered`, `NodeDisconnected`) | `networkWorkspaceStore.test.ts` |
| **E** | Device event application (`DeviceDiscovered`, `DeviceRemoved`) | `networkWorkspaceStore.test.ts` |
| **F** | Connection event application (`ConnectionClosed`) | `networkWorkspaceStore.test.ts` |
| **G** | Interface event application (`InterfaceRemoved`) | `networkWorkspaceStore.test.ts` |
| **H** | Security observation event capture | `networkWorkspaceStore.test.ts` |
| **I & J** | Bounded event list (capped at 200) & latest-first ordering | `networkWorkspaceStore.test.ts` |
| **K** | Event lag detection (`onLag` -> `status: "degraded"`) | `networkWorkspaceStore.test.ts` |
| **L** | Self-healing snapshot resynchronization after lag | `networkWorkspaceStore.test.ts` |
| **M, N, O, P** | Loading, empty, error, and stale state representations | `networkWorkspaceStore.test.ts` |
| **Q** | Shared selection foundation (`selectEntity`, `clearSelection`) | `networkWorkspaceStore.test.ts` |
| **R** | Zero regression across all 41 test files (271 tests passing) | Full test suite (`npm test`) |
