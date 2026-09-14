use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{oneshot, Mutex, Semaphore};
use once_cell::sync::Lazy;

use crate::capabilities::dispatch_capability;
use crate::capabilities::types::{CapabilityError, CapabilityRequest, CapabilityResponse};
use crate::network::admin::audit::{global_admin_audit_logger, AdminAuditLogger};
use crate::network::admin::types::{
    AdminAuditEntry, AdminBatchCommandRequest, AdminBatchCommandResult, AdminCommandRequest,
    AdminCommandResult, CallerContext,
};
use crate::network::error::NetworkResult;
use crate::network::event::NetworkEventBus;
use crate::network::ids::{NodeId, RequestId};
use crate::network::model::{
    EventCategory, EventSeverity, NetworkEvent, NetworkEventType, NodeAvailability,
};
use crate::network::state::SharedNetworkState;
use crate::permissions::decision::PermissionDecision;
use crate::permissions::policy::evaluate_capability;

type ResponseSender = oneshot::Sender<CapabilityResponse>;

struct PendingEntry {
    sender: ResponseSender,
    target_tag: Option<String>,
    target_node_id: Option<String>,
}

/// Maximum concurrent in-flight pending remote admin capability responses (REL-02)
pub const MAX_PENDING_ADMIN_RESPONSES: usize = 1000;

/// Central pending remote capability response registry
static PENDING_RESPONSES: Lazy<Mutex<HashMap<String, PendingEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Complete a pending remote capability response by correlation key (request_id)
pub async fn notify_remote_capability_response(request_id: &str, response: CapabilityResponse) -> bool {
    let mut pending = PENDING_RESPONSES.lock().await;
    if let Some(entry) = pending.remove(request_id) {
        let _ = entry.sender.send(response);
        true
    } else {
        false
    }
}

/// Complete a pending remote capability response by numeric command id (e.g. from TCP terminal framing)
pub async fn notify_remote_capability_result_by_id(cmd_id: u64, response: CapabilityResponse) -> bool {
    // 1. Try matching by request_id from response envelope
    if let Some(ref req_id) = response.request_id {
        if notify_remote_capability_response(req_id, response.clone()).await {
            return true;
        }
    }
    // 2. Fall back to numeric id key
    notify_remote_capability_response(&cmd_id.to_string(), response).await
}

/// Fail in-flight pending capability requests for a specific terminal client tag immediately (e.g. on disconnect)
pub async fn fail_pending_for_tag(tag: &str, reason: &str) -> usize {
    let mut pending = PENDING_RESPONSES.lock().await;
    let matching_keys: Vec<String> = pending
        .iter()
        .filter(|(_, entry)| entry.target_tag.as_deref() == Some(tag))
        .map(|(k, _)| k.clone())
        .collect();

    let count = matching_keys.len();
    for key in matching_keys {
        if let Some(entry) = pending.remove(&key) {
            let err_resp = CapabilityResponse::err(
                Some(key),
                CapabilityError::new(
                    "session_dropped",
                    format!("Transport session [{}] disconnected: {}", tag, reason),
                ),
            );
            let _ = entry.sender.send(err_resp);
        }
    }
    count
}

/// Fail in-flight pending capability requests for a specific node_id immediately
pub async fn fail_pending_for_node(node_id: &str, reason: &str) -> usize {
    let mut pending = PENDING_RESPONSES.lock().await;
    let matching_keys: Vec<String> = pending
        .iter()
        .filter(|(_, entry)| entry.target_node_id.as_deref() == Some(node_id))
        .map(|(k, _)| k.clone())
        .collect();

    let count = matching_keys.len();
    for key in matching_keys {
        if let Some(entry) = pending.remove(&key) {
            let err_resp = CapabilityResponse::err(
                Some(key),
                CapabilityError::new(
                    "session_dropped",
                    format!("Target node '{}' disconnected: {}", node_id, reason),
                ),
            );
            let _ = entry.sender.send(err_resp);
        }
    }
    count
}

/// Fail all in-flight pending capability requests (e.g. during graceful shutdown)
pub async fn fail_all_pending(reason: &str) -> usize {
    let mut pending = PENDING_RESPONSES.lock().await;
    let count = pending.len();
    for (key, entry) in pending.drain() {
        let err_resp = CapabilityResponse::err(
            Some(key),
            CapabilityError::new(
                "subsystem_shutdown",
                format!("Subsystem shutdown: {}", reason),
            ),
        );
        let _ = entry.sender.send(err_resp);
    }
    count
}

