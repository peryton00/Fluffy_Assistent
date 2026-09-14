# Phase N17: Production Hardening Audit

## Executive Summary

Phase **N17: Production Hardening Audit** is a read-only investigation of the Fluffy Network subsystem, following the completion of Phases N0 through N16.

The purpose of this audit is to assess the production readiness of the network architecture, cryptographic boundary, resource lifecycles, and operational limits across all platforms, with a focus on Windows desktop operation.

- **Overall Status**: **READY WITH HARDENING**
- **Total Findings**: 13 concrete findings
  - **P0 (Critical)**: 0
  - **P1 (High)**: 8 (Production Blockers)
  - **P2 (Medium)**: 5
  - **P3 (Low)**: 0
- **Primary Blockers Identified**:
  1. Private key storage at rest currently lacks OS-level DPAPI encryption and restricted file ACLs (`keys.rs:154`).
  2. Fallback development authentication token `"fluffy_dev_token"` present in local IPC/HTTP paths (`auth_utils.py:12`, `lib.rs:49`).
  3. TCP listener lacks connection concurrency bounds and handshake timeouts (Slowloris/DoS vulnerability in `net.rs:48, 70, 102`).
  4. Audit logs append without size rotation or file retention limits (`audit.rs:40-47`).
  5. Terminal output line buffers grow unbounded over continuous execution (`app_state.rs:117, 131`).
  6. Subsystem shutdown does not coordinate cancellation with the TCP listener (`subsystem.rs:138`, `net.rs:43`).
  7. Hardcoded relative working directory paths for audit logs (`audit.rs:16`).

---

## 1. Architecture Assessment

The architectural ownership boundaries established across N0–N16 remain strictly intact:

```text
Rust Network = authoritative network runtime
NetworkState = single authoritative in-memory state of network reality
ClusterManager = cluster lifecycle state machine
PermissionPolicy = authoritative access control and authorization boundary
CapabilityRegistry = local/remote capability dispatch and execution
Guardian = security analysis consuming network observations
Python Brain = intelligence and compatibility consumer
React/Tauri UI = presentation and inspection consumer
```

* **No State Duplication**: Neither the Python Brain nor the Tauri UI maintains a shadow network state store. All UI views derive state from detached `NetworkStateSnapshot` representations.
* **No Bypass Routes**: All remote administrative actions dispatched via `AdminCommandController` pass through `PermissionPolicy` and `CapabilityRegistry`.
* **Zero Plaintext Downgrade**: Paired cluster communication requires Noise XX with ChaCha20-Poly1305 and binary framing on TCP 9000.

---

## 2. Security Assessment

### 2.1 Static Private Key Storage
- **Current State**: `NodeKeypair::save_to_file` (`core/src/network/crypto/keys.rs:154`) writes the 64-byte key material (32-byte public key + 32-byte private key) as raw bytes to `%LOCALAPPDATA%\Fluffy\keys\node_identity.key` using standard Rust `fs::write`.
- **Finding [SEC-01 - P1]**: The private key is unencrypted at rest and written with default inherited filesystem permissions.
- **Classification**: **NEEDS HARDENING**. Production deployment on Windows requires encrypting the key file using Windows DPAPI (`CryptProtectData`) and setting restricted user-only DACLs. On Unix platforms, POSIX file permissions must be restricted to `0600`.

### 2.2 Pairing and Trust Management
- **Verification**: `TrustedPeerStore` (`core/src/network/crypto/trusted.rs:116`) evaluates presented public keys against bound `NodeId` records. Mismatched keys return `TrustEvaluation::IdentityMismatch` and revoked nodes return `TrustEvaluation::Revoked`, which unconditionally drop the connection.
- **SAS Verification**: Mutual 6-digit Short Authentication Strings (`keys.rs:168`) are order-invariant and deterministic.

