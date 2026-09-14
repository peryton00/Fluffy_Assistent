# Rust Network Domain Model (Phase N2)

## 1. Overview & Architectural Role

Phase N2 establishes the **canonical Rust Network domain model** in `core/src/network/model.rs`.

The domain model provides strongly typed, platform-agnostic, and serialization-safe representations of core network entities. It is intentionally independent of UI frameworks (React/Tauri), Python Brain runtimes, or transport-specific wire protocols.

In Phase N3, these domain models will form the structural foundation of the authoritative runtime `NetworkState`.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        CANONICAL DOMAIN ENTITIES                           │
├────────────────────────────────────────────────────────────────────────────┤
│  NetworkNode                 - Fluffy cluster peer node (identity + state) │
│  NetworkDevice               - Discovered LAN subnet entity                │
│  NetworkConnection           - Logical transport or socket connection flow │
│  NetworkInterfaceInfo        - Native host network adapter interface       │
│  TrafficMetrics / TopTalker  - Throughput, packet, and attribution metrics │
│  NetworkEvent                - Structured cluster, net, security, or admin │
│  NetworkSecurityObservation  - Structured anomaly / alert for Guardian     │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Domain Entities

### 2.1 `NetworkNode` (Managed Cluster Peer)
Represents a machine participating in the distributed Fluffy cluster mesh.
- **Identity**: Strongly typed `NodeId` (logical identity decoupled from changing IP/MAC addresses).
- **Attributes**: `name`, `hostname`, `os`, `os_version`, `arch`, `is_local`.
- **States**: `role: NodeRole`, `availability: NodeAvailability`, `auth_state: AuthenticationState`, `pairing_state: PairingState`.
- **Network Bindings**: `ip_addresses: Vec<String>`, `mac_addresses: Vec<String>`.
- **Capabilities & Metadata**: `capabilities: Vec<String>`, `metadata: HashMap<String, String>`, `last_seen_epoch: u64`.

### 2.2 `NetworkDevice` (Discovered Subnet Entity)
Represents any device observed on the local network (router, printer, phone, workstation).
- **Identity**: `DeviceId` (anchored to hardware MAC address or explicitly ephemeral).
- **Attributes**: `ip_address`, `mac_address`, `hostname`, `vendor`, `is_gateway`, `is_self`.
- **Classification**: `category: DeviceCategory` (`GATEWAY`, `ROUTER`, `WORKSTATION`, `LAPTOP`, `PHONE`, `TABLET`, `IOT`, `PRINTER`, `SERVER`, `INFRASTRUCTURE`, `UNKNOWN`).
- **Discovery**: `source: DiscoverySource` (`ArpTable`, `NeighborDiscovery`, `PassiveDns`, `ClusterAnnouncement`, `Manual`), `state: DeviceState`.
- **Cluster Association**: `is_fluffy_node: bool`, `associated_node_id: Option<NodeId>`.

### 2.3 `NetworkConnection` (Logical & Transport Connection)
Represents a connection endpoint pair across local socket flows, cluster mesh transports, or IPC channels.
- **Identity**: `ConnectionId`.
- **Kind**: `kind: ConnectionKind` (`LocalSocketFlow`, `ClusterTransport`, `IpcStream`, `WebSocketBridge`).
- **Endpoints**: `protocol: FlowProtocol` (`Tcp`, `Udp`), `local_addr`, `local_port`, `remote_addr`, `remote_port`.
- **State & Flow**: `state: FlowState`, `direction: ConnectionDirection` (`Inbound`, `Outbound`, `Local`, `Unknown`).
- **Association**: `associated_node_id: Option<NodeId>`, `pid: Option<u32>`, `process_name: Option<String>`.

### 2.4 `NetworkInterfaceInfo` (Host Interface Model & Ownership)
- **Collector Snapshot Representation**: `NetworkInterfaceInfo` in `core/src/network/types.rs` remains the raw OS reality collector representation returned by `interfaces.rs`.
- **Runtime State Ownership (Phase N3)**: In Phase N3, `NetworkState` will hold authoritative runtime instances/snapshots of `NetworkInterfaceInfo` and track differential rate histories.
- Fields preserved: Physical classification (`Wifi`, `Ethernet`, `Loopback`, `Virtual`, `Vpn`, `Bridge`), status, hardware MAC, IPv4/IPv6 CIDRs, MTU, link speed, cumulative 64-bit byte counters, and instantaneous `TrafficRates`.

### 2.5 `TrafficMetrics` & `TopTalker`
Provides aggregate metrics and bandwidth attribution models:
- Cumulative byte counters (`rx_bytes`, `tx_bytes`), packet counters, drops, errors, and rates.
- `TopTalker` represents high-volume processes, interfaces, or remote destinations.

### 2.6 `NetworkEvent` (Canonical Event Taxonomy)
Structured event format prepared for Phase N6 (Event System):
- **Classification**: `category: EventCategory` (`Cluster`, `Network`, `Security`, `Admin`), `severity: EventSeverity` (`Info`, `Notice`, `Warning`, `Error`, `Critical`).
- **Event Types (`NetworkEventType`)**:
  - Cluster: `NodeDiscovered`, `NodeAvailable`, `PairingStarted`, `PairingCompleted`, `AuthStarted`, `Authenticated`, `AuthFailed`, `NodeConnected`, `NodeDisconnected`, `NodeRecovered`, `HeartbeatMissed`, `RoleChanged`.
  - Network: `InterfaceChanged`, `DeviceDiscovered`, `DeviceStateChanged`, `ConnectionOpened`, `ConnectionClosed`, `TrafficSpike`.
  - Security: `UnknownDevice`, `SuspiciousTraffic`, `AuthViolation`, `AnomalyDetected`, `PolicyViolation`.
  - Administration: `RemoteActionStarted`, `RemoteActionCompleted`, `RemoteActionDenied`, `TerminalSessionOpened`, `TerminalSessionClosed`.