/// Abstract remote command transport sender
pub type RemoteCommandSender = Arc<dyn Fn(&str, &str) -> NetworkResult<()> + Send + Sync>;

/// Authoritative Administrative Command Controller
#[derive(Clone)]
pub struct AdminCommandController {
    state: SharedNetworkState,
    events: Option<NetworkEventBus>,
    audit_logger: &'static AdminAuditLogger,
    remote_sender: Option<RemoteCommandSender>,
}

impl std::fmt::Debug for AdminCommandController {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AdminCommandController")
            .field("state_revision", &self.state.revision())
            .field("has_events", &self.events.is_some())
            .field("has_remote_sender", &self.remote_sender.is_some())
            .finish()
    }
}

impl AdminCommandController {
    pub fn new(state: SharedNetworkState, events: Option<NetworkEventBus>) -> Self {
        Self {
            state,
            events,
            audit_logger: global_admin_audit_logger(),
            remote_sender: None,
        }
    }

    pub fn new_with_bus(state: SharedNetworkState, events: NetworkEventBus) -> Self {
        Self {
            state,
            events: Some(events),
            audit_logger: global_admin_audit_logger(),
            remote_sender: None,
        }
    }

    pub fn with_remote_sender(mut self, sender: RemoteCommandSender) -> Self {
        self.remote_sender = Some(sender);
        self
    }

    /// Access authoritative SharedNetworkState handle
    pub fn state(&self) -> &SharedNetworkState {
        &self.state
    }

    /// Execute a single-target administrative capability command from desktop context.
    pub async fn execute_command(&self, request: AdminCommandRequest) -> AdminCommandResult {
        let caller = CallerContext::local_elevated("local_desktop_user", "desktop_ipc");
        self.execute_single(&caller, request).await
    }

    /// Execute a batch administrative capability command from desktop context.
    pub async fn execute_batch_command(&self, request: AdminBatchCommandRequest) -> AdminBatchCommandResult {
        let caller = CallerContext::local_elevated("local_desktop_user", "desktop_ipc");
        self.execute_batch(&caller, request).await
    }

