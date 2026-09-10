# N9: Advanced Network Intelligence — Architecture & Specification

## 1. Purpose & Core Philosophy

**N9: Advanced Network Intelligence** is the higher-level interpretation and context layer for Fluffy's local network observability subsystem.

N9 builds intelligent, explainable models directly on top of the structured telemetry foundation from N1–N7. It operates independently from N8 (the separate on-demand packet monitoring capability developed for SIH26117 verification).

```text
N1–N5: Native Network Observation (Rust Core)
                  ↓
N6: Security Correlation (Guardian Anomaly Engine)
                  ↓
N7: Multi-Dimensional Traffic Aggregation (NetworkTrafficAggregator)
                  ↓
N9: Advanced Network Intelligence (Interpretation, Classification, Identity, Catalog)
                  ↓
Consumers: Agent / LLM, Guardian N6, Long-Term Memory, Local Network Desktop UI
```

### **Core Tenet**:
> **N9 is an interpretation and context layer, NOT an additional data collection layer.**
> N9 operates 100% passively on existing structured observations (interfaces, ARP neighbors, socket flows, process telemetry, and traffic time-series). It does not require packet capture to function, nor does it perform active probing, port scanning, or packet injection.


---

## 2. Existing Capabilities Reused

N9 directly reuses and builds upon the authoritative, zero-elevation capabilities established in N1–N7:

| Subsystem | Source Component | Telemetry / Capability Reused by N9 |
| :--- | :--- | :--- |
| **Interface State & Counters** | N1 (`Network.GetInterfaces`) | Interface types (Ethernet, Wi-Fi, Loopback, Virtual), MAC addresses, IP addresses, MTU, operational status, 64-bit hardware traffic counters. |
| **Subnet Neighbors** | N2 (`Network.GetLocalDevices`) | Discovered local subnet IP addresses, MAC addresses, MAC vendor OUI resolutions, gateway flags (`is_gateway`). |
| **Active Socket Flows** | N2 (`Network.GetActiveFlows`) | Local/remote endpoints (IP:Port), protocols (TCP/UDP), socket states (`LISTEN`, `ESTABLISHED`), process association (PID, process name). |
| **Wi-Fi Profiles** | N3 (`Network.ListWifiProfiles`) | Active SSID, BSSID/interface binding, authentication types (WPA2, WPA3), cipher suites. |
| **Security Correlation** | N6 (`GuardianNetworkCorrelator`) | Baseline tracking (`NetworkBaselineTracker`), gateway IP-to-MAC associations, known listening socket registries, outbound volume anomalies. |
| **Traffic Aggregation** | N7 (`NetworkTrafficAggregator`) | Multi-dimensional traffic summaries, deterministic flow directions (`INBOUND`, `OUTBOUND`, `LOCAL`, `UNKNOWN`), 60-minute and 24-hour time-series buckets. |
| **Long-Term Memory** | `brain/memory/` | `fluffy_data/memory/long_term.json` schema for durable facts (trusted networks, known devices, user annotations). |

---

## 3. Current Gaps Identified (Pre-N9)

While N1–N7 provides rich low-level telemetry, several interpretation gaps remain for an intelligent desktop assistant:
1. **Raw Devices vs Classified Roles**: Subnet devices in N2 are simply IP/MAC pairs with OUI text; Fluffy cannot explain whether a device is a router, phone, laptop, IoT device, or network printer.
2. **Ephemeral Sockets vs Managed Service Catalog**: N2 lists instant listening sockets, but lacks a lifecycle catalog answering: *Which services are long-lived vs newly introduced? Which process owns the service? Has a standard service disappeared?*
3. **Transient Interfaces vs Network Environment Identity**: Fluffy tracks current IP and SSID, but lacks a unified concept of "Home Wi-Fi" vs "Office LAN" vs "Public Hotspot" across interface reconnects.
4. **Presence Lifecycle State**: Discovered devices are static snapshots; Fluffy does not track whether a device is *first seen, returning, persistent, intermittent, or recently departed*.
5. **Cross-Domain Entity Linking**: Sockets, processes, traffic volumes, and remote endpoints are aggregated separately; Fluffy needs unified entity correlation (e.g. `Process -> Listener -> Flow -> Peer -> Traffic Volume`).
6. **Agent-Facing Synthesis**: LLM agents currently have no high-level natural language context tool to answer questions like *"What changed on my network today?"* without dumping raw JSON tables into prompts.