- **Payload**: Entity references (`source_node_id`, `target_node_id`, `target_device_id`, `target_connection_id`), human summary, and structured `details: serde_json::Value`.

### 2.7 `NetworkSecurityObservation`
Normalized security observation format connecting Network telemetry to Guardian:
- `observation_id`, `timestamp_epoch_ms`, `risk_level: SecurityRiskLevel`, `anomaly_kind`, `affected_interface`, `affected_ip`, `affected_mac`, `affected_pid`, `description`, `evidence: Vec<String>`.

---

## 3. Identity Model & Invariants

### 3.1 Device Identity Algorithm (`DeviceId`)
1. **Hardware-Anchored Identity (`dev_mac_<hex>`)**:
   - Derived exclusively from a validated, non-zero, 12-hexdigit physical MAC address.
   - Strips separators (`:`, `-`, `.`) and lowercases hex characters.
   - Rejects invalid or all-zero MACs (e.g. `00:00:00:00:00:00`).
   - Guarantees that a device with a fixed MAC retains the exact same `DeviceId` across DHCP renewals or IP changes.
2. **Explicitly Ephemeral Identity (`dev_ephem_<uuid>`)**:
   - Generated when no hardware address is available (e.g. incomplete ARP cache, non-MAC discovery).
   - Clear prefix `dev_ephem_` prevents ephemeral observations from being incorrectly treated as durable or permanent.
3. **Strict Separation from IP & Hostname**:
   - IP addresses and hostnames are **never** treated as canonical device identities.
   - Two different devices with distinct MACs that sequentially occupy the same IP receive distinct `DeviceId`s.

### 3.2 Node Identity (`NodeId`)
- `NodeId` represents the immutable identity of a Fluffy instance, independent of IP or MAC address changes.
- A discovered `NetworkDevice` is **not** assumed to be a Fluffy node unless cryptographically verified and linked via `associated_node_id`.

---

## 4. Role vs Availability State Machines

### 4.1 `NodeRole` (Architectural Function)
Defines what the node is configured to perform in the cluster:
- `Standalone`: Local operation only.
- `Admin`: Controller node managing the cluster.
- `Worker`: Dedicated execution / managed agent node.
- `Peer`: Symmetrical cluster peer node.

*Note on Legacy Python Compatibility*: In legacy Python (`fluffy/network/role_manager.py`), `"available"` was treated as a role string. In canonical Rust, "available" is recognized as an operational availability state (`NodeAvailability::Available`), not an architectural role.

### 4.2 `NodeAvailability` (Operational Connectivity)
Defines the dynamic reachability and mesh state:
- `Available` $\to$ `Pairing` $\to$ `Authenticating` $\to$ `Connected` $\leftrightarrow$ `Disconnected` $\leftrightarrow$ `Recovering`.

### 4.3 `AuthenticationState` & `AuthFailureReason` (Security Invariant)
To prevent credentials, tokens, passwords, or raw secrets from leaking into serialized domain state:
- `AuthenticationState` is defined as: `Unauthenticated`, `Authenticating`, `Authenticated`, `Failed(AuthFailureReason)`.
- `AuthFailureReason` is a bounded enum: `InvalidCredentials`, `TokenExpired`, `ChallengeMismatch`, `HandshakeTimeout`, `UnsupportedProtocol`, `PolicyRejected`, `RateLimited`, `NetworkError`, `Unknown`.

---

## 5. Duplicate Model Classification

| Model Name | Location | Classification | Migration Strategy |
| :--- | :--- | :--- | :--- |
| `NetworkNode` | `core/src/network/model.rs` | **1. Canonical Domain Model** | Primary authoritative model for N3+. |
| `ClientInfo` | `core/src/terminal/app_state.rs` | **3. Transport/Protocol Model** | Retain for terminal sessions; link to `NodeId` in N4. |
| `MachineEntry` | `fluffy/network/client.py` | **5. Legacy Model** | Retain for Python cluster compatibility; retire in N14. |
| `NetworkMachine` | `ui/tauri/src/types/contracts.ts` | **4. UI Presentation Model** | Retain for UI compatibility; map to `NetworkNode` in N7. |
| `NetworkDevice` | `core/src/network/model.rs` | **1. Canonical Domain Model** | Primary authoritative model for N3+. |
| `LocalNetworkDevice` | `core/src/network/types.rs` | **2. Existing Compatibility Model** | Retain as raw collector output; wraps into `NetworkDevice`. |
| `ClassifiedNetworkDevice` | `ui/tauri/src/types/contracts.ts` | **4. UI Presentation Model** | Retain for N9 intelligence UI; align with `NetworkDevice`. |
| `NetworkConnection` | `core/src/network/model.rs` | **1. Canonical Domain Model** | Primary authoritative model for N3+. |
| `NetworkFlow` | `core/src/network/types.rs` | **2. Existing Compatibility Model** | Retain as raw collector output; wraps into `NetworkConnection`. |

---

## 6. How N2 Prepares for N3 (Authoritative Network State)

Phase N2 defines the complete structural vocabulary:
1. `NetworkState` in N3 will store thread-safe collections (`HashMap<NodeId, NetworkNode>`, `HashMap<DeviceId, NetworkDevice>`, `HashMap<ConnectionId, NetworkConnection>`, and `HashMap<String, NetworkInterfaceInfo>`).
2. N3 will implement state transition methods governing `NodeAvailability`, `PairingState`, and `AuthenticationState`.
3. Event generation in N6 will emit strongly typed `NetworkEvent` instances directly from state mutations.
