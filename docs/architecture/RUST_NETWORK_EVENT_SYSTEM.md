# Rust Network Event System (Phase N6)

## 1. N6 Purpose
Phase N6 introduces a canonical, Rust-owned event system for Fluffy Assistant that streams meaningful occurrences and state transitions across cluster management, device discovery, host interfaces, transport connections, telemetry changes, and security observations.

---

## 2. Event vs. State Distinction
An absolute architectural invariant is maintained:
```text
NetworkState
= Current authoritative network reality (snapshot isolated, mutable only via validated mutations)

NetworkEventBus
= Ephemeral, ordered stream of discrete occurrences and state transitions
```
- **No Secondary State Store**: Events do NOT constitute state. Components must never read past events to reconstruct current state; current state is always queried directly from `NetworkState`.
- **Observation Stream**: Events inform subscribers of changes as they happen.

---

## 3. Event Domain Model
The canonical event envelope (`NetworkEvent`) defines:
- `event_id`: Unique identifier for the occurrence (`EventId`).
- `sequence`: Monotonically increasing sequence number assigned by `NetworkEventBus`.
- `state_revision`: Resulting `NetworkState.revision` associated with the committed state change.
- `timestamp_epoch_ms`: Millisecond Unix timestamp when the event was generated.
- `category`: High-level taxonomy (`EventCategory`).
- `event_type`: Strongly typed event classification (`NetworkEventType`).
- `severity`: Significance classification (`EventSeverity`).
- `source_node_id` / `target_node_id`: Optional node identifiers involved.
- `target_device_id`: Optional device identifier involved.
- `target_connection_id`: Optional connection identifier involved.
- `summary`: Human-readable description.
- `details`: Structured JSON payload (guaranteed free of credentials, tokens, or raw secrets).

---

## 4. EventId Semantics
- **Identity Invariant**: `EventId` uniquely identifies an individual occurrence.
- $\text{EventId} \neq \text{NodeId}$, $\text{EventId} \neq \text{DeviceId}$, $\text{EventId} \neq \text{ConnectionId}$.
- Generated as `evt_<uuid>` via `EventId::random()` or explicit identifier `EventId::new(...)`.

---

## 5. Timestamp Semantics
- Timestamps represent the system observation time in epoch milliseconds (`timestamp_epoch_ms`).
- Rust owns timestamp generation.
- Timestamps are distinct from sequence numbers and are never used alone for event ordering.

---

## 6. Sequence Numbers & Restart Semantics
- `NetworkEventBus` owns a monotonic atomic sequence counter (`AtomicU64`).
- Sequence numbers increase strictly monotonically ($1, 2, 3, \dots$).
- Sequence numbers are assigned upon publication inside the publisher boundary.
- **Process Lifetime Scope**: Sequence numbers are scoped to the running process lifecycle and start at 1 on application start. No database persistence or replay exists in N6.

---

## 7. Categories
Reuses and extends canonical `EventCategory`:
- `Cluster`: Cluster membership, availability transitions, heartbeat liveness.
- `Network`: Local host network infrastructure and operational changes.
- `Discovery`: Subnet device discoveries and neighbor reachability.
- `Telemetry`: Throughput rate anomalies and traffic metrics.
- `Connection`: Transport socket and flow lifecycle.
- `Security`: Security observations and anomalies.
- `Admin`: Administrative operations and terminal sessions.
- `System`: General subsystem lifecycle.

---

## 8. Severity
Categorized by `EventSeverity`:
- `Info`: Normal operational state transitions (e.g., node connected, device discovered).
- `Notice`: Notable non-erroneous occurrences.
- `Warning`: Recoverable degradation, heartbeat timeouts, interface down transitions.
- `Error`: Connection or authentication failures, high-risk security observations.
- `Critical`: Severe policy violations or system security alerts.

---

## 9. Event Types
Strongly typed enumeration via `NetworkEventType`:
- **Cluster**: `NodeDiscovered`, `NodeAvailable`, `PairingStarted`, `PairingCompleted`, `AuthStarted`, `Authenticated`, `AuthFailed`, `NodeConnected`, `NodeDisconnected`, `NodeRecovered`, `HeartbeatMissed`, `RoleChanged`.
- **Discovery / Interface**: `InterfaceAdded`, `InterfaceRemoved`, `InterfaceChanged`, `DeviceDiscovered`, `DeviceUpdated`, `DeviceRemoved`, `DeviceStateChanged`.
- **Connections / Telemetry**: `ConnectionOpened`, `ConnectionClosed`, `ConnectionStateChanged`, `TrafficSpike`, `TrafficMetricsUpdated`.
- **Security**: `UnknownDevice`, `SuspiciousTraffic`, `AuthViolation`, `AnomalyDetected`, `PolicyViolation`, `SecurityObservationCreated`.
- **Administration**: `RemoteActionStarted`, `RemoteActionCompleted`, `RemoteActionDenied`, `TerminalSessionOpened`, `TerminalSessionClosed`.

---

## 10. Payload Structure & Safety
The `details` field is a structured JSON value:
- Provides context-specific diagnostic attributes (e.g. anomaly details, interface names, IP bindings).
- Strictly sanitized: no passwords, tokens, session keys, private keys, or raw packet payloads are ever permitted in event payloads.

---

## 11. State / Event Ordering
State mutations strictly precede event emissions:
```text
1. Validate mutation
2. Mutate NetworkState (acquire write lock)
3. Commit mutation & update revision
4. Release NetworkState write lock
5. Publish NetworkEvent to NetworkEventBus (with resulting state_revision)
6. Deliver to subscribers via isolated channels
```
Subscribers NEVER observe an event that contradicts the committed authoritative state. Subscribers NEVER execute callbacks while `NetworkState` locks are held.

