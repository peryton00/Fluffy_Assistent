# Rust Cluster Management (Phase N4)

## 1. Purpose

Phase N4 establishes the canonical Rust-side Cluster Management domain service layer for Fluffy Assistant. While Phase N3 established the authoritative in-memory state store (`NetworkState`), Phase N4 introduces the lifecycle coordinator (`ClusterManager`), availability transition state machine, heartbeat health tracking, and non-destructive compatibility adapters for legacy and mesh transports.

---

## 2. Cluster Management Ownership vs NetworkState

The architectural relationship between `ClusterManager` and `NetworkState` strictly enforces a **single source of truth**:

```text
Terminal Mesh ──→ Terminal Adapter ──┐
                                    │
Python Cluster ─→ Compatibility ────┼→ Cluster Manager
                                    │          │
                                    │          ▼
                                    │    NetworkState (authoritative)
                                    │          │
                                    └──────────┘
```

* **`NetworkState`**: Owns the authoritative runtime data (nodes, devices, connections, interfaces, traffic, and monotonic revision counter).
* **`ClusterManager`**: Owns cluster management operations, availability transition validation, and heartbeat calculation over `SharedNetworkState`.
* **No Second Registry Invariant**: `ClusterManager` **does not** maintain a duplicate node map. All queries and mutations operate directly against `SharedNetworkState`.

---

## 3. Node Identity Strategy

Canonical node identity in Fluffy is strictly represented by `NodeId`:

```text
NodeId ≠ IP address ≠ MAC address ≠ Hostname ≠ Terminal Tag ≠ Python Machine UUID
```

- **Stability**: A node's `NodeId` remains invariant when DHCP lease addresses change, hostnames update, or transport connections drop and reconnect.
- **Compatibility Identifiers**: Discovered or legacy transport entities that lack cryptographic identity are explicitly assigned namespaced compatibility identifiers (e.g. `node_compat_term_<tag>`, `node_compat_python_<uuid>`) until Phase N5/N7 establish cryptographic node credentials.
- **No Inferred Identity**: IP addresses, MAC addresses, open ports, and subnet proximity are observations, not proof of cluster identity.

---

## 4. Managed Node Lifecycle & State Transitions

Node lifecycle is modeled explicitly via `NodeAvailability` and validated by `validate_transition`:

```text
                    ┌──────────────┐
                    │   Unknown    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
       ┌───────────►│  Available   │◄──────────┐
       │            └──────┬───────┘           │
       │                   │                   │
       │ (Re-advertise)    ▼ (Initiate Pairing)│
       │            ┌──────────────┐           │
       │            │   Pairing    │           │
       │            └──────┬───────┘           │
       │                   │                   │
       │                   ▼ (Advance to Auth) │
       │            ┌──────────────┐           │
       │            │Authenticating│           │
       │            └──────┬───────┘           │
       │                   │                   │
       │                   ▼ (Authenticated)   │
       │            ┌──────────────┐           │
       │            │  Connected   │───────────┤
       │            └──────┬───────┘           │
       │                   │                   │
       │                   ▼ (Missed HB)       │
       │            ┌──────────────┐           │
       │            │ Disconnected │           │
       │            └──────┬───────┘           │
       │                   │                   │
       │                   ▼ (Session Recovery)│
       │            ┌──────────────┐           │
       └────────────│  Recovering  │───────────┘
                    └──────────────┘ (Heartbeat Restored)
```

### Permitted Transitions:
- `Unknown` -> `Available`, `Disconnected`
- `Available` -> `Pairing`, `Disconnected`, `Unknown`
- `Pairing` -> `Authenticating`, `Available`, `Disconnected`, `Unknown`
- `Authenticating` -> `Connected`, `Available`, `Disconnected`, `Unknown`
- `Connected` -> `Disconnected`, `Recovering`, `Available`, `Unknown`
- `Disconnected` -> `Recovering`, `Available`, `Unknown`
- `Recovering` -> `Connected`, `Disconnected`, `Available`, `Unknown`
- Identity Transitions: `x -> x` (no-op attribute update)

**Authentication Boundary Rule**: Newly discovered or unauthenticated nodes MUST NOT transition directly from `Unknown` or `Available` to `Connected`. Connection requires navigating the canonical pairing and authentication path (`Available -> Pairing -> Authenticating -> Connected`) or recovering an already-authenticated session (`Recovering -> Connected`).

---

## 5. Availability vs Role Semantics

`NodeRole` and `NodeAvailability` are completely decoupled:

* **`NodeRole`** (Architectural responsibility):
  - `Standalone`: Local-only single-machine mode.
  - `Admin`: Controller node administering cluster participants.
  - `Worker`: Dedicated compute/telemetry worker.
  - `Peer`: Symmetrical cluster peer.

* **`NodeAvailability`** (Dynamic reachability):
  - `Available`, `Pairing`, `Authenticating`, `Connected`, `Disconnected`, `Recovering`, `Unknown`.

For example, a node can be `NodeRole::Admin` while being `NodeAvailability::Connected` or `NodeAvailability::Disconnected`.

---

## 6. Heartbeat Semantics & Disconnect/Recovery