---

## 4. Device Classification Architecture

N9 introduces passive, multi-factor heuristic classification for local subnet devices using a strict evidence hierarchy.

### 4.1 Device Categories
```text
GATEWAY | ROUTER | WORKSTATION | LAPTOP | PHONE | TABLET | IOT | PRINTER | SERVER | NETWORK_INFRASTRUCTURE | UNKNOWN
```

### 4.2 Evidence Hierarchy & Passive Classification Engine
Classification is calculated deterministically using non-intrusive signals, weighted by evidence reliability:

1. **Strong Evidence**:
   - **Gateway Relationship**: If `is_gateway == True` or authoritative default route $\to$ `GATEWAY` (Confidence: 0.95).
   - **Host Self-Identity**: Host machine running Fluffy $\to$ `WORKSTATION` / `LAPTOP` (Confidence: 0.95).
   - **Explicit Hostname Signals**: Hostname contains explicit identifiers such as `printer`/`print` $\to$ `PRINTER` (0.85–0.92); `iphone`/`galaxy`/`pixel` $\to$ `PHONE` (0.82–0.88); `ipad`/`tablet` $\to$ `TABLET` (0.82–0.88); `macbook`/`thinkpad`/`laptop` $\to$ `LAPTOP` (0.85); `desktop`/`workstation` $\to$ `WORKSTATION` (0.82).

2. **Medium Evidence**:
   - **Vendor + Hostname Combination**: e.g., Cisco/Ubiquiti vendor with `router`/`ap` hostname $\to$ `NETWORK_INFRASTRUCTURE` (0.88).
   - **Observed Service Characteristics**: Inbound listeners on server ports (80/443/445) or IoT protocols.

3. **Weak Evidence (Vendor/OUI Alone)**:
   - **Strict Rule**: Vendor/OUI alone (e.g. Apple, Intel, Dell) is **weak evidence** and does NOT prove device type. Apple makes Phones, Tablets, Laptops, Desktops, TV boxes, and Watches; Intel/Dell makes Desktops, Laptops, Servers, and NUCs.
   - Vendor-only matches produce low confidence ($\le 0.40$) and default to `UNKNOWN` with explanatory evidence strings.

### 4.3 Classification Schema
```json
{
  "ip": "192.168.1.145",
  "mac": "3c:22:fb:12:34:56",
  "vendor": "Apple, Inc.",
  "classification": "PHONE",
  "confidence": 0.88,
  "evidence": [
    "Strong: Hostname contains mobile phone identifier ('sudip-iphone')",
    "Supporting: Vendor OUI matches mobile vendor 'Apple, Inc.'"
  ],
  "status": "reachable",
  "first_seen": 1726000000.0,
  "last_seen": 1726000050.0,
  "is_gateway": false
}
```

---

## 5. Local Service Catalog Architecture

The Local Service Catalog tracks all local listening sockets across time to provide a managed, queryable inventory of running services with **uncertainty-aware lifecycle tracking**.

### 5.1 Service Domain Model
```text
LocalService
 ├─ service_id: str (e.g. "tcp:0.0.0.0:8080:node.exe")
 ├─ process_name: str ("node.exe")
 ├─ pid: Optional[int] (14820)
 ├─ executable_path: Optional[str] ("C:\Program Files\nodejs\node.exe")
 ├─ local_address: str ("0.0.0.0")
 ├─ port: int (8080)
 ├─ protocol: str ("tcp")
 ├─ first_seen: float (timestamp)
 ├─ last_seen: float (timestamp)
 ├─ status: str ("ACTIVE" | "PERSISTENT" | "TRANSIENT" | "INACTIVE")
 ├─ lifetime_seconds: float
 ├─ well_known_name: Optional[str] ("HTTP Proxy / Web Alternate Server")
 ├─ missed_snapshots: int (consecutive missed snapshot counter)
 └─ consecutive_observations: int
```