---

## 12. Revision Correlation
Every state-mutating event captures `state_revision: Some(revision)`. This enables downstream subscribers (such as future N7 APIs and UI caches) to correlate incoming events directly with state snapshots without ambiguity.

---

## 13. Subscription Architecture
- Built around `tokio::sync::broadcast` with bounded capacity (`DEFAULT_EVENT_BUFFER_CAPACITY = 1024`).
- Multiple concurrent subscribers receive broadcasts via `EventSubscriber`.
- Subscribers can poll via asynchronous `.recv()` or non-blocking `.try_recv()`.

---

## 14. Bounded Delivery & Memory Safety
- Broadcast channels are strictly bounded in size.
- Memory consumption is capped regardless of subscriber volume or execution speed.
- Slow or unresponsive subscribers cannot cause memory leaks or backpressure on state writers.

---

## 15. Slow Subscriber Behavior
- When a subscriber lags behind the ring buffer, oldest events are dropped for that subscriber.
- The subscriber receives `EventRecvError::Lagged(count)` or `EventTryRecvError::Lagged(count)` indicating the exact number of missed events.
- Subscribers track cumulative dropped events via `.dropped_count()` and can call `.resubscribe()` to resynchronize with current stream head.

---

## 16. Event Generation & Revision Churn Prevention
Events and state revisions are NOT churned on continuous polling loops if state remains unchanged:
```text
Observation → Compare against NetworkState → Material change?
   ├── No  → Update/retain state quietly (0 revision increments, 0 events emitted)
   └── Yes → Commit mutation (revision++) + Publish event
```

---

## 17. Cluster Events & Heartbeat Transitions
- Transitions between availability states emit exactly once (e.g. `Available -> Pairing`, `Authenticating -> Connected`).
- Healthy `Connected` nodes receiving heartbeats update `last_seen_epoch` quietly without emitting events or bumping revisions.
- When a node exceeds the timeout threshold, a single `HeartbeatMissed` / `NodeDisconnected` transition event is emitted.
- Continued timeout checks on already disconnected nodes do NOT emit duplicate disconnect events.
- Authenticated node recovery after heartbeat restore emits `NodeRecovered`.

---

## 18. Discovery Events & Removal Boundaries
- When a new device is first observed on the LAN, `DeviceDiscovered` is emitted.
- Subsequent observations of the same device with identical reachability emit zero events.
- If device reachability changes (`Reachable -> Stale`), `DeviceStateChanged` is emitted.
- **Discovery Disappearance Limitation**: Passive OS neighbor/ARP cache eviction occurs naturally due to kernel idle timers even when a physical device remains powered on and connected to the LAN. Therefore, passive ARP eviction cannot reliably prove physical departure, and departure events are NOT fabricated from passive cache expirations.

---

## 19. Interface Events
- Emitted when an interface is newly discovered (`InterfaceAdded`) or changes operational status/addresses (`InterfaceChanged`, e.g. UP/DOWN or IP reassignment).
- Normal byte counter increments and rate changes update `TrafficMetrics` in state without emitting noisy interface events.

---

## 20. Connection Events & Reconciliation
- `ConnectionOpened` is emitted when a new transport flow is detected.
- `ConnectionStateChanged` is emitted when a socket flow state transitions (e.g. `SynSent -> Established`).
- When local flows are polled, active OS flows are reconciled against existing `ConnectionKind::LocalSocketFlow` records in `NetworkState`. Flows that have terminated are removed from state and emit `ConnectionClosed`.
- `ConnectionKind::ClusterTransport`, `ConnectionKind::IpcStream`, and `ConnectionKind::WebSocketBridge` connections are strictly preserved during local socket reconciliation.

---

## 21. Telemetry Events Policy
- Continuous bandwidth rates and packet counters are telemetry data stored in `NetworkState.traffic`.
- Routine rate ticks do NOT emit events. Events are reserved for distinct anomalies (`TrafficSpike` or `TrafficMetricsUpdated` upon threshold crossing).

---

## 22. Security Events
- `NetworkTelemetryService::record_security_observation` publishes `SecurityObservationCreated` or `AnomalyDetected` with severity mapped from `SecurityRiskLevel`.
- Discovery and telemetry remain observational; no security scoring engine is introduced.

---

## 23. Serialization Safety
- `NetworkEvent` derives `Serialize` and `Deserialize`.
- All fields are safe for future transmission across IPC and WebSocket boundaries.
- No secrets or sensitive memory pointers are serializable.

---

## 24. Concurrency & Thread Safety
- `NetworkEventBus` uses atomic counters and thread-safe lock-free broadcast queues.
- Verified under concurrent multi-publisher, multi-subscriber stress tests with zero deadlocks.

---

## 25. Failure Isolation
- Failure or lagging of any subscriber is completely isolated from the `NetworkSubsystem` and `NetworkState`.
- If zero subscribers exist, event publication returns immediately without error.
- State mutation never depends on subscriber delivery success.

---

## 26. Future N7 Integration
`NetworkSubsystem` exposes `subsystem.events()` and `subsystem.subscribe()`, providing the foundational event source for future Phase N7 Network API endpoints.

---

## 27. Explicit Non-Goals & Out of Scope
Phase N6 explicitly does NOT implement:
- Event persistence / historical event database.
- External Network API / IPC transport (N7).
- Tauri commands or UI event hooks (N8+).
- Guardian security engine correlation (N12).
- Authenticated remote administration (N13).
- Port migration.