### 2.3 IPC and Local Endpoint Tokens
- **Finding [SEC-02 - P1]**: `FLUFFY_TOKEN` defaults to `"fluffy_dev_token"` in `ui/tauri/src-tauri/src/lib.rs:49`, `brain/security/auth_utils.py:12`, and `fluffy/network/server.py:18`.
- **Classification**: **HIGH RISK**. If `.env` is omitted in release packaging, any unprivileged local process can authenticate to the local Python REST API.
- **Required Fix**: Generate a cryptographically random session token at startup if not provided via environment variable.

### 2.4 Transport Tamper Resistance
- **Verification**: Frame framing enforces `FRAME_MAGIC = [0x46, 0x4C]` (`framing.rs:5`). Payload length is validated `<= 16 MiB` before buffer allocation (`framing.rs:103`). Tampered ciphertext fails ChaCha20-Poly1305 MAC tag verification immediately (`session.rs:112`).

---

## 3. Reliability & Lifecycle Assessment

### 3.1 Connection Timeouts & Anti-DoS
- **Finding [SEC-03 - P1]**: In `core/src/terminal/net.rs:70` and `net.rs:102`, `stream.peek` and `perform_noise_handshake_responder` await input without an explicit Tokio timeout.
- **Risk**: An unauthenticated client opening a TCP connection and sending no data will hold the socket open indefinitely.
- **Required Fix**: Wrap initial peek and Noise handshake in `tokio::time::timeout(Duration::from_secs(10), ...)`.

### 3.2 Subsystem Shutdown Coordination
- **Finding [REL-01 - P1]**: `NetworkSubsystem::stop` (`core/src/network/subsystem.rs:138`) cancels the heartbeat sweeper task, but does not abort the background `TcpListener` loop or active client session tasks in `core/src/terminal/net.rs:43`.
- **Required Fix**: Integrate a `CancellationToken` into `NetworkSubsystem` that signals the TCP listener and active connection loops during shutdown.

### 3.3 Reconnect Storm & Backoff
- **Verification**: Reconnection logic in `ClusterManager` applies exponential backoff starting at 1s, doubling up to a 60s cap with 10% random jitter (`manager.rs:420`), preventing thundering herd reconnect storms.

---

## 4. Performance Assessment

### 4.1 Measured Performance (N16 Benchmark)
- **NetworkState Concurrency**: 100 concurrent reader threads and 8 writer threads mutating state simultaneously completed in 12.58s with zero lock contention deadlocks, zero panics, and 100% monotonic revision integrity (`n16_state_concurrency_tests.rs`).
- **EventBus Burst**: 1,500 high-frequency events emitted instantaneously through the 1,024-capacity ring buffer completed in 0.01s, with slow subscriber lag accounted for and subscriber recovery verified (`n16_system_validation_tests.rs`).
- **Batch Command Dispatch**: 3-node batch execution with bounded semaphore concurrency completed in 0.04s (`n16_admin_control_tests.rs`).

### 4.2 Inferred Hotspots & Allocations
- **Snapshot Cloning**: `NetworkState::get_snapshot` clones hash maps of nodes, devices, connections, and interfaces. For networks with < 500 entities, memory overhead is negligible (< 100 KB per snapshot). If scaling beyond 5,000 devices, structural sharing (e.g. `im::HashMap` or persistent data structures) should be considered in post-N17 milestones.
- **Lock Contention**: `SharedNetworkState` uses `Arc<RwLock<NetworkState>>`. Readers acquire read locks without contention; write transactions are short (< 1ms).

---

## 5. Resource Assessment & Limits

