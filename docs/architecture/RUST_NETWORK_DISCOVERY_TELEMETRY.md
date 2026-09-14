# Rust Network Discovery & Telemetry (Phase N5)

## 1. N5 Purpose
Phase N5 integrates Fluffy's existing network observation sources into the Rust-owned Network subsystem, establishing Rust as the authoritative runtime owner of current network discovery and telemetry. 

Observational data flows through normalized pipelines into `NetworkState`, updating canonical models (`NetworkDevice`, `NetworkInterface`, `NetworkConnection`, and `TrafficMetrics`) while strictly maintaining safety, observation-only boundaries, and snapshot consistency.

---

## 2. Discovery Architecture
The discovery layer follows the pipeline:
```text
OS / Network Reality (ARP tables, network scans)
       ↓
Local Network Discovery Collector
       ↓
Normalization & Attribution (`NetworkTelemetryService`)
       ↓
Canonical Model (`NetworkDevice`)
       ↓
Authoritative `NetworkState` (`upsert_device`)
```
- **Observation Only**: Discovered devices represent observed physical or virtual endpoints on the local network. Discovered devices are never automatically trusted as cluster nodes.
- **Deduplication & State Update**: If a device was previously observed, its identity is preserved, its IP/metadata are updated, and its `first_seen_epoch` timestamp is retained.

---

## 3. Telemetry Architecture
The telemetry pipeline operates across interfaces, active socket flows, and throughput rates:
```text
Native OS Interfaces / Sockets / Capture
       ↓
Existing Rust Collectors (`interfaces.rs`, `flows.rs`, `traffic.rs`)
       ↓
Telemetry Ingestion & Attribution (`NetworkTelemetryService`)
       ↓
Canonical Telemetry Models (`NetworkInterface`, `NetworkConnection`, `TrafficMetrics`)
       ↓
Authoritative `NetworkState` (`upsert_interface`, `upsert_connection`, `update_traffic`)
```

---

## 4. Source Collectors
N5 reuses existing, production-tested Rust collectors without duplicating collection logic:
1. **Interfaces**: `crate::network::interfaces::get_interfaces_with_rates` interrogates OS network interfaces, MAC addresses, IP bindings, MTU, operational status, and instantaneous delta rates via `TrafficRateCalculator`.
2. **Devices**: `crate::network::discovery::get_local_devices` inspects ARP/neighbor tables and local subnet devices.
3. **Flows**: `crate::network::flows::get_active_flows` interrogates active socket connections, local/remote endpoints, process IDs, and connection states.
4. **Traffic Rate Calculation**: `crate::network::traffic::TrafficRateCalculator` provides rate calculations between sampling ticks.

---

## 5. Normalization
Each raw observation is mapped to canonical N2 domain models:
- Raw interface metrics → `NetworkInterface` with `NetworkInterfaceId` and operational link flags.
- Raw ARP neighbor entries → `NetworkDevice` with hardware-derived `DeviceId`, `DiscoverySource::Arp` / `DiscoverySource::Neighbor`, and `DeviceCategory`.
- Raw socket connections → `NetworkConnection` with `ConnectionKind::LocalSocketFlow` and canonical socket endpoints.

---

## 6. DeviceId Strategy
Device identity adheres strictly to N2 identity invariants:
- **Stable MAC Address**: When a valid hardware MAC address is observed, `DeviceId::from_mac(&mac)` is computed.
- **Ephemeral Fallback**: When no MAC address exists, `DeviceId::ephemeral()` is generated.
- **IP Address Invariant**: An IP address is never used as permanent identity. When DHCP reassigns a device from `192.168.1.20` to `192.168.1.45`, the MAC-derived `DeviceId` remains identical.
- **Hostname Invariant**: Hostnames are mutable attributes and never constitute canonical identity.

---

## 7. Interface Identity
- **Canonical ID**: `NetworkInterfaceId` is derived deterministically from the canonical system interface name or index (e.g. `NetworkInterfaceId::from_name("eth0")`).
- **State Preservation**: MAC addresses, IPv4/IPv6 addresses, MTU, operational flags (`up`, `loopback`), and computed throughput rates (`bytes_rx_sec`, `bytes_tx_sec`) are continuously updated in `NetworkState.interfaces`.

---

## 8. Flow & Connection Mapping
Connections preserve the explicit distinction mandated by N2:
- **`ConnectionKind::LocalSocketFlow`**: Local OS network connections, TCP/UDP sockets, and loopback flows.
- **`ConnectionKind::ClusterTransport`**: Rust cluster mesh and node-to-node transport sessions (managed exclusively by N4).
- **`ConnectionKind::IpcStream` / `ConnectionKind::WebSocketBridge`**: Dedicated IPC and bridge channels.

N5 ingests OS flows exclusively as `ConnectionKind::LocalSocketFlow`, preventing any collision or overwrite of N4 cluster transport states.

---