    /// Execute a single-target administrative capability command.
    ///
    /// Lifecycle:
    /// 1. Validate request and resolve target node from authoritative NetworkState.
    /// 2. Authorize request via PermissionPolicy using CallerContext and target node state.
    /// 3. If RequireConfirmation and not confirmed, reject with confirmation required.
    /// 4. If local node / local execution: dispatch directly to CapabilityRegistry.
    /// 5. If remote node: resolve transport session, frame capability request, dispatch over TCP, and await response with timeout.
    /// 6. Record operational audit log and publish NetworkEvent.
    pub async fn execute_single(
        &self,
        caller: &CallerContext,
        request: AdminCommandRequest,
    ) -> AdminCommandResult {
        let start_time = Instant::now();
        let timeout_duration = Duration::from_millis(request.timeout_ms.unwrap_or(5000));
        let req_id_str = request.request_id.as_str().to_string();
        let capability_id = request.capability.id.clone();
        let target_node_id = request.target_node_id.clone();

        // 0. Application Freshness & Deadline Invariant Checks
        let now_ms = current_epoch_ms();
        if let Some(deadline) = request.deadline_epoch_ms {
            if now_ms > deadline {
                let duration_ms = start_time.elapsed().as_millis() as u64;
                return AdminCommandResult {
                    request_id: request.request_id,
                    target_node_id,
                    capability_id,
                    success: false,
                    data: None,
                    error: Some(CapabilityError::new(
                        "deadline_exceeded",
                        format!("Command deadline expired (now: {}, deadline: {})", now_ms, deadline),
                    )),
                    execution_duration_ms: duration_ms,
                    timestamp_epoch_ms: now_ms,
                };
            }
        }
        if let Some(created_at) = request.created_at_epoch_ms {
            let max_skew_ms: u64 = 60_000; // 60s tolerance
            if now_ms.saturating_sub(created_at) > max_skew_ms {
                let duration_ms = start_time.elapsed().as_millis() as u64;
                return AdminCommandResult {
                    request_id: request.request_id,
                    target_node_id,
                    capability_id,
                    success: false,
                    data: None,
                    error: Some(CapabilityError::new(
                        "command_stale",
                        format!("Command timestamp exceeds maximum allowable skew (age: {}ms)", now_ms - created_at),
                    )),
                    execution_duration_ms: duration_ms,
                    timestamp_epoch_ms: now_ms,
                };
            }
        }

        // 1. Resolve target node from authoritative NetworkState
        let target_node = self.state.read(|s| s.get_node(&target_node_id));
        let is_target_local = target_node.as_ref().map(|n| n.is_local).unwrap_or(false);

        // 2. Perform authoritative policy authorization
        let auth_decision = evaluate_capability(caller, target_node.as_ref(), &request.capability);

        match auth_decision {
            PermissionDecision::Deny { reason } => {
                let duration_ms = start_time.elapsed().as_millis() as u64;
                self.record_audit(
                    &req_id_str,
                    &target_node_id,
                    &capability_id,
                    caller,
                    "Deny",
                    false,
                    duration_ms,
                    Some("permission_denied".into()),
                );

                self.publish_event(
                    NetworkEventType::AdminCommandAuthorizationDenied,
                    EventSeverity::Warning,
                    format!("Authorization denied for command '{}' on target '{}': {}", capability_id, target_node_id, reason),
                    Some(target_node_id.clone()),
                    serde_json::json!({
                        "request_id": req_id_str,
                        "capability_id": capability_id,
                        "reason": reason,
                    }),
                );

                return AdminCommandResult {
                    request_id: request.request_id,
                    target_node_id,
                    capability_id,
                    success: false,
                    data: None,
                    error: Some(CapabilityError::new("permission_denied", reason)),
                    execution_duration_ms: duration_ms,
                    timestamp_epoch_ms: current_epoch_ms(),
                };
            }
            PermissionDecision::RequireConfirmation { reason } => {
                if !request.confirmed {
                    let duration_ms = start_time.elapsed().as_millis() as u64;
                    return AdminCommandResult {
                        request_id: request.request_id,
                        target_node_id,
                        capability_id,
                        success: false,
                        data: None,
                        error: Some(CapabilityError::new("confirmation_required", reason)),
                        execution_duration_ms: duration_ms,
                        timestamp_epoch_ms: current_epoch_ms(),
                    };
                }
            }
            PermissionDecision::Allow => {}
        }

        // 3. Publish AdminCommandDispatched event
        self.publish_event(
            NetworkEventType::AdminCommandDispatched,
            EventSeverity::Info,
            format!("Dispatching capability '{}' to target '{}'", capability_id, target_node_id),
            Some(target_node_id.clone()),
            serde_json::json!({
                "request_id": req_id_str,
                "capability_id": capability_id,
            }),
        );

        // 4. Execution Routing
        let execution_result: Result<CapabilityResponse, CapabilityError> = if is_target_local {
            // Local Execution via native CapabilityRegistry
            Ok(dispatch_capability(&request.capability))
        } else {
            // Remote Execution over active transport session
            match target_node {
                None => Err(CapabilityError::new(
                    "target_not_found",
                    format!("Target node '{}' does not exist in network state", target_node_id),
                )),
                Some(ref node) if node.availability != NodeAvailability::Connected => {
                    Err(CapabilityError::new(
                        "target_not_connected",
                        format!("Target node '{}' is currently {:?}", target_node_id, node.availability),
                    ))
                }
                Some(ref node) => {
                    let terminal_tag = node.metadata.get("terminal_tag").cloned();
                    self.dispatch_remote(&req_id_str, &request.capability, terminal_tag.as_deref(), Some(target_node_id.as_str()), timeout_duration).await
                }
            }
        };

        let duration_ms = start_time.elapsed().as_millis() as u64;
        let now_ms = current_epoch_ms();

        // 5. Response Processing & Audit Logging
        match execution_result {
            Ok(cap_resp) => {
                if cap_resp.success {
                    self.record_audit(
                        &req_id_str,
                        &target_node_id,
                        &capability_id,
                        caller,
                        "Allow",
                        true,
                        duration_ms,
                        None,
                    );

                    self.publish_event(
                        NetworkEventType::AdminCommandCompleted,
                        EventSeverity::Info,
                        format!("Command '{}' on target '{}' completed successfully", capability_id, target_node_id),
                        Some(target_node_id.clone()),
                        serde_json::json!({
                            "request_id": req_id_str,
                            "capability_id": capability_id,
                            "duration_ms": duration_ms,
                        }),
                    );

                    AdminCommandResult {
                        request_id: request.request_id,
                        target_node_id,
                        capability_id,
                        success: true,
                        data: cap_resp.data,
                        error: None,
                        execution_duration_ms: duration_ms,
                        timestamp_epoch_ms: now_ms,
                    }
                } else {
                    let err = cap_resp.error.unwrap_or_else(|| CapabilityError::new("execution_failed", "Capability failed"));
                    self.record_audit(
                        &req_id_str,
                        &target_node_id,
                        &capability_id,
                        caller,
                        "Allow",
                        false,
                        duration_ms,
                        Some(err.code.clone()),
                    );

                    self.publish_event(
                        NetworkEventType::AdminCommandFailed,
                        EventSeverity::Error,
                        format!("Command '{}' on target '{}' failed: {}", capability_id, target_node_id, err.message),
                        Some(target_node_id.clone()),
                        serde_json::json!({
                            "request_id": req_id_str,
                            "capability_id": capability_id,
                            "error_code": err.code,
                        }),
                    );

                    AdminCommandResult {
                        request_id: request.request_id,
                        target_node_id,
                        capability_id,
                        success: false,
                        data: None,
                        error: Some(err),
                        execution_duration_ms: duration_ms,
                        timestamp_epoch_ms: now_ms,
                    }
                }
            }
            Err(err) => {
                self.record_audit(
                    &req_id_str,
                    &target_node_id,
                    &capability_id,
                    caller,
                    "Allow",
                    false,
                    duration_ms,
                    Some(err.code.clone()),
                );

                self.publish_event(
                    NetworkEventType::AdminCommandFailed,
                    EventSeverity::Error,
                    format!("Command '{}' on target '{}' dispatch error: {}", capability_id, target_node_id, err.message),
                    Some(target_node_id.clone()),
                    serde_json::json!({
                        "request_id": req_id_str,
                        "capability_id": capability_id,
                        "error_code": err.code,
                    }),
                );

                AdminCommandResult {
                    request_id: request.request_id,
                    target_node_id,
                    capability_id,
                    success: false,
                    data: None,
                    error: Some(err),
                    execution_duration_ms: duration_ms,
                    timestamp_epoch_ms: now_ms,
                }
            }
        }
    }

