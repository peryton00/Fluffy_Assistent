# Phase N16: Network Subsystem Test Audit

## 1. Overview & Objectives
Phase N16 systematically validates the complete Fluffy Network subsystem developed through Phases N0–N15. This audit catalogs all existing test suites across the Rust core, frontend workspaces, integration test suites, and compatibility boundaries, identifying missing test coverage and high-risk failure modes to target with adversarial, concurrency, and stress test suites.

---

## 2. Test Inventory by Layer

### A. Rust Core Unit Tests (`core/src/`)
- Total active unit tests in `core/src/`: 165 passed
- Target areas covered:
  - `network::state`: Monotonic revision increments, snapshot isolation, device/node/connection lifecycles, concurrency locks.
  - `network::cluster`: Lifecycle validation transitions, pairing states, heartbeat tracking, timeout checks.
  - `network::transport`: Binary framing magic (`0x464E`), length bounds (16 MiB max), message types, Noise XX handshake primitives, SecureSession replay tracking.
  - `network::crypto`: Keypair generation, public key serialization, fingerprinting, SAS calculation, TrustedPeerStore CRUD and revocation.
  - `network::admin`: AdminCommandController local execution, batch execution concurrency limit (5), deadline skew checks.
  - `permissions::policy`: SecurityTier classifications, caller context evaluation (local elevated vs standard, remote secure vs legacy), protected PID denial (0, 1, 4, self).
  - `capabilities::dispatch`: Native capability dispatching, hardware information, process listing, process termination safety guards.
  - `network::telemetry` & collectors: Flow tracking, packet monitor, interface rates, Wi-Fi profile parsing, ARP parsing.
  - `network::event`: Bounded broadcast channel lag accounting, multi-subscriber isolation.

### B. Rust Integration Test Suites (`core/tests/`)
1. **`n14_security_transport_tests.rs` (17 tests)**:
   - Noise XX mutual cryptographic handshake, tampering detection, ephemeral key generation.
   - TrustedPeerStore identity mismatch rejection, revoked peer rejection, unknown peer handling.
   - Binary frame oversized payload rejection before allocation, unsupported version rejection, invalid magic rejection.
   - Live TCP 9000 secure connection, Process.List & Process.Terminate end-to-end execution.
   - Plaintext downgrade prevention on live sockets.
   - Permission policy confirmation enforcement and protected PID rejection over live socket.

2. **`n15_reliability_tests.rs` (10 tests)**:
   - Heartbeat timeout detection (`Connected -> Disconnected`) and recovery (`Recovering -> Connected`).
   - Prevention of unauthenticated node promotion via heartbeat.
   - Duplicate session supersession and immunity to stale disconnect callbacks.
   - Immediate in-flight command failure upon transport disconnect.
   - Reconnect exponential backoff growth and jitter bounds (1s to 60s, ±20% jitter).
   - Non-idempotent operation (`Process.Terminate`) retry prevention on connection loss.
   - NetworkSubsystem background sweeper start/stop lifecycle.
   - Standalone network operation without Python Brain or Tauri UI.
   - End-to-end TCP live reconnect and recovery lifecycle.

### C. Frontend Vitest Suites (`ui/tauri/src/`)
- Total active frontend tests: 323 passed across 47 test files.
- Network workspace test coverage:
  - `NetworkWorkspace.test.tsx` (11 tests): Tab switching, header status, inspector coordination.
  - `NetworkTopologyView.test.tsx` (8 tests): Topology layout, selection binding, canvas rendering.
  - `NetworkInspector.test.tsx` (11 tests): Dynamic panel rendering for selected Node, Device, Connection, Interface.
  - `topologyModel.test.ts` (15 tests): Graph derivation from state snapshot, cluster/network/traffic/security modes.
  - `networkWorkspaceStore.test.ts` (15 tests): Real-time snapshot assimilation, node selection, filter state.
  - `networkApi.test.ts` (9 tests): REST envelope parsing, capability requests, pairing endpoints.
  - `networkEvents.test.ts` (3 tests): WebSocket lifecycle and event dispatching.

---

## 3. Comprehensive Test Coverage Matrix

