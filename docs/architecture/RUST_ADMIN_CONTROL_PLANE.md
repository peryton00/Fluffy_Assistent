# Fluffy Desktop - Rust Admin Control Plane (Phase N13)

## Architectural Objective & Ownership

Phase N13 establishes the canonical, Rust-owned administrative control plane for Fluffy Desktop. It enables secure, structured execution of registered native capabilities across local and remote Fluffy cluster nodes without dependency on Python Brain for native administration.

```text
React / Tauri Network Workspace
        ↓
Tauri IPC / NetworkApi (contracts.rs)
        ↓
AdminCommandController (Rust Control Plane)
        ↓
PermissionPolicy (Authoritative Authorization)
        ↓
ClusterManager (Active Node & Transport Resolution)
        ↓
Compatibility Transport Session (TCP 9000 Framing)
        ↓
Remote Capability Dispatch (CapabilityRegistry)
        ↓
CapabilityResponse Envelope
        ↓
Admin Audit Logger (admin_actions.jsonl) + NetworkEventBus
        ↓
Network Workspace Store & Unified UI
```

Python Brain remains strictly a compatibility adapter for legacy REST consumers and is NOT the canonical transport.

---

## Critical Architectural Invariants

1. **NetworkState Authority**: `NetworkState` (`core/src/network/state.rs`) remains the single authoritative representation of network reality (Nodes, Devices, Connections, Interfaces, Traffic). It does not hold pending command queues, in-flight execution state, or admin audit histories.
2. **Capability Subsystem Reuse**: N13 reuses the canonical `CapabilityRegistry`, `CapabilityRequest`, `CapabilityResponse`, `SecurityTier`, and `PermissionDecision` domain models (`core/src/capabilities/` and `core/src/permissions/`). No parallel capability engine is introduced.
3. **Session Registry Reuse**: N13 reuses the existing `ClusterManager` and Terminal Mesh TCP sessions. No second socket or session registry is created.
4. **Transport Classification**: The TCP 9000 transport is explicitly classified as `transport_mode = legacy_compatibility` and `auth_mode = compatibility`. Cryptographic authentication and transport encryption are reserved for Phase N14.
5. **Zero Emojis**: All log messages, event summaries, error descriptions, and UI presentation strings adhere strictly to zero-emoji typography.

---

## 1. Typed Admin Contracts (`network/admin/types.rs`)

Administrative control plane contracts define explicit correlation, target attribution, capability payload, timeout, and caller context:

* **`CallerContext`**: Explicit caller classification:
  * `LocalUser { user_id, session_id, is_elevated }`
  * `RemoteNode { node_id, role, auth_state, transport_mode }`
  * `SystemInternal { subsystem }`
* **`AdminCommandRequest`**: Single-target command envelope containing `request_id`, `target_node_id`, `capability` (`CapabilityRequest`), `timeout_ms` (default 5000ms), and `confirmed` flag.
* **`AdminCommandResult`**: Typed execution result containing `request_id`, `target_node_id`, `capability_id`, `success`, `data`, `error` (`CapabilityError`), `execution_duration_ms`, and `timestamp_epoch_ms`.
* **`AdminBatchCommandRequest`**: Multi-target batch envelope containing `batch_id`, `target_node_ids`, `capability`, `timeout_ms`, and `confirmed`.
* **`AdminBatchCommandResult`**: Aggregated batch result containing `batch_id`, `total_targets`, `successful_targets`, `failed_targets`, `results`, and `total_duration_ms`.
* **`AdminAuditEntry`**: Operational audit record capturing timestamp, request correlation, target node, capability, caller classification, policy decision, execution duration, and structured error code.

---

## 2. Caller Context & Authorization (`permissions/policy.rs`)

Caller privileges are never trusted merely from client-supplied flags. Caller context is derived from authoritative local desktop session state or authenticated cluster node records.

### Authorization Flow
```text
Incoming Caller Identity
        ↓
Authoritative State Validation (CallerContext)
        ↓
evaluate_capability(caller, target_node, request)
        ↓
SecurityTier Matrix Evaluation
        ↓
PermissionDecision (Allow | RequireConfirmation | Deny)
```

### Authorization Baseline Behavior
| Caller Identity | ReadOnly | Safe | ConfirmationRequired | HighRisk | Blocked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Elevated / Admin** | Allow | Allow | RequireConfirmation | RequireConfirmation | Deny |
| **Local Standard User** | Allow | Allow | RequireConfirmation | Deny | Deny |
| **Worker / Peer Remote Node** | Allow | Deny | Deny | Deny | Deny |

### Target Invariants
- Target must exist in authoritative `NetworkState`.
- Target availability must be `Connected` (or `Available` for local host execution).
- Disconnected, pairing, authenticating, or unauthenticated remote targets are rejected before packet transmission (`TargetNotConnected` / `TargetUnauthenticated`).
- Protected system processes (PID <= 100) requested under `Process.Terminate` are rejected by policy invariant.