    /// Dispatch a remote capability invocation over the active transport session
    async fn dispatch_remote(
        &self,
        req_id_str: &str,
        capability: &CapabilityRequest,
        terminal_tag: Option<&str>,
        target_node_id: Option<&str>,
        timeout_duration: Duration,
    ) -> Result<CapabilityResponse, CapabilityError> {
        let tag = terminal_tag.ok_or_else(|| {
            CapabilityError::new("no_active_session", "Target node has no associated active transport session")
        })?;

        let sender = self.remote_sender.as_ref().ok_or_else(|| {
            CapabilityError::new("transport_unavailable", "Remote command transport channel is not bound")
        })?;

        // Register oneshot response listener with global capacity check (REL-02)
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = PENDING_RESPONSES.lock().await;
            if pending.len() >= MAX_PENDING_ADMIN_RESPONSES {
                crate::network::diagnostics::global_diagnostics().inc_admin_commands_failed();
                return Err(CapabilityError::new(
                    "system_busy",
                    format!("Maximum in-flight admin requests capacity ({}) reached", MAX_PENDING_ADMIN_RESPONSES),
                ));
            }
            pending.insert(
                req_id_str.to_string(),
                PendingEntry {
                    sender: tx,
                    target_tag: Some(tag.to_string()),
                    target_node_id: target_node_id.map(|s| s.to_string()),
                },
            );
        }

        crate::network::diagnostics::global_diagnostics().inc_admin_commands_dispatched();

        // Frame and send message over TCP session
        let mut cap_req = capability.clone();
        if cap_req.request_id.is_none() {
            cap_req.request_id = Some(req_id_str.to_string());
        }

        let cmd_id: u64 = req_id_str.parse().unwrap_or(1);
        let wire_msg = serde_json::json!({
            "type": "capability_invoke",
            "id": cmd_id,
            "request": cap_req,
        });

        let payload_str = wire_msg.to_string();
        if let Err(e) = sender(tag, &payload_str) {
            let mut pending = PENDING_RESPONSES.lock().await;
            pending.remove(req_id_str);
            return Err(CapabilityError::new("dispatch_failed", format!("Failed to send wire payload: {}", e)));
        }