| Area | Existing Coverage | Missing / Stress Coverage Needs | Risk Classification |
|---|---|---|---|
| **NetworkState** | Monotonic revisions, snapshot reads, basic thread contention. | Massive concurrency (100 parallel readers + simultaneous mutators), snapshot immutability under extreme mutation rates. | High |
| **Cluster Lifecycle** | Valid transitions (`Available -> Pairing -> Authenticating -> Connected`), timeout sweeps. | Explicit invalid transition matrix verification (all disallowed source-target pairs rejected with errors). | High |
| **Session Race Conditions** | Basic session supersession (Session 1 superseded by Session 2). | Interleaved race sequences: A disconnect vs B connect, A heartbeat after B supersession, stale responses arriving from old sockets. | High |
| **Heartbeat System** | Interval tracking, timeout calculation, recovering promotion. | Exact boundary timing tests (just before timeout, immediately after timeout), burst heartbeat deduplication. | Medium |
| **Reconnect & Backoff** | Backoff math, reset on connect, client agent reconnect loop. | Rapid connection flapping, repeated handshake failures, cancellation during backoff sleep. | Medium |
| **Noise Transport (Adversarial)** | Framing magic, length bounds, bad handshake parameters. | Hostile transport fuzzing: truncated frames, modified ciphertext, bad AEAD tag, connection drop mid-frame, zero-length frames. | High |
| **TrustedPeerStore** | Store persistence, mismatch evaluation, revocation. | Concurrent store access, re-pairing after revocation, tampered store files on disk. | High |
| **Admin Authorization** | Security tiers, local vs remote, protected PIDs. | Full combinatorial matrix: all 5 SecurityTiers against all caller roles, forged client context rejection. | Critical |
| **Admin Commands** | Local dispatch, live remote dispatch, timeout error. | Ambiguous disconnect mid-execution, stale response rejection, guaranteed single-execution for non-idempotent commands. | Critical |
| **Batch Commands** | Bounded concurrency (5), aggregated result. | Mixed reachable/unreachable targets, partial timeout in batch, duplicate targets in single batch. | Medium |
| **NetworkEventBus** | Monotonic timestamps, basic lag. | Severe subscriber lag with 1000+ burst events, subscriber drops during heavy emission. | Medium |
| **API Contracts** | Version contracts, standard envelope serialization. | Protocol version mismatch rejection, malformed payload envelopes, RequestId preservation. | Medium |
| **Topology Derivation** | Graph modes, edge deduplication, node mapping. | State snapshot transformations, external endpoint normalization without fabricated entities. | Low |
| **Unified Inspector** | Selection routing across UI views. | Entity disappearance handling, state synchronization when selected entity disconnects. | Low |
| **Guardian Integration** | Correlation precedence (MAC -> Conn -> IP -> Unresolved). | Guardian service unavailability tolerance, malformed observation envelopes, loop prevention. | Medium |
| **Python Compatibility** | Legacy route delegation to canonical Rust capability. | Ensuring legacy routes cannot bypass Rust PermissionPolicy or protected PID guards. | High |
| **Brain / UI Independence** | Subsystem execution without Brain/UI. | Complete operational workflow (state mutations, telemetry, capability dispatch, event bus) with 0 Brain/UI runtime. | Critical |

---

## 4. Proposed N16 Validation Test Suites

To address all identified gaps and rigorously stress the implementation, the following targeted test suites will be constructed:

1. **`n16_state_concurrency_tests.rs`**:
   - 100 concurrent worker threads reading snapshots while multiple writers mutate nodes, devices, connections, and flows.
   - Monotonic revision regression guards and snapshot isolation integrity.
   - Stale reference elimination and entity removal guarantees.

2. **`n16_lifecycle_session_tests.rs`**:
   - Exhaustive invalid transition rejection matrix for `validate_transition()`.
   - Complex multi-session race conditions (A connects, B connects, B becomes authoritative, A callbacks fire, old responses discarded).
   - Session generation isolation on live and mock transports.

3. **`n16_transport_adversarial_tests.rs`**:
   - Adversarial framing: invalid magic, truncated headers, declared 16 MiB exceeding buffer, zero-length frames.
   - Hostile Noise payloads: corrupted ciphertext, invalid Poly1305 tags, truncated handshake steps.
   - TrustedPeerStore tampered keys, revoked peer attempts, and identity mismatch traps.

4. **`n16_admin_control_tests.rs`**:
   - Full authorization combinatorial matrix across all security tiers and caller contexts.
   - Forged context rejection (unauthorized caller claiming elevated privileges).
   - In-flight non-idempotent command failure without duplication (`Process.Terminate`).
   - Batch execution with mixed success/failure/timeout targets under bounded concurrency.

5. **`n16_system_validation_tests.rs`**:
   - Complete autonomous subsystem test with 0 Python Brain and 0 UI components.
   - EventBus extreme lag handling under 2,000 burst events.
   - Guardian security observation correlation precedence.
   - Repeated connect/disconnect/reconnect resource stability checks.
