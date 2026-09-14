# Rust Network API & Contracts (Phase N7)

## 1. Purpose & Scope

Phase N7 establishes a stable, Rust-owned Network API and contract layer for the Fluffy Assistant network subsystem (`core/src/network/`).

The Network API serves as the formal boundary through which external consumers interact with network infrastructure:
- **Tauri / React UI** (Phase N8+ Network Workspace)
- **Python Brain** (Intelligence and reasoning engine)
- **Guardian** (Phase N12 security analysis)

### Scope Constraints
- **Strictly Read-Only in N7**: No mutating operations, pairing workflows, connection initiation, process terminations, or remote administration.
- **Zero Duplicate State**: `NetworkState` remains the single authoritative store of runtime reality. The API layer is a thin transformation interface, not a state store.
- **Canonical Event Model**: `NetworkEventBus` remains canonical for event publishing; events are transient notifications, not persistent storage.

---

## 2. API Ownership & System Architecture

```text
                  NetworkSubsystem
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       NetworkState            NetworkEventBus
     (Authoritative)             (Canonical)
             │                       │
             └───────────┬───────────┘
                         ▼
                    Network API
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     Tauri / UI     Python Brain     Guardian
      (Phase N8)    (Intelligence)  (Phase N12)
```

### Core Invariants
1. **NetworkState Remains Authoritative**: All queries inspect the thread-safe `SharedNetworkState`. The API layer caches nothing and owns no long-lived entity collections.
2. **NetworkEventBus Remains Canonical**: Event subscriptions bridge directly to the bounded broadcast ring buffer.
3. **No Second State Store**: Request-scoped transformation DTOs are generated on demand and detached from internal locks.
4. **Lock Safety**: State read locks are held only for the minimum duration required to clone immutable snapshots or entity DTOs. No locks are held across serialization, network I/O, or event delivery.

---

## 3. Protocol Versioning

The API enforces structured contract versioning through `NetworkProtocolVersion`:

```rust
pub struct NetworkProtocolVersion {
    pub major: u32,
    pub minor: u32,
}
```

- **Current Version**: `1.0` (`CURRENT = NetworkProtocolVersion { major: 1, minor: 0 }`).
- **Compatibility Rules**:
  - `major` must match exactly (breaking schema or semantic changes).
  - `minor` must be `<= CURRENT.minor` (backward-compatible extensions).
- **Unsupported Version Handling**: Requests providing an incompatible version fail immediately with structured error `NetworkApiError::UnsupportedVersion`.

---

## 4. Request Correlation & RequestId

Every API request and response is correlated using a strongly typed `RequestId`:

```rust
pub struct RequestId(String);
```

- **Random Generation**: Prefixed with `req_` followed by a UUID v4 (e.g. `req_550e8400-e29b-41d4-a716-446655440000`).
- **Identity Distinction**: Strictly distinguished from `EventId` (`evt_`), `NodeId` (`node_`), `DeviceId` (`dev_` / `dev_mac_` / `dev_ephem_`), and `ConnectionId`.
- **Correlation**: The response envelope mirrors the exact `request_id` passed in the request.

---

## 5. Serialized Error Contract

