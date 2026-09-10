# Local Network Observability: Architecture & Foundation

## 1. Domain Distinction

Fluffy Assistant maintains a strict separation of concerns between **Local Network Observability** and the existing **Fluffy Cluster**:

```text
Network
│
├── Local Network                    (Native Rust Subsystem: core/src/network/)
│   ├── Interfaces                   (Physical / Virtual NIC enumeration & statuses)
│   ├── Devices                      (Passive ARP table & active subnet discovery)
│   ├── Traffic                      (Instantaneous bandwidth rate calculation)
│   ├── Flows                        (Active socket-to-process flow mappings)
│   ├── Packets                      (Header/metadata packet stream analysis)
│   └── Wi-Fi                        (Native Wi-Fi profiles & security status)
│
└── Fluffy Cluster                   (Inter-Machine Peer Mesh: fluffy/network/)
    ├── Roles                        (Standalone, Available, Admin)
    ├── Admin                        (Multi-node status poller)
    ├── Clients                      (Availability HTTP server on port 9000)
    ├── Heartbeat                    (Node liveness monitoring)
    └── Remote Telemetry             (Remote machine metrics inspection)
```

---

## 2. Subsystem Structure

The Local Network Observability foundation lives in `core/src/network/`:

```text
core/src/network/
├── mod.rs          # Public facade re-exporting primary types and functions
├── types.rs        # Strongly-typed domain models (NetworkInterfaceInfo, LocalNetworkDevice, NetworkFlow, etc.)
├── traffic.rs      # Anomaly-safe, reusable traffic rate calculation primitives
├── interfaces.rs   # Cross-platform interface enumeration, MAC normalization, and classification
├── discovery.rs    # Passive local network neighbor / ARP table reading (Windows IP Helper / Linux /proc/net/arp)
└── flows.rs        # Active socket-to-process flow mapping (Windows GetExtendedTcpTable / Linux /proc/net/tcp)
```

---

## 3. Strong Data Contracts

All data models utilize `Option<T>` for platform-dependent fields to avoid fabricating metrics.

### `NetworkInterfaceInfo`
- **`id`**: Stable system identifier.
- **`name`**: Adapter interface name (`"Wi-Fi"`, `"eth0"`, `"docker0"`).
- **`description`**: Hardware/driver description where provided by OS.
- **`mac_address`**: Normalized MAC address string or `None` if null/zero.
- **`interface_type`**: `Wifi | Ethernet | Loopback | Virtual | Vpn | Bridge | Other`.
- **`status`**: `Up | Down | Testing | Dormant | NotPresent | LowerLayerDown | Unknown`.
- **`is_physical`**: `true` for Ethernet and Wi-Fi hardware interfaces.
- **`ipv4_addresses` / `ipv6_addresses`**: Subnet CIDR strings.
- **`total_received_bytes` / `total_transmitted_bytes`**: Cumulative 64-bit byte counters.
- **`rates`**: Optional `TrafficRates` (Rx/Tx bytes/sec and bits/sec).

### `LocalNetworkDevice`
- **`ip_address`**: IPv4/IPv6 neighbor address.
- **`mac_address`**: Physical MAC address or `None` if incomplete.
- **`hostname`**: Resolved DNS/NetBIOS hostname if known.
- **`interface_name`**: Associated interface binding.
- **`is_gateway`**: True if identified as default gateway.
- **`is_self`**: True if matching local host IP.
- **`state`**: `Reachable | Stale | Permanent | Incomplete | Delay | Probe | Unknown`.

### `NetworkFlow`
- **`protocol`**: `Tcp | Udp`.
- **`local_address` / `local_port`**: Local bound socket endpoint.
- **`remote_address` / `remote_port`**: Remote peer socket endpoint (None for listening/UDP).
- **`state`**: `Listen | SynSent | SynReceived | Established | FinWait1 | FinWait2 | CloseWait | Closing | LastAck | TimeWait | Closed | Unknown`.
- **`pid`**: Process ID owning the socket.
- **`process_name`**: Executable name owning the socket.

---

## 4. Traffic Rate Calculation Layer

