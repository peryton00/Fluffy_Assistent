# Phase N10: Availability & Secure Pairing Architecture

## Executive Summary

Phase N10 introduces controlled node pairing and connection lifecycle management to the Fluffy Network Architecture. It builds directly upon the authoritative Rust Network Subsystem (established across N0–N9), enabling user-initiated connection and graceful disconnection workflows from the Network Workspace while strictly maintaining authoritative state invariants, non-blocking lock order, and transparent trust semantics.

---

## 1. Architectural Principles

### 1.1 Single Authoritative Reality
`NetworkState` is the sole source of truth for all node availability, authentication states, and active connection flows. Neither `ClusterManager`, `NetworkApi`, nor the React/Tauri frontend maintain parallel connection registries or independent lifecycle caches.

### 1.2 Canonical Connection & Pairing Lifecycle
Direct state skips (such as `Unknown -> Connected`, `Available -> Connected`, or `Disconnected -> Connected`) are strictly prohibited by domain validation rules.

Canonical connection path:
```text
Available ──► Pairing ──► Authenticating ──► Connected
```

Canonical reconnect path:
```text
Disconnected ──► Pairing ──► Authenticating ──► Connected
```
or session recovery where permitted:
```text
Disconnected ──► Recovering ──► Connected
```

### 1.3 N6 Ordering Invariant (State Mutation Before Event Publication)
To guarantee strict causality and eliminate race conditions across concurrent readers:
```text
┌──────────────────────────────────────┐
│  1. Acquire Mutex / Write Lock       │
│  2. Mutate Authoritative NetworkState│
│  3. Obtain Committed State Revision  │
│  4. Release State Lock               │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│  5. Publish NetworkEvent with        │
│     Committed State Revision         │
└──────────────────────────────────────┘
```

### 1.4 Transport & Trust Transparency
No legacy, development, or unauthenticated transport is ever labeled as cryptographically authenticated. Legacy transports (e.g. Python Cluster on TCP port 9000 and Rust Terminal Mesh) are explicitly classified as:
* `transport_mode`: `"legacy_compatibility"`
* `auth_mode`: `"compatibility"`

---

## 2. Component Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                 React / Tauri Frontend (UI)                 │
│  • NetworkSystemsView: Connect / Disconnect Buttons         │
│  • networkWorkspaceStore: Transient connectingNodeIds Set   │
│  • networkApi: Typed client with envelope unwrapping        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                   Tauri IPC / REST / WebSocket
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Rust NetworkApi (N7)                    │
│  • connect_node(req)                                        │
│  • disconnect_node(req)                                     │
│  • get_connection_info(req) -> Projection of NetworkState   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  ClusterManager (N4 / N10)                  │
│  • connect_node(): Runs state machine transitions           │
│  • disconnect_node(): Closes flows, updates availability    │
│  • get_connection_info(): Pure non-secret projection        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│   SharedNetworkState (N3)   │ │    NetworkEventBus (N6)     │
│   (Authoritative Single     │ │    (Bounded Non-blocking    │
│    Source of Truth)         │ │     Broadcast Channel)      │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## 3. Data Contracts & Projections

### 3.1 Connect & Disconnect Contracts
```rust
pub struct ConnectNodeRequest {
    pub request_id: Option<String>,
    pub protocol_version: NetworkProtocolVersion,
    pub node_id: NodeId,
}

pub struct ConnectNodeResponse {
    pub revision: u64,
    pub node: NetworkNode,
    pub connection: Option<NetworkConnection>,
}

pub struct DisconnectNodeRequest {
    pub request_id: Option<String>,
    pub protocol_version: NetworkProtocolVersion,
    pub node_id: NodeId,
}

pub struct DisconnectNodeResponse {
    pub revision: u64,
    pub node: NetworkNode,
}
```

### 3.2 Non-Secret Connection Projection (`ConnectionInfo`)
`ConnectionInfo` is dynamically projected from `NetworkNode` and any associated `NetworkConnection` in `NetworkState`:
```rust
pub struct ConnectionInfo {
    pub node_id: NodeId,
    pub node_name: String,
    pub hostname: Option<String>,
    pub availability: NodeAvailability,
    pub pairing_state: PairingState,
    pub auth_state: AuthenticationState,
    pub primary_ip: Option<String>,
    pub cluster_port: Option<u16>,
    pub transport_mode: Option<String>,
    pub auth_mode: Option<String>,
    pub active_connection_id: Option<ConnectionId>,
    pub connection_flow_state: Option<String>,
    pub last_seen_epoch: Option<u64>,
}
```

---

## 4. Frontend Integration & UI Invariants

1. **Transient UI State (`connectingNodeIds`)**:
   `connectingNodeIds` in `networkWorkspaceStore` tracks in-flight API requests solely to disable buttons and display progress spinners. It never overrides or synthesizes backend state.
2. **Event-Driven Lifecycle Sync**:
   Incoming events (`PairingStarted`, `AuthStarted`, `NodeConnected`, `NodeDisconnected`) update the store's node availability, auth state, and pairing state in real-time.
3. **Zero Emojis**:
   UI badges and buttons use semantic vector SVG icons and high-contrast color tokens.

---

## 5. Verification & Test Summary

* **Backend Rust (`core/`)**:
  * 148 automated unit and integration tests passing (`cargo test --lib` & `cargo test --bin fluffy-core`).
  * Validates lifecycle step transitions, idempotency, concurrent connects, N6 state-event ordering, connection info projections, and connection closures.
* **Frontend (`ui/tauri/`)**:
  * 307 automated tests across 45 test files passing (`npm test`).
  * Validates API client transports, store state mutations, lag recovery, and UI interactive views.