---

## 3. Remote Capability Transport (`terminal/protocol.rs` & `net.rs`)

Administrative capabilities are framed additively over the existing Terminal Mesh transport:

* **`AdminCapabilityInvoke`**: Sent from controller to client carrying `id: u64` and `request: CapabilityRequest`.
* **`ClientCapabilityResult`**: Sent from client back to controller carrying `id: u64` and `response: CapabilityResponse`.

### Correlation Mechanism
Responses are correlated through the pending response registry (`notify_remote_capability_response` / `notify_remote_capability_result_by_id`) using asynchronous Tokio oneshot channels with a 5000ms per-target timeout.

---

## 4. Single-Target Execution Lifecycle (`network/admin/controller.rs`)

1. **Request Validation**: Verify request correlation and parameters.
2. **Target Resolution**: Resolve target node from authoritative `NetworkState`.
3. **Availability Verification**: Confirm target availability is `Connected`.
4. **Policy Authorization**: Evaluate `evaluate_capability(&caller, target_node, &request.capability)`.
5. **Confirmation Enforcement**: If policy returns `RequireConfirmation` and `request.confirmed == false`, reject with structured `ConfirmationRequired` error.
6. **Execution Dispatch**:
   * *Local Node*: Dispatch directly to native `dispatch_capability(&request)`.
   * *Remote Node*: Frame `AdminCapabilityInvoke` and dispatch over active TCP session.
7. **Response Awaiting & Timeout**: Await correlated response with 5000ms deadline.
8. **Operational Audit**: Append structured `AdminAuditEntry` to `fluffy_data/audit/admin_actions.jsonl`.
9. **Event Emission**: Publish `AdminCommandDispatched`, `AdminCommandCompleted`, or `AdminCommandFailed` on `NetworkEventBus`.

---

## 5. Batch Execution Semantics

* **Independent Target Execution**: Failure, timeout, or permission denial on one target does not cancel or corrupt sibling target executions.
* **Bounded Concurrency**: Uses `tokio::sync::Semaphore(5)` to limit concurrent remote execution to at most 5 targets simultaneously.
* **Independent Authorization**: Policy is evaluated separately for each target node.
* **Result Aggregation**: Aggregates individual `AdminCommandResult` records into `AdminBatchCommandResult` reporting exact success/failure counts.

---

## 6. Operational Admin Audit (`network/admin/audit.rs`)

* **Log Location**: `fluffy_data/audit/admin_actions.jsonl` (append-only JSON Lines format).
* **Sensitive Data Redaction**: Passwords, private keys, authentication secrets, and raw credentials are never logged into audit entries.
* **Separation from Guardian**: Admin audit records operational administrative commands; Guardian's `audit.json` remains dedicated to security threat/anomaly analysis.

---

## 7. Network Event Bus Integration (`network/model.rs`)

The event system is extended under `EventCategory::Admin` with:
* `AdminCommandDispatched`
* `AdminCommandAuthorizationDenied`
* `AdminCommandCompleted`
* `AdminCommandFailed`
* `AdminBatchCompleted`

Events are ephemeral notifications carrying correlation IDs and execution summaries without embedding secrets or large payloads.

---

## 8. Supported Admin Capabilities (N13 Scope)

| Capability ID | Security Tier | Confirmation | Supported Platforms | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`System.GetHardware`** | ReadOnly | No | Windows, Linux, macOS | Query remote CPU, memory, OS, kernel, uptime |
| **`Process.List`** | ReadOnly | No | Windows, Linux, macOS | Query remote process table with PIDs, names, CPU/RAM |
| **`Process.Terminate`** | HighRisk | Yes (PID confirmation) | Windows, Linux, macOS | Terminate non-protected process by PID |
| **`Network.GetInterfaces`**| ReadOnly | No | Windows, Linux, macOS | Query remote network adapters and addresses |

*Note: System Reboot/Restart is explicitly deferred pending an approved native reboot contract.*
*Note: Node Disconnect operates via canonical `ClusterManager::disconnect_node` lifecycle.*

---

## 9. Python Compatibility Layer (`brain/routes/network_routes.py`)

* Legacy REST consumers invoking `/network/admin/action` route through safe validation boundaries.
* Direct unsafe `subprocess.run(["taskkill", ...])` is replaced with protected PID validation and safe execution paths.
* Python Brain is strictly an optional adapter and is NOT required for native desktop administration.

---

## 10. Security Boundary (N13 vs N14)

* **Phase N13 (Present)**: Establishes Rust-owned control plane, caller authorization context, permission policy enforcement, capability safety invariants, operational auditing, and lifecycle events over compatibility sessions (`transport_mode = legacy_compatibility`).
* **Phase N14 (Deferred)**: Production cryptographic hardening, including mutual TLS (mTLS), X.509 PKI certificates, AEAD authenticated encryption (ChaCha20-Poly1305), hardware TPM key anchoring, and cryptographic replay protection.
