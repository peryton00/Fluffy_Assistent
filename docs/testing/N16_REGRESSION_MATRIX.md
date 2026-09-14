# Phase N16: Architectural Invariants & Regression Matrix

This document maps the authoritative architectural invariants established across Phases N0 through N15 to their concrete test suites and verification results.

---

## 1. Architectural Invariants Matrix

| Invariant | Description | Concrete Test Suite | Status |
| :--- | :--- | :--- | :--- |
| **Rust owns Network runtime state** | NetworkState in Rust is the sole authoritative state of network reality. Python Brain and Tauri UI are non-authoritative consumers. | `fluffy_core::network::state::tests`, `n15_reliability_tests::test_network_subsystem_full_operation_without_python_brain_or_ui` | **VERIFIED** |
| **NetworkState is authoritative & monotonic** | State revisions are monotonic integers; no-op updates do not bump revision; detached coherent snapshots prevent lock contention. | `n16_state_concurrency_tests::test_concurrent_readers_and_writers_monotonic_revision_integrity`, `n16_state_concurrency_tests::test_no_revision_churn_on_identical_state_upserts` | **VERIFIED** |
| **NodeId is logical identity** | Logical Fluffy node identity is anchored to `NodeId`; transport cryptographic public keys are bound to NodeId via pairing. | `n14_security_transport_tests::test_trusted_peer_store_and_mismatch_detection`, `n16_transport_adversarial_tests::test_trusted_peer_store_adversarial_identity_mismatch_and_revocation` | **VERIFIED** |
| **Lifecycle cannot bypass authentication** | State machine strictly enforces onboarding path: `Available -> Pairing -> Authenticating -> Connected`. Direct jumps to `Connected` are rejected. | `n16_lifecycle_session_tests::test_exhaustive_valid_lifecycle_transitions`, `n16_lifecycle_session_tests::test_exhaustive_invalid_lifecycle_transitions_rejected` | **VERIFIED** |
| **No fabricated entities** | Topology and discovery strictly derive from verified physical adapters, ARP tables, or active sockets; no speculative nodes/edges. | `fluffy_core::network::telemetry::tests::test_device_discovery_stable_mac_and_ephemeral_identity`, `ui/tauri: topologyModel.test.ts` | **VERIFIED** |
| **Event/State consistency** | Events emitted on `NetworkEventBus` carry monotonically increasing sequences and correspond to authoritative `NetworkState` mutations. | `n16_system_validation_tests::test_event_bus_extreme_burst_lag_and_subscriber_isolation`, `n16_system_validation_tests::test_guardian_security_observation_correlation_precedence` | **VERIFIED** |
| **Secure transport required** | Remote cluster communication between paired nodes requires Noise XX encrypted and authenticated binary framing. | `n14_security_transport_tests::test_noise_xx_handshake_and_tamper_rejection`, `n14_security_transport_tests::test_real_tcp_socket_secure_process_list_and_terminate_lifecycle` | **VERIFIED** |
| **Zero plaintext fallback / downgrade** | Secure-capable nodes attempting plaintext communication or downgrading upon reconnect failure are unconditionally dropped. | `n14_security_transport_tests::test_real_tcp_downgrade_prevention_rejection`, `n15_reliability_tests::test_real_tcp_live_reconnect_and_state_recovery_lifecycle` | **VERIFIED** |
| **TrustedPeerStore enforced** | Remote public keys presented during Noise XX handshake are validated against `TrustedPeerStore`; mismatched or revoked keys fail immediately. | `n14_security_transport_tests::test_real_tcp_revoked_and_identity_mismatch_rejection`, `n16_transport_adversarial_tests::test_trusted_peer_store_adversarial_identity_mismatch_and_revocation` | **VERIFIED** |
| **Fresh session keys** | Every new TCP connection performs a complete Noise XX cryptographic handshake generating fresh ephemeral symmetric cipher keys. | `n14_security_transport_tests::test_noise_xx_handshake_and_tamper_rejection`, `n15_reliability_tests::test_real_tcp_live_reconnect_and_state_recovery_lifecycle` | **VERIFIED** |
| **Stale session isolation** | Out-of-order disconnect callbacks, stale heartbeats, or delayed responses from superseded sessions cannot mutate active session authority. | `n15_reliability_tests::test_duplicate_session_supersession_and_stale_disconnect_immunity`, `n16_lifecycle_session_tests::test_interleaved_session_races_and_supersession_integrity` | **VERIFIED** |
| **PermissionPolicy authoritative** | Access control is enforced solely in Rust backend `PermissionPolicy`. Frontend flags (`confirmed=true`, `elevated=true`) cannot bypass backend policy. | `n14_security_transport_tests::test_frontend_confirmed_flag_cannot_bypass_backend_denial`, `n16_admin_control_tests::test_authorization_matrix_all_security_tiers_against_caller_roles` | **VERIFIED** |
| **Protected PID enforcement** | Critical system PIDs (< 100 on Unix, 0/1/4 on Windows) are unconditionally denied termination across all privilege levels and roles. | `fluffy_core::permissions::policy::tests::test_evaluate_protected_pid_rejection`, `n16_admin_control_tests::test_protected_pid_denial_invariance` | **VERIFIED** |
| **Process.Terminate confirmation** | Mutating process termination belongs to `SecurityTier::ConfirmationRequired` and requires authenticated user confirmation. | `n16_admin_control_tests::test_authorization_matrix_all_security_tiers_against_caller_roles`, `n14_security_transport_tests::test_policy_remote_legacy_vs_secure_process_terminate` | **VERIFIED** |
| **No destructive command retry** | Non-idempotent administrative operations (`Process.Terminate`, destructive actions) are never automatically retried on transport disconnect. | `n15_reliability_tests::test_process_terminate_is_never_automatically_retried_on_disconnect` | **VERIFIED** |
| **Heartbeat timeout & recovery** | Heartbeat ticks maintain liveness; missed thresholds transition nodes to `Disconnected` without infinite reconnection loops. | `n15_reliability_tests::test_heartbeat_timeout_transitions_connected_to_disconnected`, `n15_reliability_tests::test_heartbeat_recovers_recovering_node` | **VERIFIED** |
| **Bounded exponential backoff** | Failed reconnects apply jittered exponential backoff capped at 60s, resetting upon successful cryptographic handshake. | `n15_reliability_tests::test_reconnect_backoff_bounds_and_reset` | **VERIFIED** |
| **Duplicate session supersession** | When a node reconnects with a fresh socket, the new session becomes authoritative immediately and cleans up pending old commands. | `n15_reliability_tests::test_duplicate_session_supersession_and_stale_disconnect_immunity`, `n16_lifecycle_session_tests::test_interleaved_session_races_and_supersession_integrity` | **VERIFIED** |
| **Python Brain independence** | Rust Network subsystem operates fully and securely even if Python Brain process is crashed, unreachable, or uninstalled. | `n15_reliability_tests::test_network_subsystem_full_operation_without_python_brain_or_ui` | **VERIFIED** |
| **UI independence** | Network subsystem runs headlessly without Tauri UI or webview runtime dependency. | `n15_reliability_tests::test_network_subsystem_full_operation_without_python_brain_or_ui`, `cargo test --all-targets` | **VERIFIED** |
| **Guardian security engine correlation** | Security observations from Guardian correlate via explicit precedence: 1. MAC, 2. Socket Flow, 3. Device IP, 4. Unresolved fallback. | `n16_system_validation_tests::test_guardian_security_observation_correlation_precedence` | **VERIFIED** |
| **Binary framing bounds checking** | Declared payload lengths are validated against 16 MiB max limit BEFORE buffer allocation to prevent memory exhaustion DoS. | `n14_security_transport_tests::test_framing_oversized_frame_rejected_before_buffer_allocation`, `n16_transport_adversarial_tests::test_adversarial_framing_oversized_payload_rejected_before_buffer_allocation` | **VERIFIED** |
| **Batch command target isolation** | Batch execution guarantees per-target authorization, bounded concurrency, and failure isolation across targets. | `n16_admin_control_tests::test_batch_execution_independent_isolation_and_concurrency` | **VERIFIED** |

---

## 2. Regression Test Coverage Breakdown

- **Total Rust Tests Executed**: 220 tests (165 core unit, 11 binary, 17 N14 security, 10 N15 reliability, 17 N16 validation).
- **Total Frontend Tests Executed**: 323 vitest unit/integration tests across 47 suites.
- **Failures / Regressions**: 0.
- **All 23 Architectural Invariants Verified**: Yes.