| Resource | Current Limit | Enforcement Location | Risk / Status |
| :--- | :--- | :--- | :--- |
| **Frame Payload Size** | 16 MiB (16,777,216 bytes) | `framing.rs:103` (`MAX_FRAME_SIZE`) | **BOUNDED** |
| **Event Ring Buffer** | 1,024 events | `event.rs:16` (`DEFAULT_EVENT_BUFFER_CAPACITY`) | **BOUNDED** |
| **Audit Log In-Memory** | 1,000 entries | `audit.rs:51` | **BOUNDED** |
| **Audit Log Disk File** | Unbounded | `audit.rs:40` | **UNBOUNDED [RES-03 - P1]** |
| **Terminal Output Lines** | Unbounded | `app_state.rs:117` | **UNBOUNDED [RES-02 - P1]** |
| **TCP Concurrent Sockets** | Unbounded | `net.rs:48` | **UNBOUNDED [RES-01 - P1]** |
| **Session RequestId Cache**| Unbounded | `session.rs:55` | **UNBOUNDED [RES-04 - P2]** |
| **Discovered Device Map** | Unbounded (no TTL prune) | `telemetry.rs:232` | **UNBOUNDED [RES-05 - P2]** |
| **Batch Concurrency** | 5 parallel tasks | `controller.rs:539` (`Semaphore::new(5)`) | **BOUNDED** |

---

## 6. Windows Production Environment Assessment

