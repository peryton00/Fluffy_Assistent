# Authoritative Network State (Phase N3)

## 1. Why NetworkState Exists

Prior to Phase N3, network knowledge in Fluffy was fragmented across multiple independent runtime layers:
* Native OS network collectors in Rust (`core/src/network/`) producing raw, ephemeral scans (`LocalNetworkDevice`, `NetworkFlow`, `NetworkInterfaceInfo`).
* Terminal Mesh transport state (`core/src/terminal/`) tracking WebSocket-based client sessions (`ClientInfo`).
* Legacy Python Cluster Network (`fluffy/network/`) maintaining its own independent node list and role assignments.
* Frontend React/Zustand stores attempting to stitch disparate polling intervals together.

This fragmentation created race conditions, duplicate device identities, and security hazards (e.g. unverified nodes executing administrative actions).

`NetworkState` resolves this by establishing the **single authoritative in-memory representation of network reality** within the Rust core. All downstream consumers (UI, Python Brain, Guardian, APIs) query this state through controlled, immutable snapshots.

---

## 2. Rust Ownership & Flow Direction

Rust Network strictly owns the authoritative runtime representation. Ownership flows strictly in one direction:

```text
               OS / Native Network Reality
                           │
                           ▼
          Rust Network Collectors / Future Mesh
                           │
                           ▼
        Authoritative NetworkState (core::network)
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
   Point-in-Time Snapshot        Controlled Queries
   (NetworkStateSnapshot)       (read locks / filters)
            │                             │
    ┌───────┴──────────────┬──────────────┴──────────────┐
    ▼                      ▼                             ▼
Frontend UI          Python Brain                    Guardian
(Read-Only)          (Read-Only Analysis)            (Policy/Security)
```

### Invariants:
1. **No Foreign Ownership**: Python Brain, Guardian, and UI stores **NEVER** hold authoritative state or write directly into network collections.
2. **No Second Registries**: No secondary cluster registries are permitted in Python or TypeScript.

---

## 3. State Entities & Canonical Collections

`NetworkState` owns five canonical collections indexed by strongly typed domain IDs:

| Entity | Key Type | Collection Type | Purpose |
| :--- | :--- | :--- | :--- |
| **Nodes** | `NodeId` | `HashMap<NodeId, NetworkNode>` | Fluffy cluster participants (Admin, Worker, Peer, Standalone) |
| **Devices** | `DeviceId` | `HashMap<DeviceId, NetworkDevice>` | Discovered LAN endpoints (printers, gateways, hosts, workstations) |
| **Connections** | `ConnectionId` | `HashMap<ConnectionId, NetworkConnection>` | Active socket flows, mesh transports, and IPC bridges |
| **Interfaces** | `NetworkInterfaceId` | `HashMap<NetworkInterfaceId, NetworkInterfaceInfo>` | Host physical/virtual network adapters and addresses |
| **Traffic** | N/A | `TrafficMetrics` | Aggregate throughput rates, counters, and top talkers |

---

## 4. Identity Rules & Hierarchy

Strict domain invariants prevent identity conflation:

```text
NodeId ≠ DeviceId ≠ ConnectionId ≠ NetworkInterfaceId ≠ IP Address ≠ MAC Address
```

* `NodeId`: Explicit logical cluster identity (cryptographically authenticated in N4+).
* `DeviceId`: Hardware-anchored identity derived from normalized MAC address (`dev_mac_<hex>`) or explicitly marked ephemeral identity (`dev_ephem_<uuid>`).
* `ConnectionId`: Unique logical connection or socket flow key.
* `NetworkInterfaceId`: Operating system adapter identifier (e.g., `eth0`, `Wi-Fi`).

**Cluster Membership Invariant**: A discovered `NetworkDevice` is **never** automatically promoted to a `NetworkNode`. A device only associates with a node through explicit, verified association (`associated_node_id`).

---

## 5. Observation vs Identity Separation

`NetworkState` cleanly separates immutable/stable identity from dynamic observations:

```text
Identity (Stable / Canonical)
 ├── NodeId
 ├── DeviceId
 ├── ConnectionId
 └── NetworkInterfaceId

Dynamic Observations (Mutable over time)
 ├── Observed IP addresses (DHCP lease renewals)
 ├── Observed Hostnames (mDNS / NetBIOS)
 ├── Active listening & connected ports
 ├── Traffic rates and packet counts
 ├── Reachability status & latency
 └── First-seen / Last-seen timestamps
```

When a device renews its DHCP lease from `192.168.1.50` to `192.168.1.150`, its `DeviceId` (anchored to its MAC address) remains identical. The state mutates the `ip_address` and `last_seen_epoch` fields without creating a ghost device.

---

## 6. Mutation & Query Boundaries

### Controlled Mutations
All mutations validate domain invariants and reject invalid states:
* `upsert_node(node)`: Validates node ID, hostname, and OS bounds.
* `remove_node(id)`: Safely removes cluster node.
* `upsert_device(device)`: Validates device ID and IP formatting.
* `remove_device(id)`: Removes discovered device.
* `upsert_connection(conn)`: Validates socket endpoints and protocols.
* `remove_connection(id)`: Removes connection/flow.
* `upsert_interface(iface)`: Validates interface ID.
* `remove_interface(id)`: Removes interface.
* `update_traffic(metrics)`: Updates throughput rates and top talkers.