The rate calculator in `traffic.rs` handles:
1. **First Sample**: Returns zero rates on initial checkpoint.
2. **Timing Anomalies**: Rejects negative elapsed durations or intervals smaller than 1ms.
3. **Adapter Resets**: Safely treats counter resets/drops without arithmetic underflow.
4. **State Tracking**: `TrafficRateCalculator` maintains per-adapter checkpoints across sample ticks.

---

## 5. Security & Permission Boundary

- **Read-Only Capabilities**: All N1 and N2 observation capabilities (`Network.GetInterfaces`, `Network.GetLocalDevices`, `Network.GetActiveFlows`) are assigned `SecurityTier::ReadOnly` and require `requires_confirmation: false`.
- **Zero Injected Traffic**: Device discovery is completely passive (OS ARP/neighbor table cache). No ARP spoofing, poisoning, or port probing.
- **Zero Payload Capture**: Socket flows capture only L3/L4 transport metadata and process ownership. Zero packet payload data is ever read or stored.
- **Existing Contracts Preserved**: `Network.ListInterfaces` response and `FluffyMessage.system.network` telemetry on port `9001` remain completely unchanged.

---

## 6. Wi-Fi Profile Observation (N3)

### Scope and Purpose
Phase N3 introduces native Wi-Fi profile and signal observation in Rust (`core/src/network/wifi.rs`) exposed via the `Network.ListWifiProfiles` capability. It allows Fluffy to inspect known wireless network configurations and non-secret security posture without performing active penetration testing, credential dumping, or configuration mutation.

### Data Contract: `WifiProfile`
- **`ssid`**: Network SSID or profile name (`String`).
- **`interface_name`**: Associated wireless interface description (`Option<String>`).
- **`connected`**: Whether the interface is currently connected to this network (`bool`).
- **`signal_percent`**: Signal quality/strength percentage (0–100%) if currently connected or reachable (`Option<u8>`).
- **`security`**: Normalized human-readable security mode (e.g. `"WPA2-Personal"`, `"WPA3-Personal"`, `"Enterprise"`, `"Open"`, `"WEP"`) (`Option<String>`).
- **`cipher`**: Normalized encryption cipher (e.g. `"AES"`, `"TKIP"`, `"GCMP"`, `"None"`) (`Option<String>`).
- **`auth_type`**: Raw underlying authentication type reported by OS (`Option<String>`).
- **`has_profile`**: Indicates whether a saved profile exists locally (`bool`).

### Platform Implementations
- **Windows**: Uses native Windows WLAN API (`wlanapi.dll` via dynamic library loading). Enumerates interfaces with `WlanEnumInterfaces`, active BSSIDs via `WlanGetAvailableNetworkList`, and saved profiles with `WlanGetProfileList` and `WlanGetProfile` with `dwFlags = 0` (non-plaintext).
- **Linux**: Inspects NetworkManager system connection files in `/etc/NetworkManager/system-connections/` using a safe pure Rust INI parser. If NetworkManager is unavailable or on systems without Wi-Fi, gracefully returns an empty list without throwing errors or executing external shell commands.
- **macOS / Other Platforms**: Returns an empty profile list (`Vec::new()`) without panicking or fabricating data.

### Security Boundary & Credential Exclusion
Wi-Fi credentials (passwords, PSKs, keys, passphrases) are **strictly and explicitly excluded** from Phase N3:

```text
Operating System (WLAN API / NetworkManager)
      │
      │ Non-secret metadata only (<name>, <authentication>, <encryption>, signal)
      ▼
Rust Wi-Fi Subsystem (`core/src/network/wifi.rs`)
      │
      │ Strongly-typed `WifiProfile`
      ▼
`Network.ListWifiProfiles` (`SecurityTier::ReadOnly`)
      │
      ├── Future Brain Adapter
      └── Future UI View

Wi-Fi Passwords / Secrets
      │
      X  (STRICTLY BLOCKED)
      │
      └── NEVER read, parsed, decrypted, logged, cached, serialized, or transmitted.
```

- Capability: `Network.ListWifiProfiles`
- Security Tier: `SecurityTier::ReadOnly`
- Confirmation Required: `false`
- Credential Access: No password extraction, no `Network.GetWifiCredential` capability.

---

## 7. Network Observation Integration (N4)