All API errors are modeled by `NetworkApiError`, ensuring client safety and preventing internal secret leakage:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum NetworkApiError {
    InvalidRequest { message: String },
    UnsupportedVersion { requested: String, supported: String },
    ResourceNotFound { resource_type: String, id: String },
    InvalidNetworkState { message: String },
    SubsystemUnavailable { message: String },
    Timeout { message: String },
    Internal { message: String },
}
```

- **Safety Guarantee**: Does not expose passwords, private keys, authentication tokens, raw file system paths, or unvetted OS diagnostics.
- **Conversion Boundary**: Native `NetworkError` domain errors are mapped automatically via `From<NetworkError>`.

---

## 6. Request / Response Contracts (Read-Only N7 Surface)

All responses can be returned directly or wrapped in the standard `NetworkApiResponse<T>` envelope:

```rust
pub struct NetworkApiResponse<T> {
    pub request_id: RequestId,
    pub protocol_version: NetworkProtocolVersion,
    pub timestamp_epoch_ms: u64,
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<NetworkApiError>,
}
```

### Operation Catalog

| Operation | Request DTO | Response DTO | Description |
|---|---|---|---|
| `get_snapshot` | `GetNetworkSnapshotRequest` | `GetNetworkSnapshotResponse` | Point-in-time coherent snapshot of entire `NetworkState` |
| `list_nodes` | `ListNodesRequest` | `ListNodesResponse` | List all authoritative cluster nodes with revision |
| `get_node` | `GetNodeRequest` | `GetNodeResponse` | Retrieve single cluster node by `NodeId` |
| `list_devices` | `ListDevicesRequest` | `ListDevicesResponse` | List all discovered network devices with revision |
| `get_device` | `GetDeviceRequest` | `GetDeviceResponse` | Retrieve single network device by `DeviceId` |
| `list_connections` | `ListConnectionsRequest` | `ListConnectionsResponse` | List all active transport connections and socket flows |
| `get_connection` | `GetConnectionRequest` | `GetConnectionResponse` | Retrieve single connection by `ConnectionId` |
| `list_interfaces` | `ListInterfacesRequest` | `ListInterfacesResponse` | List all host interface adapters with revision |
| `get_interface` | `GetInterfaceRequest` | `GetInterfaceResponse` | Retrieve single host interface by `NetworkInterfaceId` |
| `get_traffic` | `GetTrafficRequest` | `GetTrafficResponse` | Retrieve aggregate traffic metrics with revision |
| `get_capabilities` | `GetCapabilitiesRequest` | `GetCapabilitiesResponse` | Query current implemented capabilities metadata |
| `subscribe` | *N/A (Streaming)* | `EventSubscriber` | Stream canonical `NetworkEvent` occurrences |

---

## 7. Snapshot Semantics & Revision Correlation

A consumer requesting network state receives a point-in-time `NetworkStateSnapshot` containing:
- `revision: u64`: Monotonically increasing revision counter incremented on every state mutation.
- `captured_at_epoch_ms: u64`: Timestamp when snapshot was detached.
- Coherent collections of `nodes`, `devices`, `connections`, `interfaces`, and `traffic`.

This guarantees that consumers never observe split-brain state (e.g. nodes from revision 5 paired with connections from revision 8).

---

## 8. Event Subscription & Delivery Semantics

Events emitted by `NetworkEventBus` represent ephemeral occurrences and state change notifications:
- **Canonical Type**: Preserves `EventId`, `sequence`, `timestamp_epoch_ms`, `category`, `severity`, `event_type`, entity identities, `details`, and `state_revision`.
- **Monotonic Sequence**: Sequence numbers increase strictly monotonically per process execution.
- **Bounded Buffer & Lag Detection**: Slow subscribers drop oldest events when the buffer overflows and receive `EventTryRecvError::Lagged(n)` / `EventRecvError::Lagged(n)`.
- **No Historical DB**: Events are not persisted to a database and cannot be replayed from arbitrary historical points.

### Recommended Client Synchronization Pattern
1. Request an initial `NetworkStateSnapshot` and record its `revision`.
2. Subscribe to `NetworkApi::subscribe()`.
3. Process subsequent incoming `NetworkEvent`s.
4. If a `Lagged` error is encountered, discard local volatile state, fetch a fresh snapshot, and resume streaming.

---

## 9. Capabilities & Metadata Contract

`NetworkCapabilitiesMetadata` reports currently implemented, active subsystem capabilities:
- `protocol_version`: Current protocol version (`1.0`).
- `subsystem_available`: Availability flag (`true` when initialized).
- `supported_read_operations`: List of supported read queries.
- `supported_event_categories`: List of supported `EventCategory` variants (`Cluster`, `Network`, `Discovery`, `Telemetry`, `Connection`, `Security`, `Admin`, `System`).
- `supported_connection_kinds`: List of supported `ConnectionKind` variants (`LocalSocketFlow`, `ClusterTransport`, `IpcStream`, `WebSocketBridge`).
- `supported_node_roles`: List of supported `NodeRole` variants (`Standalone`, `Admin`, `Worker`, `Peer`).
- `telemetry_supported`: `true`.
- `event_buffer_capacity`: Ring buffer size (default `1024`).

No future, unimplemented, or speculative capabilities (such as pairing or remote admin) are claimed.

---

## 10. Boundary Preservation & Future Phases

- **N3 / N6 Foundation**: N7 builds directly upon N3 `NetworkState` and N6 `NetworkEventBus`.
- **Phase N8 (Network Workspace UI)**: Will consume N7 read queries and event subscriptions to render the operations dashboard and topology.
- **Phase N10 (Authenticated Pairing)**: Will introduce explicit pairing commands to the API layer.
- **Phase N12 (Guardian Security Integration)**: Will consume read-only snapshots and security observations from N7.
- **Phase N13 (Remote Node Administration)**: Will add authorized admin dispatch commands.
- **Transport Ports**: Retained unchanged (Cluster Mesh 9000, Terminal Mesh 9001, Command IPC 9002, WebSocket Bridge 9003). Port conflict resolution is deferred to transport migration phases.