1. **Working Directory & Storage Paths**:
   - `AdminAuditLogger` hardcodes `"fluffy_data/audit/admin_actions.jsonl"`. In a packaged Windows application installed to `C:\Program Files\Fluffy\`, write access to the installation directory is denied by Windows UAC.
   - **Fix [WIN-01 - P1]**: Route all data and log writes to `%LOCALAPPDATA%\Fluffy\` using `dirs::data_local_dir()`.
2. **Native Win32 FFI**:
   - `core/src/network/discovery.rs` (GetIpNetTable) and `core/src/network/flows.rs` (GetExtendedTcpTable) query Windows IP Helper API (`iphlpapi.dll`) directly without invoking shell commands.
   - **Recommendation [WIN-02 - P2]**: Add explicit row bounds guards before indexing into variable-length C FFI buffers.
3. **Wi-Fi Metadata Extraction**:
   - `core/src/network/wifi.rs` extracts only SSID, authentication, and encryption metadata from Windows XML profiles, never extracting stored Wi-Fi passwords (`keyMaterial`).

---

## 7. Privacy Assessment

- **Data Retained**: IP addresses, MAC addresses, hostnames, active socket flow ports, process names, and system PIDs.
- **Exclusion of Secrets**: Key material, passwords, environment secrets, and terminal credentials are never logged or stored in `NetworkState`.
- **Diagnostics Display**: The UI displays MAC addresses and IP addresses strictly for local network topology inspection.

---

## 8. Answers to the 25 Explicit N17 Audit Questions

1. **Can an unauthenticated network peer consume unbounded memory?**
   - **Partially**. Binary framing validates payload size `<= 16 MiB` before buffer allocation (`core/src/network/transport/framing.rs:103`), preventing gigabyte payload allocation. However, `TcpListener::accept` in `core/src/terminal/net.rs:48` spawns an unbounded number of tasks for incoming sockets without a global connection semaphore, which can exhaust memory if flooded with thousands of concurrent connections.
2. **Can an authenticated peer consume unbounded resources?**
   - **Yes**. An authenticated peer sending millions of requests will continuously expand `SecureSession::seen_request_ids` (`core/src/network/transport/session.rs:55`) and `AppState::output_lines` (`core/src/terminal/app_state.rs:117`), which lack eviction bounds.
3. **Can a remote peer cause an unbounded number of tasks?**
   - **Yes**. Each inbound TCP connection spawns a dedicated Tokio task in `core/src/terminal/net.rs:48` without task pool throttling.
4. **Can event history grow without bound?**
   - **No**. `NetworkEventBus` uses `tokio::sync::broadcast` with a bounded ring buffer of 1,024 events (`core/src/network/event.rs:16`).
5. **Can audit logs grow without bound?**
   - **Yes**. `AdminAuditLogger` (`core/src/network/admin/audit.rs:40-47`) continuously appends to `admin_actions.jsonl` without size rotation or retention limits.
6. **Can reconnect behavior create a storm?**
   - **No**. Reconnection applies exponential backoff (1s to 60s max) with 10% random jitter (`core/src/network/cluster/manager.rs:420`).
7. **Can a stale session mutate current NetworkState?**
   - **No**. Session removal validates session ID and authoritative ownership (`core/src/terminal/app_state.rs:188`).
8. **Can a stale command execute after session replacement?**
   - **No**. In-flight commands are failed immediately upon session disconnect or replacement via `fail_pending_for_tag` (`core/src/network/admin/controller.rs:59`).
9. **Can plaintext fallback occur anywhere?**
   - **No**. Paired nodes require `FRAME_MAGIC` and Noise XX handshake; missing frames or failed handshakes immediately close the connection (`core/src/terminal/net.rs:75-80`).
10. **Can a revoked peer reconnect?**
    - **No**. `TrustedPeerStore::evaluate_peer` returns `TrustEvaluation::Revoked` (`core/src/network/crypto/trusted.rs:120`), and `net.rs:180` closes the socket.
11. **Can a mismatched key impersonate a NodeId?**
    - **No**. Key mismatches are detected and rejected with `TrustEvaluation::IdentityMismatch` (`core/src/network/crypto/trusted.rs:129`).
12. **Can frontend fields forge privilege?**
    - **No**. `evaluate_capability` in `core/src/permissions/policy.rs:124` derives authorization strictly from backend `CallerContext`, ignoring client-side confirmation flags.
13. **Can Python bypass Rust authorization?**
    - **No**. Legacy compatibility routes are restricted in `core/src/permissions/policy.rs:170` to ReadOnly/Safe operations and cannot execute mutating commands.
14. **Can a remote operation bypass CapabilityRegistry?**
    - **No**. All capability execution is routed through `CapabilityRegistry::dispatch_capability` (`core/src/network/admin/controller.rs:360`).
15. **Can Process.Terminate be retried automatically?**
    - **No**. Non-idempotent operations enforce non-retry semantics (`core/tests/n15_reliability_tests.rs:120`).
16. **Can shutdown leave background tasks running?**
    - **Yes**. `NetworkSubsystem::stop` (`core/src/network/subsystem.rs:138`) stops the heartbeat sweeper, but does not signal or cancel the background `TcpListener` in `core/src/terminal/net.rs:43`.
17. **Can shutdown leave sockets open?**
    - **Yes**. If `NetworkSubsystem` is stopped without terminating the OS process, the TCP listener on port 9000 remains open.
18. **Can NetworkState grow without bound?**
    - **Partially**. Flows are reconciled and closed flows are removed on poll (`core/src/network/telemetry.rs:394`), but neighbor devices in `poll_devices` (`telemetry.rs:232`) are upserted without TTL aging.
19. **Can malformed frames panic the process?**
    - **No**. Malformed frame headers, magic mismatches, oversized lengths, and corrupt ciphertexts return structured error enums (`core/tests/n16_transport_adversarial_tests.rs`).
20. **Are private keys protected adequately for production?**
    - **No**. `NodeKeypair::save_to_file` (`core/src/network/crypto/keys.rs:154`) writes raw 32-byte private keys in plaintext without DPAPI encryption or restricted ACLs.
21. **Are development credentials or tokens present?**
    - **Yes**. Hardcoded default fallback `"fluffy_dev_token"` exists in `ui/tauri/src-tauri/src/lib.rs:49` and `brain/security/auth_utils.py:12`.
22. **Are sensitive values logged?**
    - **No for keys/credentials**. `NodeKeypair` debug formatting redacts private keys (`keys.rs:67`). Process names, PIDs, and network IPs are logged for audit purposes.
23. **Is the Windows release path safe?**
    - **Needs Hardening**. Relative working directory paths (`"fluffy_data/audit/admin_actions.jsonl"`) must be resolved to `%LOCALAPPDATA%\Fluffy\`.
24. **Are production configuration values bounded?**
    - Ports and timeouts are bounded by `NetworkTransportConfig::validate` (`core/src/network/config.rs:50`), but audit file limits and max connection counts are not yet configurable.
25. **Can an operator diagnose network failures?**
    - **Partially**. Diagnostic details are emitted as structured events and audit records, but atomic telemetry counters (e.g. handshake failure counts, active session counts) are not yet exposed via a unified metrics interface.

---

## 9. Production Readiness Scorecard

| Category | Status | Evidence | Blocking? |
| :--- | :--- | :--- | :--- |
| **Security (Transport & Handshake)** | **READY** | Noise XX, zero plaintext downgrade, ChaCha20-Poly1305 verified | No |
| **Security (Key Storage at Rest)** | **NOT READY** | Plaintext key file without DPAPI or POSIX `0600` permissions (`keys.rs:154`) | **Yes (P1)** |
| **Authentication & Tokens** | **NOT READY** | Fallback `"fluffy_dev_token"` present in IPC paths (`lib.rs:49`, `auth_utils.py:12`) | **Yes (P1)** |
| **Authorization Boundary** | **READY** | Authoritative `PermissionPolicy` and protected PIDs enforced | No |
| **Resource Limits (TCP & Anti-DoS)**| **NOT READY** | Listener lacks max connection bound and handshake read timeout (`net.rs:48, 70`) | **Yes (P1)** |
| **Memory Lifecycle** | **NOT READY** | `AppState.output_lines` grows unbounded during continuous execution (`app_state.rs:117`)| **Yes (P1)** |
| **Audit Logging & Disk Retention** | **NOT READY** | `admin_actions.jsonl` appends without file rotation or size bounds (`audit.rs:40`) | **Yes (P1)** |
| **Subsystem Lifecycle (Shutdown)** | **NOT READY** | `NetworkSubsystem::stop` does not signal `TcpListener` cancellation (`net.rs:43`) | **Yes (P1)** |
| **Windows Path Resolution** | **NOT READY** | Hardcoded relative audit file path fails under standard install locations (`audit.rs:16`) | **Yes (P1)** |
| **Performance & Concurrency** | **READY** | 100 parallel readers / 8 writers tested without deadlocks or corruption | No |
| **Observability** | **READY WITH HARDENING** | Event bus and audit logs functional; atomic diagnostics counters recommended | No |
| **Architecture Boundaries** | **READY** | Rust owns runtime state; Python and UI strictly consume | No |

---

## 10. Recommended N17 Implementation Order

When authorized for implementation, the hardening tasks should be executed in the following order:

1. **Phase N17.1: Cryptographic & Token Hardening**
   - Implement DPAPI key encryption on Windows and POSIX `0600` on Unix ([SEC-01]).
   - Replace default fallback `"fluffy_dev_token"` with dynamic cryptographic startup tokens ([SEC-02]).
2. **Phase N17.2: Transport Anti-DoS & Connection Limits**
   - Add handshake and peek read timeouts on incoming TCP sockets ([SEC-03]).
   - Enforce global connection semaphore on TCP listener ([RES-01]).
   - Wire TCP listener cancellation to `NetworkSubsystem::stop` ([REL-01]).
3. **Phase N17.3: Memory & Disk Lifecycle Hardening**
   - Implement audit log size-based rotation and retention policy ([RES-03]).
   - Bound terminal output line buffers in `AppState` ([RES-02]).
   - Resolve all storage and audit paths to `%LOCALAPPDATA%\Fluffy\` ([WIN-01]).
4. **Phase N17.4: Long-Running Robustness & Diagnostics**
   - Add sliding window bound to `SecureSession::seen_request_ids` ([RES-04]).
   - Add TTL pruning to inactive discovered neighbor devices in `NetworkState` ([RES-05]).
   - Expose atomic diagnostics metrics struct ([OBS-01]).

---

## 11. Final Assessment

```text
N17 AUDIT COMPLETE
PRODUCTION CODE MODIFIED: NO
TEST CODE MODIFIED: NO
AUDIT ARTIFACTS CREATED: YES
N17 STATUS: READY WITH HARDENING
```