### Canonical Integration Path
Phase N4 establishes the end-to-end integration path connecting native Rust Core capabilities to the Python Brain and Tauri Desktop UI without duplicating transport layers or modifying existing Fluffy Cluster networking.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        RUST CORE (TCP 9002 IPC)                        │
│  Network.GetInterfaces | Network.GetLocalDevices                       │
│  Network.GetActiveFlows | Network.ListWifiProfiles                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Newline-delimited JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         PYTHON BRAIN RUNTIME                           │
│  RustCapabilityClient  ──►  LocalNetworkService                        │
│  (brain/runtime/rust_capability_client.py)                             │
│  (brain/runtime/local_network_service.py)                              │
│                                   │                                    │
│  Flask Web API Blueprint: /local_network/*                             │
│  (brain/routes/local_network_routes.py)                                │
│  (interfaces, devices, flows, wifi, snapshot)                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Loopback (Port 5123)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           TAURI / REACT UI                             │
│  API Service: src/services/api/localNetwork.ts                         │
│  Store:       src/stores/localNetworkStore.ts (useLocalNetworkStore)   │
│  Contracts:   src/types/contracts.ts                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Strict Architectural Separation
To prevent conflation between host local network observability and the Fluffy peer-to-peer cluster:
1. **Cluster Network (`fluffy/network/`, `network_routes.py`, `networkStore.ts`)**: Manages P2P distributed cluster mesh, admin/client roles, remote node polling, and availability servers. **Preserved untouched.**
2. **Local Network (`core/src/network/`, `local_network_routes.py`, `localNetworkStore.ts`)**: Observes host interfaces, bandwidth counters, OS ARP cache devices, active socket flows, and non-secret Wi-Fi metadata.

### Security Enforcement & Boundary
- **Zero Credential Exposure**: All integration layers (`LocalNetworkService`, `local_network_routes.py`, `localNetwork.ts`, `localNetworkStore.ts`) strictly omit password/secret fields.
- **Loopback Enforcement**: All Web API routes require loopback connection (`127.0.0.1` / `::1`) and valid `X-Fluffy-Token` header (`@token_required`).
- **Capability Policy**: Dispatched via `core/src/capabilities/dispatch.rs` under `SecurityTier::ReadOnly`.

### Error Handling & Availability Model
- **Platform Unsupported**: Unsupported facilities (e.g. Wi-Fi on headless servers) gracefully report error metadata without panicking or failing other capabilities in the snapshot.
- **Core Unreachable / Timeout**: Client-level errors report structured codes (`core_unreachable`, `timeout`) with 502/500 HTTP responses.
- **Zero Data Fabrication**: Unknown hostnames, missing MACs, or unmapped process names remain `None` / `null`.

### Why Packet Capture is Intentionally Deferred
Raw packet capture requires elevated NDIS/libpcap filter drivers, CPU-intensive ring buffers, and privileged security clearance. It is deferred to dedicated future phases to preserve minimal overhead, stability, and clean security boundaries.

---

## 8. Local Network Observability UI & Visualizers (N5)

### Workspace Architecture
Phase N5 delivers an industrial-grade engineering operations console embedded within the Desktop Systems domain:

- **Location**: `ui/tauri/src/features/systems/views/LocalNetworkView.tsx`
- **Navigation Route**: `Systems` $\to$ `Local Network` (`activeSidebarView === "local_network"`)
- **Store Binding**: `useLocalNetworkStore()` from `ui/tauri/src/stores/localNetworkStore.ts`

### Primary Visualizer Sections
1. **Header & Freshness Bar**: Shows real-time polling state (`LIVE POLLING (5s)` / `MANUAL`), timestamp, atomic snapshot refresh trigger, and pause/resume controls.
2. **Summary KPI Strip**: High-level telemetry tiles showing active interfaces, discovered LAN neighbors, active sockets, aggregate upload/download rates, and active Wi-Fi connection.
3. **Interfaces & Bandwidth Counters**: Tabular layout detailing adapter type badges, operational state indicators, IPv4/IPv6 CIDRs, physical MACs, instantaneous Rx/Tx rates, and 64-bit cumulative byte totals.
4. **Passive LAN Discovery (ARP Table)**: Searchable neighbor table displaying IPv4/IPv6 addresses, MACs, NetBIOS/DNS hostnames, interface associations, gateway/localhost role tags, and reachability state badges (`Reachable`, `Stale`, `Permanent`, `Incomplete`).
5. **Active Socket-to-Process Flow Table**: Low-latency flow mapper showing owning Process Name, PID, Protocol (`TCP`/`UDP`), Local Endpoint (`IP:Port`), Remote Endpoint (`IP:Port`), and connection states (`LISTEN`, `ESTABLISHED`, `TIME_WAIT`, `CLOSE_WAIT`), with multi-attribute filtering.
6. **Wi-Fi Profiles & Security Posture**: Card grid displaying saved network SSIDs, active connection status, signal strength quality meter, security type (`WPA2-Personal`, `WPA3`, `Enterprise`, `Open`), cipher (`AES`, `TKIP`), and authentication mode. **Zero secrets displayed.**

### Visual Design Principles
- **Engineering Workbench Aesthetic**: Information-dense, crisp borders, dark surface hierarchy (`--color-surface`, `--color-surface-elevated`), monospace values for addresses/counters, and zero consumer fluff.
- **Accessibility & Performance**: Semantic HTML tables, structured screen-reader content, capped viewport rendering for large socket tables, and controlled single-timer store polling.
- **Separation from Cluster Network**: Clearly differentiated from Fluffy Cluster mesh (`NetworkView.tsx` / `networkStore.ts`).

---

## 9. Guardian Network Correlation (N6)

### Purpose and Architecture
Phase N6 establishes an intelligent, read-only behavioral security correlation and anomaly-detection engine inside the Guardian subsystem (`brain/guardian/network_correlation.py`). It ingests structured network observation snapshots from `LocalNetworkService` and correlates them with process reputation, historical baselines, and multi-signal telemetry to produce explainable security alerts without autonomous remediation.

```text
Local Network Observations (Rust Core via TCP 9002)
                    ↓
        LocalNetworkService (Python)
                    ↓
         NetworkCorrelationEngine
   ┌────────────────┴────────────────┐
   │ 1. NetworkBaselineTracker       │ (Tracks listening sockets, outbound traffic EMA, gateway MACs)
   │ 2. Anomaly Detectors:           │
   │    • Type A: Listening Sockets  │ (New port, unmapped PID, unusual binding)
   │    • Type B: Outbound Traffic   │ (Sustained rate spike vs baseline + min threshold)
   │    • Type C: Gateway Identity   │ (Gateway MAC address transition)
   │ 3. Cross-Domain Correlator      │ (Correlates with GuardianMemory trust, multiple signals)
   └────────────────┬────────────────┘
                    ↓
         Security Alerts / Verdicts
                    ↓
   Guardian UI (Alerts Feed & Inspector)
```

### Network Correlation Domain Model
- **`NetworkAnomaly`**:
  - `id`: Unique identifier for the anomaly event.
  - `type`: Anomaly classification (`UNEXPECTED_LISTENING_SOCKET`, `ABNORMAL_OUTBOUND_TRAFFIC`, `GATEWAY_IDENTITY_CHANGED`).
  - `severity`: Standardized risk severity (`low`, `medium`, `high`, `critical`).
  - `confidence`: Calibrated statistical confidence score (`0.0` to `1.0`).
  - `summary`: Concise, human-readable overview.
  - `explanation`: Full evidentiary rationale explaining *why* Guardian flagged the activity.
  - `evidence`: Detailed dictionary preserving exact network metrics, timestamps, and observed facts.
  - `related_process`: Associated process metadata (`pid`, `name`, `is_trusted`, `is_dangerous`).
  - `related_connection`: Transport/L3 parameters (`protocol`, `local_address`, `local_port`, `remote_address`, `remote_port`, `gateway_ip`, `mac_address`).
  - `baseline_comparison`: Direct comparison against historical norms.

### Anomaly Types
1. **Type A: Unexpected Listening Sockets (`UNEXPECTED_LISTENING_SOCKET`)**:
   - Evaluates active flows with state `Listen`.
   - Distinguishes between first-seen listeners for a process, new ports on processes with existing listener history, and unmapped listening sockets (missing PID / process name).
   - Preserves port, protocol, bound IP, PID, process identity, and first-seen timestamp in evidence.
   - Deduplicates alerts across subsequent ticks to prevent alert flooding.
2. **Type B: Abnormal Outbound Traffic (`ABNORMAL_OUTBOUND_TRAFFIC`)**:
   - Evaluates interface and process transmission rates against historical exponential moving averages (EMA).
   - Requires both a relative multiplier ($\ge 4.0\times$ baseline) and a minimum absolute bandwidth threshold ($\ge 250\text{ KB/s}$) over at least 5 baseline samples to eliminate false positives on idle background fluctuations.
   - Correlates with active established socket flows to identify high-volume remote endpoints and owning processes.
   - Avoids alarmist claims: treats traffic spikes as behavioral deviations, not definitive proof of compromise.
3. **Type C: Gateway Identity Changes (`GATEWAY_IDENTITY_CHANGED`)**:
   - Tracks default gateway IP-to-MAC associations per network adapter in bounded historical sets.
   - Generates alerts when the observed MAC address for a known gateway IP address transitions to a new MAC.
   - Preserves previous MAC, new MAC, transition timestamp, and MAC history in evidence.
   - **Terminology Rule**: Labeled strictly as *"Gateway identity changed"* or *"Gateway MAC transition"*, never assumed to be *"ARP spoofing"*.

### Cross-Domain Correlation & Baselines
- **Trust Dampening**: Anomalies associated with processes marked trusted in `GuardianMemory` have severity reduced (e.g., medium $\to$ low) and confidence adjusted.
- **Threat Amplification**: Anomalies associated with processes marked dangerous or untrusted are escalated to critical severity.
- **Multi-Signal Context**: Multiple concurrent network anomalies (e.g., gateway change occurring simultaneously with unexpected listeners) amplify confidence scores.
- **Deterministic Baselines**: Stored in `fluffy_data/guardian/network_baselines.json` with bounded history and EMA smoothing. No raw packet data is dumped into conversational memory.

### Security Guarantees & Non-Autonomous Invariant
- **Strictly Read-Only**: N6 contains zero autonomous remediation capabilities (no process termination, firewall modifications, socket blocking, packet injection, or Wi-Fi disconnection).
- **Zero Credential Exposure**: No Wi-Fi passwords, passphrases, PSKs, or secrets are ever requested, processed, logged, or included in alert evidence.
- **Host-Level Observability Boundary**: Passive OS-level observation cannot guarantee visibility into all LAN segment traffic (e.g. switched traffic between other LAN nodes).
- **Cluster Isolation**: Existing Fluffy peer-to-peer cluster networking and telemetry remain completely untouched.

---

## 10. Network Flow & Traffic Aggregation (N7)

### Purpose and Architecture
Phase N7 introduces a structured, bounded, multi-dimensional network traffic aggregation layer in `brain/runtime/network_aggregator.py`. It consumes structured network observations and process telemetry, tracks time-windowed traffic deltas, aggregates activity across processes, interfaces, destinations, and protocols, and exposes clean summaries to UI, Guardian, and analytics consumers.

```text
Rust Core Network Observations (TCP 9002)
                    ↓
        LocalNetworkService (Python)
                    ↓
         NetworkTrafficAggregator
   ┌────────────────┴───────────────────────────────────┐
   │ 1. Flow Lifecycle Tracker                          │ (first_seen, last_seen, duration, state)
   │ 2. Direction Classifier                            │ (INBOUND, OUTBOUND, LOCAL, UNKNOWN)
   │ 3. Counter Delta Calculator                        │ (Monotonic deltas, counter reset guards)
   │ 4. Multi-Dimensional Aggregation Engine:           │
   │    • Per-Process (in/out bytes, flows, peers)      │
   │    • Per-Interface (in/out bytes, active flows)    │
   │    • Per-Destination (remote IP/port, protocols)   │
   │    • Per-Protocol (TCP / UDP breakdown)            │
   │ 5. Time-Series Window Bucketing:                   │
   │    • 1-minute buckets (recent 60 = 1 hour)         │
   │    • 1-hour summaries (recent 24 = 24 hours)       │
   └────────────────┬───────────────────────────────────┘
                    ↓
   ┌────────────────┴───────────────────────────────────┐
   │ Consumers:                                         │
   │ • Web API (/local_network/traffic_summary, history)│
   │ • Systems → Local Network Desktop UI Workspace     │
   │ • Guardian Network Correlation (N6 Telemetry)      │
   └────────────────────────────────────────────────────┘
```

### Telemetry & Byte Semantics
- **Interface-Level Traffic (Authoritative)**: 64-bit cumulative byte counters (`total_received_bytes`, `total_transmitted_bytes`) and computed throughput rates from the OS (`TrafficRates`). Monotonic counter deltas ($\Delta \text{Bytes}$) provide authoritative throughput volume per interface and bucket, with reset guards on rollover or adapter restart.
- **Process-Level Traffic (Process Telemetry Sampling)**: Instantaneous send/receive rates (`net_sent`, `net_received`) provided directly by OS process telemetry (`sysinfo` / `psutil`). These represent process-level throughput rates captured at snapshot time, *not* mathematical partitionings or attributions of interface cumulative byte deltas. The term "authoritative" applies strictly to interface-level hardware/OS counters.
- **Socket Flows (Presence & Lifecycle)**: Passive OS socket tables (Windows `GetExtendedTcpTable`, Linux `/proc/net/tcp`) provide connection presence, protocol, endpoint addresses, and TCP lifecycle state without kernel packet hooks. Socket tables do not provide per-socket byte counters and are used strictly for active connection counting, remote destination distribution, and lifecycle duration tracking, with zero fabricated byte counts.

### Direction Classification Semantics
Port numbers alone do NOT determine direction. Heuristic classification based on conventional port numbers (e.g. port 80/443 = inbound, port >= 1024 = outbound) is strictly avoided because incorrect classification is worse than `UNKNOWN`.

Direction is resolved deterministically using the following order of precedence:
1. **`LOCAL`**: Sockets in listening state (`LISTEN` / `listen`), or connections where both local and remote endpoints reside on loopback (`127.0.0.1`, `::1`, `localhost`), or missing remote endpoints.
2. **Deterministic Socket State**: Active TCP connection handshake states (`SYN_SENT` $\to$ `OUTBOUND`, `SYN_RECEIVED` $\to$ `INBOUND`).
3. **Listener Relationship**:
   - If the connection's `local_port` matches a known active listener registered on the local host $\to$ `INBOUND`.
   - If the connection is established/connected and the `local_port` is *not* a known local listener $\to$ `OUTBOUND`.
4. **Endpoint Ownership**: Explicit local vs remote interface IP matching when available.
5. **Explicit OS-Provided Direction**: Platform-specific direction metadata if provided by kernel hooks or OS providers.
6. **`UNKNOWN`**: Assigned whenever endpoint orientation, listener relationship, or socket state cannot be deterministically verified. Missing or incomplete evidence yields `UNKNOWN` rather than a heuristic guess.

### Counter Reset & No Double-Counting Semantics
- **Delta Computation**: Calculated strictly as $\Delta \text{Bytes} = \text{Current} - \text{Previous}$.
- **Reset Guard**: If $\text{Current} < \text{Previous}$ (adapter restart, counter rollover, system reboot), $\Delta \text{Bytes}$ is set to 0 and the baseline is re-anchored.
- **No Repeated Addition**: Repeated snapshot polling updates connection duration and lifecycle timestamps without fabricating additional byte counts.

### Time-Series Bucketing & Retention
- **1-Minute Buckets**: Ring buffer holding the most recent 60 1-minute buckets (1 hour of continuous time-series history).
- **1-Hour Buckets**: Ring buffer holding the most recent 24 1-hour rollup buckets (24 hours of historical summary).
- **Bounded Memory**: Fixed-capacity ring buffers prevent unbounded memory growth.

### API Endpoints
- `GET /local_network/traffic_summary`: Multi-dimensional breakdown of active flows, top processes, interface counters, remote destinations, protocols, and directions.
- `GET /local_network/traffic_history?window=1h|24h`: Time-series buckets for visualization and trend analysis.

