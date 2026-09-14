# Phase N12: Guardian Behavioral Security & Network Integration

## 1. Architectural Role & Boundary

Phase N12 establishes a unified, unidirectional intelligence and telemetry pipeline between the Python Guardian security engine and the authoritative Rust Network subsystem without conflating their distinct responsibilities.

```
+-------------------------------------------------------------+
|                       Rust Network                          |
|  - Authoritative Network Reality & State                    |
|  - Device, Node, Connection, & Interface Lifecycle          |
|  - Telemetry & Packet Monitoring Services                   |
+-------------------------------------------------------------+
                              |
                     Telemetry Broadcast
                   (flows, packets, state)
                              v
+-------------------------------------------------------------+
|                   Python Guardian Engine                    |
|  - Behavioral Intelligence & Anomaly Scoring                |
|  - NetworkCorrelationEngine (Scenarios 1-5)                 |
|  - Threat Verdicts & Persistent Audit Engine (audit.json)   |
+-------------------------------------------------------------+
                              |
               Network.RecordSecurityObservation
                  Capability Request (IPC)
                              v
+-------------------------------------------------------------+
|               Rust Capability Registry & IPC                |
|  - NetworkRecordSecurityObservationHandler                  |
|  - Validates Observation Schema                             |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                  Rust TelemetryService                      |
|  - Canonical Identity Correlation Precedence                |
|  - Event Dispatch: EventCategory::Security                  |
|  - NetworkEventType::SecurityObservationCreated             |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    NetworkEventBus (N6)                     |
|  - Monotonic Sequence Increment                             |
|  - Ring Buffer Retention (1000 events)                      |
|  - Broadcast to Tauri WebSocket / IPC Streaming             |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|             React / Tauri networkWorkspaceStore (N8)        |
|  - Applies Security NetworkEvents into Bounded Event Log    |
|  - NetworkSecurityView Security Operations UI               |
|  - Direct Cross-Linking to Unified Inspector (N11)          |
+-------------------------------------------------------------+
```

### Core Invariants:
1. **Network does NOT own security rules or risk scoring**: Rust Network does not compute behavioral threat verdicts or score anomalies.
2. **Guardian does NOT own network state**: Guardian does not mutate `NetworkState` directly, assign connection IDs, or control node lifecycle.
3. **Event-Only Model in N12**: `NetworkSecurityObservation` is recorded onto `NetworkEventBus` as an ephemeral event (`EventCategory::Security`, `NetworkEventType::SecurityObservationCreated`). It is retained in the bounded N6 event buffer (1000 entries) and does not pollute authoritative persistent `NetworkState`.
4. **Persistent Audit Ownership**: Long-term security records remain exclusively owned by Guardian's `AuditEngine` (`audit.json`).
5. **No Emojis**: Zero emojis anywhere in codebase, logs, UI, or contracts.

---

## 2. Canonical Identity Correlation Precedence

When a `NetworkSecurityObservation` is processed by `TelemetryService::record_security_observation`, target entity correlation executes deterministically in strict order of confidence:

```
[Incoming Security Observation]
                |
                v
  1. Target Device MAC Provided?
     --> Find Device in NetworkState by MAC
     --> Match Found: Attach target_device_id
                | (if not matched or not provided)
                v
  2. Affected IP & Port Match Active Connection?
     --> Scan NetworkState.connections for remote_socket == (IP, Port)
     --> Match Found: Attach target_connection_id & target_node_id
                | (if not matched)
                v
  3. Affected IP Matches Unambiguous Device?
     --> Scan NetworkState.devices for ip_address == IP
     --> Single Match: Attach target_device_id
                | (if 0 or multiple matches)
                v
  4. Unresolved (None)
     --> Zero synthetic/hallucinated IDs created
```

---

## 3. Finding Identity vs Anomaly Occurrence vs Event ID

To prevent duplicate alert fatigue while maintaining precise real-time event tracing:

| Entity | Field | Generation Strategy | Purpose |
| :--- | :--- | :--- | :--- |
| **Finding Identity** | `anomaly.finding_key` | Deterministic hash/string based on invariant finding factors (e.g. `gateway_mac_change:eth0` or `port_listen:8080`) | Deduplication and persistence in Guardian's `AuditEngine`. |
| **Occurrence ID** | `observation.observation_id` | Scenario prefix + specific attributes + millisecond timestamp (e.g. `net_gw_change_eth0_1700000000`) | Distinguishes individual anomaly instances within a single finding run. |
| **Network Event ID** | `event.event_id` | Monotonic / cryptographically secure UUID (`evt-sec-...`) | Authoritative ordering and stream subscription on `NetworkEventBus`. |

---

## 4. Loop Prevention & Failure Semantics

1. **Feedback Loop Prevention**:
   - `record_security_observation` publishes events under `EventCategory::Security`.
   - `NetworkCorrelationEngine` only subscribes to raw network flow and traffic telemetry, explicitly ignoring `EventCategory::Security` events.
2. **Guardian Engine Outage / Disconnection**:
   - Rust Network operations and topology remain 100% operational.
   - `NetworkSecurityView` displays existing bounded history with stale status banners when telemetry streams degrade.
   - Capability calls gracefully fail with standard error envelopes without crashing the host process.
