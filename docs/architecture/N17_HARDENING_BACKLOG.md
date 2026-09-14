# Phase N17: Production Hardening Backlog

This backlog records all concrete production hardening items discovered during the N17 audit, categorized by functional area and prioritized by severity.

---

## Severity Definitions

- **P0 (Critical)**: Immediate security or stability blocker preventing production deployment.
- **P1 (High)**: Major resilience, resource limit, or security hardening item required before public release.
- **P2 (Medium)**: Operational, observability, or robustness enhancement.
- **P3 (Low)**: Maintainability, documentation, or non-blocking cleanup.
- **INFO**: Architectural observation for future milestones.

---

## 1. Security Hardening

### [SEC-01] [P1] Encrypt Static Private Keys at Rest and Enforce Restricted File ACLs
- **Area**: Cryptography / Key Management
- **Status**: **FIXED**
- **Resolution**: Implemented OS-backed Windows DPAPI encryption (`CryptProtectData` / `CryptUnprotectData` with `CRYPTPROTECT_UI_FORBIDDEN`) and Unix `0600` permissions. Introduced versioned `FLKEY\x01` binary envelope format with transparent legacy migration and atomic write replacement in `core/src/network/crypto/keys.rs`.
- **Evidence**: `test_protected_envelope_roundtrip_and_no_plaintext`, `test_legacy_plaintext_key_migration`, `test_corrupted_key_fails_closed`.

### [SEC-02] [P1] Eliminate Default Fallback Development Authentication Token
- **Area**: IPC / Authentication
- **Status**: **FIXED**
- **Resolution**: Eliminated hardcoded `"fluffy_dev_token"` fallback across `lib.rs`, `auth_utils.py`, `listener.py`, `server.py`, and `client.py`. Replaced with dynamic 256-bit entropy startup generation and timing-safe comparison (`hmac.compare_digest`).
- **Evidence**: `test_auth_utils_dynamic_token_and_no_hardcoded_fallback`.

### [SEC-03] [P1] Add Noise Handshake and Connection Peek Timeout
- **Area**: Transport / Anti-DoS
- **Status**: **FIXED**
- **Resolution**: Wrapped unauthenticated protocol peeking, Noise XX responder handshake, initial frame reading, and legacy handshake reading in bounded 10-second `tokio::time::timeout(TCP_HANDSHAKE_TIMEOUT, ...)` in `core/src/terminal/net.rs`.
- **Evidence**: `test_sec03_handshake_timeout_constants_and_configuration`, `test_sec03_stalled_connection_timeout_handling`, `test_sec03_fast_handshake_succeeds_within_timeout`.

---

## 2. Resource Management & Limits

### [RES-01] [P1] Enforce Maximum Concurrent TCP Connections on Listener
- **Area**: Transport / Resource Limits
- **Status**: **FIXED**
- **Resolution**: Enforced connection semaphore bound (`MAX_CONCURRENT_TCP_CONNECTIONS = 128`) on incoming TCP port 9000 sessions in `core/src/terminal/net.rs`. Excess connections are cleanly rejected without spawning unbounded worker tasks.
- **Evidence**: `test_res01_semaphore_capacity_and_rejection`.

### [RES-02] [P1] Bound Terminal Output Lines in AppState
- **Area**: Memory Lifecycle
- **Status**: **FIXED**
- **Resolution**: Capped `output_lines` and `client_output` to `MAX_TERMINAL_OUTPUT_LINES = 2000` entries and `command_history` to `MAX_COMMAND_HISTORY_ENTRIES = 500` entries with automatic FIFO eviction in `core/src/terminal/app_state.rs`.
- **Evidence**: `test_res02_terminal_output_buffers_bounded_at_capacity`.

### [RES-03] [P1] Implement Audit Log File Size Rotation and Retention Policy
- **Area**: Logging / Disk Management
- **Status**: **FIXED**
- **Resolution**: Implemented size-based rotation (`DEFAULT_MAX_AUDIT_LOG_BYTES = 10 MB`) and bounded archive retention (`DEFAULT_MAX_ROTATED_FILES = 5`) in `core/src/network/admin/audit.rs`.
- **Evidence**: `test_res03_audit_log_rotation_and_bounded_retention`.