        // Await correlated response with timeout
        match tokio::time::timeout(timeout_duration, rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => Err(CapabilityError::new("session_dropped", "Remote transport session disconnected while awaiting response")),
            Err(_) => {
                let mut pending = PENDING_RESPONSES.lock().await;
                pending.remove(req_id_str);
                Err(CapabilityError::new("timeout", format!("Remote capability execution timed out after {}ms", timeout_duration.as_millis())))
            }
        }
    }

    /// Execute a batch administrative capability command across multiple target nodes with bounded concurrency.
    ///
    /// Semantics:
    /// - Targets execute independently. A failure on one target does NOT abort others.
    /// - Bounded concurrency: at most 5 concurrent remote dispatches using Semaphore.
    /// - Individual 5000ms timeout per target.
    /// - Aggregated result produced.
    pub async fn execute_batch(
        &self,
        caller: &CallerContext,
        request: AdminBatchCommandRequest,
    ) -> AdminBatchCommandResult {
        let start_time = Instant::now();
        let total_targets = request.target_node_ids.len();
        let semaphore = Arc::new(Semaphore::new(5)); // Bounded concurrency limit: 5

        let mut tasks = Vec::new();
        for node_id in request.target_node_ids {
            let controller = self.clone();
            let caller_clone = caller.clone();
            let mut single_req = AdminCommandRequest::new(
                RequestId::new(format!("{}_{}", request.batch_id.as_str(), node_id.as_str())),
                node_id,
                request.capability.clone(),
            );
            single_req.timeout_ms = request.timeout_ms;
            single_req.confirmed = request.confirmed;
            let sem_clone = Arc::clone(&semaphore);

            tasks.push(tokio::spawn(async move {
                let _permit = sem_clone.acquire().await;
                controller.execute_single(&caller_clone, single_req).await
            }));
        }

        let mut results = Vec::new();
        let mut successful_targets = 0;
        let mut failed_targets = 0;

        for task in tasks {
            match task.await {
                Ok(res) => {
                    if res.success {
                        successful_targets += 1;
                    } else {
                        failed_targets += 1;
                    }
                    results.push(res);
                }
                Err(join_err) => {
                    failed_targets += 1;
                    results.push(AdminCommandResult {
                        request_id: RequestId::new("task_join_error"),
                        target_node_id: NodeId::new("unknown"),
                        capability_id: request.capability.id.clone(),
                        success: false,
                        data: None,
                        error: Some(CapabilityError::new("join_error", join_err.to_string())),
                        execution_duration_ms: 0,
                        timestamp_epoch_ms: current_epoch_ms(),
                    });
                }
            }
        }

        let total_duration_ms = start_time.elapsed().as_millis() as u64;
        let now_ms = current_epoch_ms();

        self.publish_event(
            NetworkEventType::AdminBatchCompleted,
            EventSeverity::Info,
            format!("Batch command '{}' completed (Success: {}/{})", request.capability.id, successful_targets, total_targets),
            None,
            serde_json::json!({
                "batch_id": request.batch_id.as_str(),
                "total": total_targets,
                "succeeded": successful_targets,
                "failed": failed_targets,
                "duration_ms": total_duration_ms,
            }),
        );

        AdminBatchCommandResult {
            batch_id: request.batch_id,
            total_targets,
            successful_targets,
            failed_targets,
            results,
            total_duration_ms,
            timestamp_epoch_ms: now_ms,
        }
    }

    fn record_audit(
        &self,
        request_id: &str,
        target_node_id: &NodeId,
        capability_id: &str,
        caller: &CallerContext,
        decision: &str,
        success: bool,
        duration_ms: u64,
        error_code: Option<String>,
    ) {
        let caller_type = match caller {
            CallerContext::LocalUser { is_elevated, .. } => {
                if *is_elevated { "LocalUser(Elevated)" } else { "LocalUser(Standard)" }
            }
            CallerContext::RemoteNode { role, .. } => {
                let _ = role;
                "RemoteNode"
            }
            CallerContext::SystemInternal { .. } => "SystemInternal",
        };

        self.audit_logger.record(AdminAuditEntry {
            timestamp_epoch_ms: current_epoch_ms(),
            request_id: request_id.to_string(),
            target_node_id: target_node_id.as_str().to_string(),
            capability_id: capability_id.to_string(),
            caller_type: caller_type.to_string(),
            authorization_decision: decision.to_string(),
            success,
            duration_ms,
            error_code,
        });
    }

    fn publish_event(
        &self,
        event_type: NetworkEventType,
        severity: EventSeverity,
        summary: String,
        target_node_id: Option<NodeId>,
        details: serde_json::Value,
    ) {
        if let Some(ref bus) = self.events {
            let rev = self.state.revision();
            let mut evt = NetworkEvent::new(
                EventCategory::Admin,
                event_type,
                severity,
                summary,
            )
            .with_state_revision(rev)
            .with_details(details);

            if let Some(node_id) = target_node_id {
                evt = evt.with_target_node(node_id);
            }

            bus.publish(evt);
        }
    }
}

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::model::{AuthenticationState, NetworkNode, PairingState};
    use serde_json::json;

    fn setup_test_controller() -> (AdminCommandController, SharedNetworkState, NetworkEventBus) {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let controller = AdminCommandController::new(state.clone(), Some(events.clone()));
        (controller, state, events)
    }

    #[tokio::test]
    async fn test_controller_local_execution_success() {
        let (controller, state, _events) = setup_test_controller();

        // Local node in state
        let local_node_id = NodeId::new("local-node-self");
        let mut local_node = NetworkNode::new(
            local_node_id.clone(),
            "Local Self",
            "localhost",
            std::env::consts::OS,
            std::env::consts::ARCH,
        );
        local_node.is_local = true;
        local_node.availability = NodeAvailability::Connected;
        local_node.auth_state = AuthenticationState::Authenticated;
        local_node.pairing_state = PairingState::Paired;
        state.upsert_node(local_node).unwrap();

        let mut req = AdminCommandRequest::new(
            RequestId::new("req-local-1"),
            local_node_id,
            CapabilityRequest {
                id: "System.GetHardware".into(),
                parameters: json!({}),
                request_id: Some("req-local-1".into()),
            },
        );
        req.timeout_ms = Some(2000);

        let caller = CallerContext::local_admin();
        let result = controller.execute_single(&caller, req).await;

        assert!(result.success);
        assert!(result.data.is_some());
        assert_eq!(result.capability_id, "System.GetHardware");
    }

    #[tokio::test]
    async fn test_controller_disconnected_target_rejection() {
        let (controller, state, _events) = setup_test_controller();

        let remote_node_id = NodeId::new("remote-offline-1");
        let mut node = NetworkNode::new(
            remote_node_id.clone(),
            "Remote Offline",
            "offline-pc",
            "linux",
            "x86_64",
        );
        node.availability = NodeAvailability::Disconnected;
        state.upsert_node(node).unwrap();

        let mut req = AdminCommandRequest::new(
            RequestId::new("req-off-1"),
            remote_node_id,
            CapabilityRequest {
                id: "Process.List".into(),
                parameters: json!({}),
                request_id: Some("req-off-1".into()),
            },
        );
        req.timeout_ms = Some(1000);

        let caller = CallerContext::local_admin();
        let result = controller.execute_single(&caller, req).await;

        assert!(!result.success);
        let err = result.error.unwrap();
        assert_eq!(err.code, "permission_denied");
        assert!(err.message.contains("not connected"));
    }

    #[tokio::test]
    async fn test_controller_batch_execution_independent_isolation() {
        let (controller, state, _events) = setup_test_controller();

        // Node 1: Connected & local (will succeed)
        let n1_id = NodeId::new("n1-local");
        let mut n1 = NetworkNode::new(n1_id.clone(), "N1", "h1", std::env::consts::OS, std::env::consts::ARCH);
        n1.is_local = true;
        n1.availability = NodeAvailability::Connected;
        n1.auth_state = AuthenticationState::Authenticated;
        state.upsert_node(n1).unwrap();

        // Node 2: Disconnected (will fail)
        let n2_id = NodeId::new("n2-offline");
        let mut n2 = NetworkNode::new(n2_id.clone(), "N2", "h2", "linux", "x86_64");
        n2.availability = NodeAvailability::Disconnected;
        state.upsert_node(n2).unwrap();

        let batch_req = AdminBatchCommandRequest {
            batch_id: RequestId::new("batch-test-1"),
            target_node_ids: vec![n1_id.clone(), n2_id.clone()],
            capability: CapabilityRequest {
                id: "System.GetHardware".into(),
                parameters: json!({}),
                request_id: None,
            },
            timeout_ms: Some(2000),
            confirmed: false,
        };

        let caller = CallerContext::local_admin();
        let batch_res = controller.execute_batch(&caller, batch_req).await;

        assert_eq!(batch_res.total_targets, 2);
        assert_eq!(batch_res.successful_targets, 1);
        assert_eq!(batch_res.failed_targets, 1);

        let res_n1 = batch_res.results.iter().find(|r| r.target_node_id == n1_id).unwrap();
        assert!(res_n1.success);

        let res_n2 = batch_res.results.iter().find(|r| r.target_node_id == n2_id).unwrap();
        assert!(!res_n2.success);
    }
}