### 5.2 Uncertainty-Aware Lifecycle Transitions
Because N2 provides snapshot-based polling, a single missed observation does **NOT** prove a service terminated.
- **Active**: Observed in current snapshot (`missed_snapshots = 0`).
- **Temporarily Absent**: Missing from 1 or 2 snapshots $\to$ retains catalog entry and status; avoids premature `INACTIVE` verdict.
- **Returning**: Re-observed after temporary absence $\to$ remains `ACTIVE` with reset missed counter.
- **Confirmed Inactive**: Missing for $\ge 3$ consecutive snapshots with lifetime $\ge 60$s $\to$ `INACTIVE`.
- **Transient**: Missing for $\ge 3$ consecutive snapshots with lifetime $< 60$s $\to$ `TRANSIENT`.
- **Persistent**: Continuously active with cumulative lifetime $\ge 3600$s (1 hour) $\to$ `PERSISTENT`.

---

## 6. Best-Effort Network Environment Identity Model

N9 models the current network environment as a **best-effort environmental network fingerprint**, explicitly acknowledging that different networks can share gateways or SSIDs.

```text
NetworkIdentity
 ├─ network_id: str ("net_" + sha256(interface:gateway:ssid)[:12])
 ├─ interface: str ("Wi-Fi" / "Ethernet")
 ├─ network_type: str ("wifi" | "ethernet")
 ├─ ssid: Optional[str] ("MyHomeNetwork")
 ├─ gateway: Optional[str] ("192.168.1.1")
 ├─ gateway_mac: Optional[str] ("00:11:22:33:44:55")
 ├─ local_addresses: List[str] (["192.168.1.10"])
 ├─ first_seen: float
 ├─ last_seen: float
 ├─ confidence: float (0.30–0.90 based on signal completeness)
 ├─ evidence: List[str] (deterministic signal trace)
 └─ trust_level: str ("TRUSTED" | "UNKNOWN" | "PUBLIC")
```

### 6.1 Precise Environmental Transition Detection
When network state updates, N9 distinguishes between genuine environment switches and localized configuration changes:
- `NETWORK_SWITCHED`: Emitted **only** when SSID or physical network interface changes.
- `GATEWAY_CHANGED`: Emitted when default gateway IP/MAC updates on the same network.
- `LOCAL_IP_CHANGED`: Emitted when local IP address changes (e.g. DHCP lease renewal).
- `NETWORK_IDENTITY_CHANGED`: Emitted when fingerprint hash changes due to partial/ambiguous environmental shifts.
- `INTERFACE_CONNECTED`: Emitted on initial interface binding.

---

## 7. Device Presence Intelligence

Maintains bounded temporal tracking of all observed subnet devices:

- **State Classification**:
  - `NEW_DEVICE`: Discovered for the first time on the current network environment.
  - `ACTIVE`: Observed in recent ARP/flow snapshots within the last 5 minutes.
  - `RETURNING`: Previously seen device re-appearing after $> 30$ minutes of absence.
  - `RECENTLY_DEPARTED`: No longer present in ARP/neighbor cache for $> 10$ minutes.
  - `PERSISTENT`: Continuously observed for $> 12$ hours (e.g. gateway, NAS, smart TV).
  - `INTERMITTENT`: Frequently appears and disappears (e.g. mobile phones).

- **Memory Bounds**: Maximum 256 device entries per network environment, with LRU eviction of inactive devices older than 7 days.

---

## 8. Behavioral Network Intelligence & Feature Derivation

N9 computes higher-level behavioral features from N7 aggregated time-series and N2 flow mappings:

1. **Connection Fan-Out Ratio**: Number of distinct remote destination IPs contacted by a single process over a 5-minute window. Identifies sudden fan-out (e.g., crawler, discovery tool, or updater).
2. **Destination Novelty Score**: Identifies newly contacted remote IPs/domains that have not been observed in the 24-hour history buffer.
3. **Protocol Usage Distribution**: Breakdown of traffic volume and flow counts across standard vs non-standard ports (e.g., HTTPS/443 vs SSH/22 vs unknown ephemeral ports).
4. **Process Burst Activity**: Identifies processes whose current throughput rate exceeds $3\times$ their 1-hour moving average baseline.
5. **Periodic / Recurrent Flow Detection**: Detects flows that establish connections at regular fixed intervals (e.g., telemetry pings, background sync, keepalives).

