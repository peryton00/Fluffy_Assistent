# Rust Network Foundation (Phase N1)

## 1. Overview & Subsystem Boundary

`core/src/network/` is the formal, authoritative Rust Network subsystem boundary for the Fluffy Assistant.

In Phase N1, it establishes a unified module entry point, strongly typed domain error models, stable network identifiers, a central transport configuration abstraction, and a subsystem lifecycle coordinator—while preserving 100% of existing Local Network Observability and Terminal operations.

```text
core/src/network/
├── mod.rs          # Unified public facade re-exporting all network types and collectors
├── config.rs       # Central transport configuration abstraction (NetworkTransportConfig)
├── error.rs        # Strongly typed domain errors (NetworkError, NetworkResult)
├── ids.rs          # Stable identifiers (NodeId, ConnectionId, NetworkInterfaceId)
├── subsystem.rs    # Subsystem lifecycle coordinator (NetworkSubsystem)
├── types.rs        # Strongly typed data models (Interface, Device, Flow, Wi-Fi, Packet)
├── interfaces.rs   # Cross-platform adapter enumeration and MAC normalization
├── traffic.rs      # Stateful TrafficRateCalculator for bandwidth telemetry
├── flows.rs        # Socket-to-process flow mappings (TCP/UDP)
├── discovery.rs    # Passive local subnet ARP neighbor discovery
├── wifi.rs         # Non-secret Wi-Fi profile and signal observation
└── capture.rs      # Bounded, metadata-only packet monitoring (N8/SIH26117)
```

---

## 2. Subsystem Responsibilities

### What Network Owns
- **Host Network Observability**: Authoritative, read-only extraction of network interfaces, traffic rates, ARP neighbors, active socket flows, non-secret Wi-Fi metadata, and bounded packet observations.
- **Transport Configuration**: Centralized representation of network transport settings (IPC ports `9001`/`9002`, WebSocket bridge port `9003`, Cluster mesh port `9000`, Brain REST port `5123`, FTP port `2121`).
- **Network Identifiers & Errors**: Strongly typed identifiers (`NodeId`, `ConnectionId`, `NetworkInterfaceId`) and structured error types (`NetworkError`).
- **Subsystem Lifecycle**: Minimal initialization, start/stop coordination, and configuration validation via `NetworkSubsystem`.

### What Network Does NOT Own
- **Terminal Command Parsing & REPL**: `core/src/terminal/` owns REPL syntax, terminal sessions, local shell execution, and terminal-specific command dispatch.
- **Security Policy Evaluation**: `core/src/permissions/` owns capability security tiers and confirmation policies (`evaluate()`).
- **Higher-Level Semantic Classification**: `brain/guardian/` and `brain/runtime/` own semantic device categorization heuristics (N9), long-term memory correlation, and threat detection.

---

## 3. Subsystem Relationships

### 3.1 Network and Terminal
- `core/src/terminal/` remains completely functional and independent for REPL execution and agent session handling.
- In future phases (N4/N5), Terminal will consume authoritative connection handles from Network rather than maintaining its own ad-hoc socket management.

### 3.2 Network and Python Brain
- Python Brain interacts with the Network subsystem strictly through controlled IPC capability commands (`Network.*`) and telemetry streams on port `9001`.
- `brain/runtime/local_network_service.py` consumes structured capability responses and exposes them via Flask REST endpoints (`/local_network/*`).

### 3.3 Network and Guardian
- Guardian consumes native, structured observations (interfaces, flows, neighbor changes) via the local network service to build security baselines (`GuardianNetworkCorrelator`).
- Network maintains zero-credential and zero-payload invariants so Guardian never ingests or leaks sensitive application bytes.

---

## 4. Preservation Invariants

1. **Local Network Collectors Intact**:
   - `interfaces.rs`, `traffic.rs`, `flows.rs`, `discovery.rs`, `wifi.rs`, and `capture.rs` remain completely unchanged.
   - All existing capability handlers (`Network.ListInterfaces`, `Network.GetInterfaces`, `Network.GetLocalDevices`, etc.) remain 100% compatible.
2. **Zero-Credential Wi-Fi Invariant**:
   - Wi-Fi observation continues to extract only non-secret metadata (SSID, signal strength, auth type, cipher). Passwords and keys are strictly excluded.
3. **Bounded Packet Capture Guarantee**:
   - Packet observation continues to operate with strict buffer limits, duration bounds, and metadata-only inspection.
4. **Cluster Migration Deferred**:
   - Migration of the Python cluster network (`fluffy/network/`) is intentionally deferred to later phases (N3/N4) to avoid breaking working functionality before the Rust domain model (N2) and state engine (N3) are established.