Heartbeat monitoring is governed by `HeartbeatConfig` (default: 5s interval, 15s timeout, 3 missed cycles threshold):
1. **Heartbeat Observation**: `ClusterManager::record_heartbeat(node_id, epoch_sec)` updates the node's `last_seen_epoch` in `NetworkState`.
2. **Authentication Distinction**: Heartbeat proves liveness and reachability, NOT authentication.
   - For an already-authenticated `Connected` node, heartbeat maintains the `Connected` state and refreshes timestamps.
   - For a node in `Recovering` status whose session was already authenticated (`auth_state == Authenticated`), heartbeat restores `Connected` status.
   - For `Disconnected` or unauthenticated nodes, heartbeat **does not** automatically establish a trusted `Connected` state.
3. **Timeout Detection**: `ClusterManager::process_heartbeat_timeouts(now_sec)` identifies nodes exceeding `timeout_sec` and marks them `Disconnected`.
4. **Identity Preservation**: A missed heartbeat or connection timeout **never deletes the node from `NetworkState`**. Disconnects represent transient network state, whereas unregistration represents explicit node removal.

---

## 7. Connection Relationships

Cluster transport connections are represented by `NetworkConnection` with `kind: ConnectionKind::ClusterTransport`:
* `NetworkConnection::associated_node_id` points to the canonical `NodeId`.
* A single `NodeId` can own multiple connections over time (reconnects, multi-homed interfaces, distinct stream channels).
* `ConnectionId` remains strictly distinct from `NodeId`.

---

## 8. Terminal Mesh Adapter (`TerminalMeshAdapter`)

Provides a non-destructive translation layer from the existing Rust Terminal Mesh state (`core/src/terminal/app_state.rs`):
* Translates `ClientInfo` (tag, hostname, os, os_version, ip, arch) into a canonical `NetworkNode`.
* **Session Correlation vs Canonical Identity**: Terminal tags (`f1`, `[1]`, `[2]`) are session/UI correlation tags, NOT permanent hardware or node identities. When no stable negotiated `NodeId` exists, an explicitly ephemeral identity (`NodeId::ephemeral()`) is generated.
* Represents an already-established local Terminal transport session (`node.role = NodeRole::Worker`, `node.availability = NodeAvailability::Connected`, `node.auth_state = AuthenticationState::Authenticated`, `adapter_source: "terminal_mesh"`).
* Constructs an associated `NetworkConnection` referencing `NodeId` on port 9000.
* Existing Terminal REPL, WebSocket bridge, and message routing continue to function untouched.

---

## 9. Python Cluster Compatibility Adapter (`PythonClusterAdapter`)

Provides a non-destructive compatibility bridge for legacy Python cluster state (`fluffy/network/`):
* Translates `PythonMachineEntry` into canonical `NetworkNode` and `NetworkConnection`.
* Maps legacy role strings (`"admin"`, `"available"`, `"worker"`, `"peer"`) to canonical `NodeRole`.
* Maps legacy status strings (`"online"`, `"available"`, `"offline"`, `"recovering"`) to canonical `NodeAvailability`.
* Tags metadata with `adapter_source: "python_cluster"`.

---

## 10. Legacy Coexistence

During Phase N4:
* `fluffy/network/*` (Python role manager, heartbeat, connection manager, server, client) remains fully functional and untouched.
* `core/src/terminal/*` (Rust Terminal Mesh, router, app state, repl) remains fully functional and untouched.
* `ClusterManager` acts as the unifying Rust layer that will orchestrate the full migration in subsequent phases.

---

## 11. Security & Trust Boundary

N4 defines the state machine for pairing and authentication states, but does not implement cryptographic key exchange or authentication handshakes:
* Discovered endpoints remain in `NodeAvailability::Available` / candidate status until verified.
* No remote administrative commands (process termination, restart, shell execution) can be dispatched from N4.
* Remote control and capability dispatch remain strictly gated by the Rust capability/policy engine.

---

## 12. Port 9000 Collision Status

The known port 9000 collision (Rust Terminal Mesh on TCP 9000 vs Python Cluster on HTTP 9000) is documented and preserved for backward compatibility in N4. Port migration and transport consolidation will take place during unified transport implementation.

---

## 13. EventBus & API Boundaries

* **No EventBus in N4**: State transition event broadcasting and subscription channels are deferred to **Phase N6: Event System**.
* **No API/Tauri Changes in N4**: Public IPC commands and frontend store updates are deferred to **Phase N7: Network API & Contracts**.
* **No UI Changes**: Network Operations workspace is deferred to **Phase N8+**.

---

## 14. How Phase N5 Will Build on Cluster Management

Phase N5 (Network Discovery & Telemetry) will:
1. Feed active discovery scans directly into `ClusterManager::register_node` and `NetworkState::ingest_local_devices`.
2. Attach live throughput rates and top talkers to managed nodes.
3. Stream socket flow updates to `NetworkConnection` entries.

---

## 15. Eventual Migration Path

```text
Phase N3: Authoritative State Core (NetworkState)
Phase N4: Cluster Management & Compatibility Adapters (CURRENT)
Phase N5: Discovery & Telemetry Integration
Phase N6: Event System & Subscriptions
Phase N7: Stable API & IPC Contracts
Phase N8+: Network Operations UI Workspace
Final: Deprecate Legacy Python Cluster and Route All Mesh Transports via Rust Core
```