### [RES-04] [P2] Bound RequestId Cache in SecureSession
- **Area**: Cryptography / Memory Lifecycle
- **Status**: **FIXED**
- **Resolution**: Implemented sliding-window FIFO replay cache with `DEFAULT_MAX_SEEN_REQUEST_IDS = 10_000` capacity in `core/src/network/transport/session.rs`.
- **Evidence**: `test_res04_bounded_replay_cache_sliding_window`.

### [RES-05] [P2] Add Inactive Discovered Device Aging / TTL Pruning
- **Area**: State / Discovery
- **Status**: **FIXED**
- **Resolution**: Implemented `NetworkState::prune_stale_devices` with 24-hour TTL, preserving local self host, verified cluster nodes, and active default gateways in `core/src/network/state.rs`.
- **Evidence**: `test_res05_device_pruning_and_invariance`.

---

## 3. Reliability & Lifecycle

### [REL-01] [P1] Wire TCP Listener and Client Tasks to Subsystem Shutdown
- **Area**: Subsystem Lifecycle
- **Status**: **FIXED**
- **Resolution**: Added `shutdown_tx` broadcast coordination in `NetworkSubsystem` (`core/src/network/subsystem.rs`) wired directly into `start_server_with_shutdown` in `core/src/terminal/net.rs`. Calling `subsystem.stop()` promptly exits the TCP accept loop and terminates background tasks.
- **Evidence**: `test_rel01_subsystem_shutdown_and_restart_lifecycle`.

### [REL-02] [P2] Add Global Pending Admin Response Capacity Bound
- **Area**: Admin Control Plane
- **Status**: **FIXED**
- **Resolution**: Bounded `PENDING_RESPONSES` map to `MAX_PENDING_ADMIN_RESPONSES = 1000` concurrent entries, rejecting overflows with `system_busy` error in `core/src/network/admin/controller.rs`.
- **Evidence**: Compile-checked and verified in admin controller dispatch flow.

---

## 4. Windows Production Packaging & Configuration

### [WIN-01] [P1] Resolve Absolute AppData Directories for Audit and Data Files
- **Area**: Windows Production Environment
- **Status**: **FIXED**
- **Resolution**: Anchored default audit and storage paths to `%LOCALAPPDATA%\Fluffy\` via `default_data_dir()` and `default_audit_log_path()` in `core/src/network/config.rs`.
- **Evidence**: `test_win01_canonical_data_path_resolution`.

---

## 5. Observability & Telemetry

### [OBS-01] [P2] Expose Diagnostic Connection Counters and Error Metrics
- **Area**: Observability
- **Status**: **FIXED**
- **Resolution**: Implemented thread-safe lock-free atomic counters in `NetworkDiagnostics` (`core/src/network/diagnostics.rs`) tracking accepted/rejected connections, handshake timeouts, auth failures, reconnects, commands, and frames dropped.
- **Evidence**: `test_obs01_diagnostics_counters_concurrent_increments`.

---

## 6. Backlog Summary & Implementation Status

| ID | Priority | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **P1** | Security | Encrypt static private keys at rest (DPAPI/POSIX ACLs) | **FIXED** |
| **SEC-02** | **P1** | Security | Eliminate default fallback `"fluffy_dev_token"` | **FIXED** |
| **SEC-03** | **P1** | Security | Add handshake and peek read timeouts (Anti-Slowloris) | **FIXED** |
| **RES-01** | **P1** | Limits | Enforce maximum concurrent TCP connections on port 9000 | **FIXED** |
| **RES-02** | **P1** | Memory | Bound terminal output line buffers in AppState | **FIXED** |
| **RES-03** | **P1** | Disk | Implement audit log file size rotation and retention | **FIXED** |
| **REL-01** | **P1** | Lifecycle | Wire TCP listener and client tasks to Subsystem shutdown | **FIXED** |
| **WIN-01** | **P1** | Windows | Anchor audit logs and data paths to LocalAppData | **FIXED** |
| **RES-04** | **P2** | Memory | Bound RequestId cache in SecureSession | **FIXED** |
| **RES-05** | **P2** | State | Add inactive discovered device aging/pruning | **FIXED** |
| **REL-02** | **P2** | Admin | Add global pending response table limit | **FIXED** |
| **OBS-01** | **P2** | Observability | Expose diagnostic atomic counters for cluster telemetry | **FIXED** |