## 9. Traffic Metrics
Aggregate network metrics in `NetworkState.traffic` track:
- Total bytes received / transmitted (`total_bytes_rx`, `total_bytes_tx`).
- Aggregate packet counts (`total_packets_rx`, `total_packets_tx`).
- Current bandwidth rates (`current_rx_rate_bps`, `current_tx_rate_bps`).
- Current top talkers (`top_talkers`).

All traffic state resides exclusively in `NetworkState`. No secondary `TrafficStore` or `TelemetryManager` exists.

---

## 10. Top Talkers
`NetworkTelemetryService::calculate_top_talkers` aggregates traffic across active interfaces and connections:
- Identifies endpoints using the strongest available entity identity:
  1. `NodeId` (if remote IP/port matches a registered cluster node).
  2. `DeviceId` (if remote IP matches an observed local device).
  3. `NetworkInterfaceId` or IP string.
- Attributes byte/packet counters without fabricating node identities.

---

## 11. Attribution Rules
Telemetry attributes relationships only when supported by observed data:
1. **Flow → Local Interface**: Correlated by matching local socket binding address to known interface IPs.
2. **Flow → Local Device**: Correlated by matching remote socket IP to a known `DeviceId` in `NetworkState.devices`.
3. **Flow → Cluster Node**: Correlated only when the remote socket endpoint matches the advertised IP/port of a registered node in `NetworkState.nodes`.
4. **No Fabricated Relationships**: If an endpoint is unknown, attribution fields (`associated_node_id`, `associated_device_id`) remain `None`.

---

## 12. NetworkState Integration
All telemetry updates route through N3 mutation APIs:
- `SharedNetworkState.upsert_device(...)`
- `SharedNetworkState.upsert_interface(...)`
- `SharedNetworkState.upsert_connection(...)`
- `SharedNetworkState.update_traffic(...)`

Every state change increments the state revision number and notifies snapshot consumers atomically.

---

## 13. Cluster Management Boundary
Discovery and Cluster Management remain cleanly decoupled:
- **Discovery**: Observes devices, ARP entries, and open ports on the LAN.
- **Cluster Management (N4)**: Manages cluster membership, node lifecycle, heartbeats, and cluster connections.
- **Invariant**:
  $$\text{Discovered Device} \neq \text{Cluster Node}$$
  $$\text{Reachable Port} \neq \text{Authenticated Node}$$
  A discovered device never transitions a node to `NodeAvailability::Connected` or `AuthenticationState::Authenticated`.

---

## 14. Python Compatibility
- Existing Python Local Network scripts (`fluffy/network/`) remain fully intact.
- Rust becomes the authoritative runtime source of network reality.
- No Python code is removed or broken.

---

## 15. Terminal Compatibility
- Existing Rust Terminal Mesh (`core/src/terminal/`) remains untouched.
- N5 observes terminal socket flows and attributes them as `LocalSocketFlow` or preserves existing N4 cluster connections.

---

## 16. Packet Capture Boundary
- Existing packet capture utilities remain strictly bounded and non-invasive.
- No continuous raw packet persistence or sniffing occurs.
- Raw packet payloads are never exposed to remote endpoints.

---

## 17. Security & Trust Boundary
- Discovery and telemetry are observation-only.
- Discovered devices, interfaces, and sockets carry zero administrative or cluster trust.
- Trust and permissions remain strictly governed by the Rust capability/policy engine and future authentication phases.

---

## 18. Lifecycle & Collection Behavior
- `NetworkTelemetryService` is encapsulated within `NetworkSubsystem`.
- Collection occurs via explicit poll methods (`poll_all()`, `poll_interfaces()`, `poll_devices()`, `poll_flows()`).
- No unsolicited background worker threads or uncontrolled loops are spawned.
- The subsystem remains fully functional when Python Brain is offline.

---

## 19. Revision Semantics
- Each poll cycle updates `NetworkState` only when new data is observed.
- Revision increments adhere to N3 guarantees, enabling lock-free snapshot isolation for readers.

---

## 20. Testing & Verification
Automated test suite validates:
- Device discovery and stable MAC vs ephemeral fallback.
- Flow ingestion as `LocalSocketFlow` and cluster node attribution.
- Interface rate calculation and revision bumping.
- Top talkers computation and attribution hierarchy.
- Security boundary invariance ($\text{discovery} \neq \text{cluster membership}$).

---

## 21. Future Relationship to Later Phases
Phase N5 strictly confines its scope to discovery and telemetry. Later phases will build upon N5:
- **N6**: EventBus / reactive event publishing for network state mutations.
- **N7**: Network API / IPC contracts for external query interfaces.
- **N8**: Network Operations Workspace UI.
- **N9**: Dynamic topology generation.
- **N10**: Node pairing protocols.
- **N11**: Connection inspector.
- **N12**: Guardian security engine integration.
- **N13**: Authenticated remote administration.

*Note: Phases N6 through N13 have NOT been started in N5.*