### Controlled Queries
Queries always return owned copies (`Clone`) to prevent callers from holding internal references or mutating internal state without bumping revisions:
* `get_node(&NodeId) -> Option<NetworkNode>`
* `list_nodes() -> Vec<NetworkNode>`
* `get_device(&DeviceId) -> Option<NetworkDevice>`
* `list_devices() -> Vec<NetworkDevice>`
* `get_connection(&ConnectionId) -> Option<NetworkConnection>`
* `list_connections() -> Vec<NetworkConnection>`
* `get_interface(&NetworkInterfaceId) -> Option<NetworkInterfaceInfo>`
* `list_interfaces() -> Vec<NetworkInterfaceInfo>`
* `get_traffic() -> TrafficMetrics`

---

## 7. Revision Semantics

`NetworkState` maintains a monotonically increasing `u64` revision counter:
* Initialized to `0` at creation.
* Incremented by exactly `1` on every successful state mutation (`upsert` or `remove`).
* State queries and snapshots capture this revision.
* Enables efficient delta checks and cache invalidation without deep diffing.

---

## 8. Snapshot Semantics (`NetworkStateSnapshot`)

A `NetworkStateSnapshot` is an immutable, point-in-time clone of the authoritative state:
* Contains `revision`, `captured_at_epoch_ms`, and flat vectors of all canonical entities.
* Completely detached from internal locks and memory structures.
* Guaranteed safe for serialization (`serde::Serialize`, `serde::Deserialize`).
* Zero secret exposure: Excludes passwords, credentials, tokens, and lock primitives.

---

## 9. Concurrency Model (`SharedNetworkState`)

`SharedNetworkState` wraps `NetworkState` in `Arc<RwLock<NetworkState>>`:
* **Multiple Readers**: Concurrent collectors, API handlers, and UI polling tasks can read snapshots simultaneously without contention.
* **Exclusive Writers**: Mutations acquire short-lived exclusive write locks, guaranteeing atomicity.
* **No Async Lock Contention**: Standard library `RwLock` is used, avoiding async runtime deadlocks across thread boundaries.

---

## 10. Local Network Adapter Boundary

Existing native collectors (`interfaces`, `flows`, `discovery`, `capture`, `wifi`) continue operating independently and non-destructively.

`NetworkState` provides explicit non-destructive ingestion adapters:
* `ingest_local_devices(&[LocalNetworkDevice])`: Translates raw ARP observations into canonical `NetworkDevice` models.
* `ingest_local_flows(&[NetworkFlow])`: Translates active OS socket flows into canonical `NetworkConnection` models.
* `ingest_local_interfaces(&[NetworkInterfaceInfo])`: Ingests interface adapters directly.

Existing capability endpoints (`network_list_interfaces`, `network_get_local_devices`, etc.) remain fully functional and unchanged.

---

## 11. Legacy Python Cluster Coexistence

During Phase N3:
* Legacy Python cluster network in `fluffy/network/` remains **completely untouched**.
* Python role manager, heartbeat, and remote execution paths continue to function during the transition.
* `NetworkState` establishes the authoritative foundation in Rust that Phase N4 (Cluster Management) will populate and eventually use to supersede Python cluster logic.

---

## 12. Terminal Mesh Coexistence

* `core/src/terminal/` remains transport-specific and untouched.
* Terminal sessions and `ClientInfo` structures are not forced into `NetworkState` in N3.
* Future phases will provide explicit bridge adapters for Terminal mesh connections.

---

## 13. Brain and Guardian Read-Only Future Boundary

* **Python Brain**: Future consumers in Brain will access network state solely via read-only snapshot queries for topology reasoning and network analysis. Brain has **no write access** to `NetworkState`.
* **Guardian Security Engine**: Future Guardian integration will observe network events and state snapshots to enforce security policies. Guardian policy decisions are enforced at capability dispatch boundaries.

---

## 14. Why EventBus is Deferred to N6

N3 is strictly state infrastructure. Event dispatching, event streaming (WebSocket/SSE/Tauri events), subscriptions, and event persistence belong to **Phase N6: Event System**. NetworkState only tracks timestamps and monotonic revisions necessary to support N6 event generation.

---

## 15. Why API Contracts are Deferred to N7

N3 establishes in-memory Rust state. Public Tauri IPC commands, REST endpoints, WebSocket bridges, and TypeScript contract generation belong to **Phase N7: Network API & Contracts**.

---

## 16. How Phase N4 Will Populate NetworkState

Phase N4 (Cluster Management) will:
1. Introduce cluster formation, node discovery, and node lifecycle managers in Rust.
2. Direct authenticated cluster node state changes through `NetworkState::upsert_node` and `NetworkState::remove_node`.
3. Establish cluster connection state through `NetworkState::upsert_connection`.
4. Replace legacy Python cluster state management while keeping `NetworkState` as the single source of truth.