---

## 9. Cross-Domain Correlation Engine

N9 correlates disjoint system entities into a unified graph context with explicit relationship confidence and evidence:

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     Process     │──────►│  Local Service  │──────►│   Active Flow   │
│ (PID, Name, Path│       │ (Port, Protocol)│       │ (State, Dir)    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
         │                                                   │
         ▼                                                   ▼
┌─────────────────┐                                 ┌─────────────────┐
│ Process Traffic │                                 │ Remote Endpoint │
│ (Bytes In/Out)  │                                 │ (IP, Port, Geo) │
└─────────────────┘                                 └─────────────────┘
                                                             │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │ Subnet Device / │
                                                    │ Peer Identity   │
                                                    └─────────────────┘
```

**Context Synthesis Example**:
When an event occurs, N9 synthesizes a complete context payload with relationship confidence:
```json
{
  "entity_type": "cross_domain_flow",
  "process": {"pid": 4512, "name": "code.exe"},
  "service": null,
  "flow": {"local": "192.168.1.10:54231", "remote": "142.250.190.46:443", "protocol": "tcp", "direction": "outbound"},
  "remote_device": {"is_lan": false, "domain": "update.code.visualstudio.com"},
  "traffic_profile": {"rate_out_bps": 12400, "classification": "standard_https"},
  "confidence": 0.95,
  "evidence": [
    "Authoritative OS process association (PID 4512)",
    "Active connections to 1 distinct peer endpoint(s)"
  ]
}
```

---

## 10. Confidence & Evidence Model

To guarantee transparency and prevent ungrounded AI hallucinations:
1. **Mandatory Fields**: Every classification, role attribution, and behavioral insight must include:
   - `result`: Concrete classification or observation value.
   - `confidence`: Normalized float between `0.0` and `1.0`.
   - `evidence`: Array of human-readable deterministic justification strings.
   - `source_telemetry`: Reference to source N1–N7 telemetry fields.
2. **Strict Rule**: If evidence is weak (e.g. vendor/OUI alone), the result is classified as `UNKNOWN` with confidence $\le 0.40$. Heuristics are never presented as authoritative facts.
3. **Non-Verdict Invariant**: N9 produces explainable observational intelligence only; N6 Guardian remains the sole authority for security verdicts.

---

## 11. Long-Term Memory Integration (N9.2)

N9 integrates directly with Fluffy's existing user memory architecture (`fluffy_data/memory/long_term.json` via `brain/memory/user/long_term_memory.py`) to persist durable user and environment facts across desktop sessions.

### 11.1 Durable Projection Schema
```json
{
  "user_profile": { ... },
  "behavior": { ... },
  "network_intelligence": {
    "known_networks": {
      "net_7a8f1b2c": {
        "alias": "Home Office Wi-Fi",
        "trusted": true,
        "confidence": 0.85,
        "first_seen": "2026-09-01T10:00:00Z",
        "last_seen": "2026-09-11T00:30:00Z",
        "evidence": ["Active Wi-Fi SSID association: 'HomeOffice_5G'"]
      }
    },
    "device_aliases": {
      "3c:22:fb:12:34:56": {
        "alias": "Sudip's iPhone 15",
        "user_classified": "PHONE",
        "updated_at": "2026-09-11T00:30:00Z"
      }
    },
    "approved_services": {
      "tcp:0.0.0.0:631": {
        "description": "Approved Local IPP Printer",
        "approved": true,
        "updated_at": "2026-09-11T00:30:00Z"
      }
    }
  },
  "metadata": { ... }
}
```

### 11.2 What is Persisted vs What is Explicitly Not Persisted
* **Persisted (Durable Knowledge Only)**:
  * Recognized network fingerprints (`net_xxxxxxxxxxxx`), user aliases, and trusted flags.
  * User-defined device aliases and role overrides.
  * User-approved local listening services.
* **Strictly Excluded (Never Stored in Memory)**:
  * Packet payloads, frame bytes, or raw packet capture buffers.
  * Wi-Fi passwords, passphrases, WPA keys, or credentials.
  * Bulk socket-flow history and high-frequency traffic streams.
  * Raw observation snapshots.

### 11.3 Memory Write Guarantees
* **Bounded**: Max 64 known networks, max 256 device aliases, max 128 approved services with LRU retention.
* **Idempotent & Safe**: Writes are deterministic and resilient to repeated polling cycles.
* **Fail-Safe Isolation**: A file lock or persistence failure in memory projection never breaks network observation or API responses.

---

## 12. Agent & LLM Tool Integration (N9.3)

N9 exposes structured, token-efficient, read-only tools to Fluffy's Agent via `brain/tools/network_intelligence.py` and the canonical `UnifiedToolRuntime`:

### 12.1 The Four Agent Tools

1. **`get_network_summary`**:
   - **Canonical ID**: `native.network.get_network_summary`
   - **Aliases**: `get_network_summary`, `tool:get_network_summary`
   - **Purpose**: Returns a compact environment summary without blowing prompt token budgets.
   - **Parameters**: `timeout` (number, optional, default: 8.0)
   - **Output Structure**: `network` (identity, interface, type, ssid, gateway, confidence, evidence, trust_level), `devices` (total, online), `services` (total, active), `active_processes_count`, `recent_events` (bounded to 5), `insights` (bounded to 5), `freshness`.

2. **`list_network_devices`**:
   - **Canonical ID**: `native.network.list_network_devices`
   - **Aliases**: `list_network_devices`, `tool:list_network_devices`
   - **Purpose**: Returns bounded list of classified subnet devices with confidence and evidence.
   - **Parameters**:
     - `presence` (string, enum: `active`, `recently_seen`, `returning`, `persistent`, `intermittent`, `all`, default: `all`)
     - `classification` (string, optional: `gateway`, `phone`, `printer`, `workstation`, `unknown`, `all`, default: `all`)
     - `limit` (integer, range: 1–256, default: 50)
   - **Output Structure**: `devices` (array of device objects with device_id, ip, mac, hostname, vendor, classification, confidence, evidence, status, user_alias, is_gateway, first_seen, last_seen), `count`, `total_matching`, `freshness`.

3. **`list_local_services`**:
   - **Canonical ID**: `native.network.list_local_services`
   - **Aliases**: `list_local_services`, `tool:list_local_services`
   - **Purpose**: Returns bounded catalog of local listening services mapped to host processes with lifecycle states.
   - **Parameters**:
     - `status` (string, enum: `active`, `persistent`, `transient`, `inactive`, `all`, default: `all`)
     - `limit` (integer, range: 1–128, default: 50)
   - **Output Structure**: `services` (array of service objects with service_id, process_name, pid, local_address, port, protocol, status, lifetime_seconds, well_known_name, missed_snapshots, consecutive_observations, first_seen, last_seen), `count`, `total_matching`, `freshness`.

4. **`get_network_changes`**:
   - **Canonical ID**: `native.network.get_network_changes`
   - **Aliases**: `get_network_changes`, `tool:get_network_changes`
   - **Purpose**: Returns a bounded chronological log of recent network transitions and lifecycle changes.
   - **Parameters**: `limit` (integer, range: 1–100, default: 20)
   - **Output Structure**: `changes` (array of event transition objects matching N9.1 semantics), `count`, `freshness`.

### 12.2 Security & Execution Invariants
- **Read-Only**: Risk level set to `ToolRiskLevel.READ_ONLY`. No confirmation prompts, no mutations.
- **Execution Boundary**: Passes strictly through `UnifiedToolRuntime` (Resolver -> Validator -> Security Policy -> Native Adapter).
- **Direct Service Invocation**: Tools call `get_local_network_service()` directly within the Brain process, reading cached snapshots (3.0s TTL) with zero localhost HTTP overhead.
- **Zero Sensitive Data**: Tool outputs strictly exclude passwords, Wi-Fi keys, raw packet payloads, and bulk packet buffers.
- **Authority Invariant**: N6 Guardian remains the sole authority for security alerts and verdicts; N9 tools never synthesize threat verdicts.

---

## 13. API Boundaries & Read-Only Endpoints (N9.2)

N9 exposes clean, read-only REST endpoints registered under both `/network_intelligence/` and `/local_network/intelligence/`:

- `GET /network_intelligence/summary`: High-level summary of active network identity, device/service tallies, recent events, insights, and cache freshness.
- `GET /network_intelligence/devices`: List of classified subnet devices with vendor, confidence, presence, and user aliases.
- `GET /network_intelligence/services`: Catalog of active and persistent local listening services with observation counters.
- `GET /network_intelligence/changes`: Bounded chronological list (ring buffer of last 100 events) of transitions and lifecycle changes.

### 13.1 Security & Freshness Guarantees
- **Authentication**: All endpoints strictly require `@token_required` (`X-Fluffy-Token`).
- **Read-Only**: No state mutations, command execution, or packet modifications via API.
- **Cheap Reads**: Endpoints read from cached current intelligence (TTL: 3.0s) to avoid expensive per-request re-computations.
- **Freshness Semantics**: Responses expose `freshness` object (`collected_at`, `age_seconds`, `is_stale`).
- **Authority Invariant**: API responses produce zero security verdicts (N6 Guardian remains the sole authority).

---

## 14. UI Presentation & Industrial Operations Workbench (N9.4)

N9.4 delivers a dedicated, industrial-grade engineering console within the Systems domain (`ui/tauri/src/features/systems/views/NetworkIntelligenceView.tsx`), powered by a dedicated frontend store (`ui/tauri/src/stores/networkIntelligenceStore.ts`) and typed API service (`ui/tauri/src/services/api/networkIntelligence.ts`):

### 14.1 Workspace Tabs & Views
- **Overview Tab**:
  - Network Environment Fingerprint Card (network ID, SSID, Gateway, local IPs, fingerprint confidence meter, evidence hierarchy tags, trust badge).
  - Metrics Tallies (Subnet Devices total & online, Local Service Catalog total & active, Owning Processes unique count).
  - Synthesized Behavioral Observations list (novelty surges, baseline deviations with confidence).
  - Recent Network Transitions (last 5 ring buffer events).
- **Devices Tab**:
  - Dense operational table with search (IP, MAC, hostname, vendor, alias), role filter (`GATEWAY`, `ROUTER`, `WORKSTATION`, `LAPTOP`, `PHONE`, `TABLET`, `IOT`, `PRINTER`, `SERVER`, `INFRASTRUCTURE`, `UNKNOWN`), and presence filter (`all`, `active`, `inactive`).
  - Columns: Presence indicator dot, Device / Alias, IP address, MAC & Vendor, Classification badge, Confidence pill, Evidence breakdown.
  - Interactive selection to open the Inspector drawer.
- **Services Tab**:
  - Dense operational table with search and status filter (`ALL`, `ACTIVE`, `TRANSIENT`, `INACTIVE`).
  - Columns: State badge, Service / Name, Address : Port, Protocol, Owning Process & PID, Lifetime duration, Observations counter (`X seen · Y missed`).
  - Interactive selection to open the Inspector drawer.
- **Changes Tab**:
  - Chronological transition event stream from the N9 ring buffer with limit selector (20, 50, 100).
  - Event badges (`NETWORK_SWITCHED`, `DEVICE_APPEARED`, `SERVICE_ACTIVE`, etc.), timestamps, and structured entity details JSON.
- **Inspector Drawer**:
  - Deep entity inspection for selected device or service.
  - Device: Full identity, addresses, MAC & vendor, classification rationale, confidence score, evidence hierarchy, and cross-domain shortcut ("Inspect in Local Network Flows").
  - Service: Service ID, port, protocol, local binding, process name & PID, lifecycle history, consecutive observation count, missed snapshots, and cross-domain shortcut ("Inspect Process in Systems").

### 14.2 UI Freshness & Polling Architecture
- Single coordinated polling loop (5000ms interval) that batches summary, devices, services, and changes requests without redundant polling.
- Real-time freshness status badge: `LIVE POLLING (5s)`, `STALE DATA`, `API ERROR`, or `MANUAL`.
- Resilient error handling that preserves cached state during transient backend pauses.

---

## 15. Performance, Memory & Scalability Strategy

- **Zero Intrusive Probing**: Runs purely on snapshots collected during standard N1–N7 background polling intervals (e.g., 3–5 seconds).
- **Incremental Diffing**: State updates are computed as $\Delta(\text{Previous}, \text{Current})$, avoiding expensive $O(N^2)$ re-computations.
- **Strict Memory Ceilings**:
  - Maximum 256 devices per network.
  - Maximum 128 services in the catalog.
  - Maximum 100 events in the intelligence timeline ring buffer.
  - Total N9 memory footprint: **$< 2\text{ MB}$ RAM**.
- **Non-Blocking Execution**: Background intelligence updates run asynchronously without delaying core API responses.

---

## 16. Security Boundaries & Invariants

1. **Strictly Read-Only**: N9 contains zero remediation, packet injection, firewall modification, device isolation, or process killing logic.
2. **Separation from Security Anomaly Detection**: N9 produces **features and structured context**. Guardian N6 remains the sole authoritative evaluator of security anomalies and risk alerts.
3. **Zero Credential Exposure**: Never handles, stores, or parses Wi-Fi passwords, authentication secrets, or private keys.
4. **Packet Capture Independence**: Operates 100% on passive structured telemetry from N1–N7 without requiring raw packet sockets or packet capture drivers.


---

## 17. Implementation Phases & Completion Status

All 4 phases of N9 Network Intelligence are fully implemented, verified, and frozen:

- **N9.1: Core Intelligence Engine & Domain Models** (`brain/runtime/network_intelligence.py`) — **COMPLETED & FROZEN**
  - Evidence-driven device classifier (hierarchy: strong / medium / weak OUI).
  - Uncertainty-aware service catalog tracker (distinguishes temporary absence from confirmed termination).
  - Best-effort deterministic network environment fingerprinting with confidence and evidence.
  - Precise transition semantics (`NETWORK_SWITCHED`, `GATEWAY_CHANGED`, `LOCAL_IP_CHANGED`, `NETWORK_IDENTITY_CHANGED`).
  - Cross-domain entity correlation with relationship confidence.
  - Comprehensive unit tests in `tests/brain/test_network_intelligence.py`.
- **N9.2: Memory & Service Integration** (`brain/routes/local_network_routes.py`, `brain/memory/user/long_term_memory.py`) — **COMPLETED & FROZEN**
  - Durable network identity, user device aliases, and approved service projection to `long_term.json`.
  - Fail-safe memory write isolation with zero credential or packet persistence.
  - Read-only authenticated Brain API routes (`/network_intelligence/summary`, `/devices`, `/services`, `/changes`).
  - Cached snapshot reads with freshness metadata.
- **N9.3: Agent Tools** (`brain/tools/network_intelligence.py`, `brain/tools/registry.py`) — **COMPLETED & FROZEN**
  - Four token-efficient, read-only agent tools (`get_network_summary`, `list_network_devices`, `list_local_services`, `get_network_changes`).
  - Canonical registration in `ToolRegistry` and integration with `UnifiedToolRuntime`.
  - Strict parameter validation, presence/classification/status filtering, and hard bounds enforcement (max 256 devices, 128 services, 100 events).
  - Zero sensitive credential/packet data exposure.
  - Comprehensive unit and integration test coverage in `tests/brain/test_network_intelligence_tools.py`.
- **N9.4: UI Workspace Visualizers** (`NetworkIntelligenceView.tsx`, `networkIntelligenceStore.ts`) — **COMPLETED & FROZEN**
  - Dedicated industrial Operations Workbench workspace with Overview, Classified Devices, Local Service Catalog, and Timeline & Transitions tabs.
  - Deep entity Inspector drawer for devices and services.
  - Dedicated frontend store and typed API service with unified 5s polling and visible freshness semantics.
  - 100% test coverage with zero security leaks or cross-domain coupling.



---

## 18. Explicit Exclusions
The following capabilities are explicitly out of scope and excluded from N9:
- Active network scanning / ARP sweeps / ping floods.
- Port scanning (SYN/Connect/Xmas scans).
- Packet capture, pcap logging, or frame dissection.
- Intrusion Prevention (IPS), active firewall rules, or TCP connection resets.
- Cloud telemetry streaming or remote dependency.
- External vulnerability database querying.

---
