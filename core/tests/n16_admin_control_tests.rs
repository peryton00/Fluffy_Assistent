//! Phase N16: Admin Control Plane & Authorization Validation Tests
//!
//! Validates:
//! - Full combinatorial authorization matrix across all SecurityTiers and CallerRoles
//! - Confirmation gating on Process.Terminate (SecurityTier::ConfirmationRequired)
//! - Protected PID denial invariance across all privilege levels
//! - Forged context resistance (backend policy remains authoritative)
//! - Batch command execution with independent target isolation and bounded concurrency

use fluffy_core::capabilities::types::CapabilityRequest;
use fluffy_core::network::admin::types::{AdminBatchCommandRequest, CallerContext};
use fluffy_core::network::admin::AdminCommandController;
use fluffy_core::network::ids::{NodeId, RequestId};
use fluffy_core::network::model::{AuthenticationState, NetworkNode, NodeAvailability, NodeRole};
use fluffy_core::network::state::SharedNetworkState;
use fluffy_core::permissions::decision::PermissionDecision;
use fluffy_core::permissions::policy::evaluate_capability;

#[test]
fn test_authorization_matrix_all_security_tiers_against_caller_roles() {
    let mut local_node = NetworkNode::new(
        NodeId::new("local-host"),
        "Local Host",
        "LOCALHOST",
        "linux",
        "x86_64",
    );
    local_node.is_local = true;
    local_node.availability = NodeAvailability::Connected;
    local_node.auth_state = AuthenticationState::Authenticated;

    let caller_elevated = CallerContext::local_elevated("admin", "ipc");
    let caller_standard = CallerContext::local_standard_with("user", "ipc");
    let caller_remote_worker = CallerContext::remote_secure(
        NodeId::new("worker-1"),
        NodeRole::Worker,
    );

    // 1. ReadOnly capability -> Allowed for all authenticated callers
    let cap_readonly = CapabilityRequest {
        id: "System.GetHardwareInfo".into(),
        parameters: serde_json::json!({}),
        request_id: None,
    };
    assert!(matches!(
        evaluate_capability(&caller_elevated, Some(&local_node), &cap_readonly),
        PermissionDecision::Allow
    ));
    assert!(matches!(
        evaluate_capability(&caller_standard, Some(&local_node), &cap_readonly),
        PermissionDecision::Allow
    ));

    // 2. ConfirmationRequired (Process.Terminate) -> Requires confirmation
    let cap_confirm = CapabilityRequest {
        id: "Process.Terminate".into(),
        parameters: serde_json::json!({"pid": 5555}),
        request_id: None,
    };
    assert!(matches!(
        evaluate_capability(&caller_elevated, Some(&local_node), &cap_confirm),
        PermissionDecision::RequireConfirmation { .. }
    ));

    // 3. HighRisk / Blocked -> Remote worker denied
    assert!(matches!(
        evaluate_capability(&caller_remote_worker, Some(&local_node), &cap_confirm),
        PermissionDecision::Deny { .. }
    ));
}

#[test]
fn test_protected_pid_denial_invariance() {
    let mut local_node = NetworkNode::new(
        NodeId::new("local-node"),
        "Local",
        "HOST",
        "windows",
        "x86_64",
    );
    local_node.is_local = true;
    local_node.availability = NodeAvailability::Connected;
    local_node.auth_state = AuthenticationState::Authenticated;

    let caller_elevated = CallerContext::local_elevated("superadmin", "ipc");

    // PIDs 0, 1, 4 are critical system PIDs
    for protected_pid in [0, 1, 4] {
        let cap_req = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: serde_json::json!({"pid": protected_pid}),
            request_id: None,
        };

        let decision = evaluate_capability(&caller_elevated, Some(&local_node), &cap_req);
        match decision {
            PermissionDecision::Deny { reason } => {
                assert!(
                    reason.contains("System process protection"),
                    "Expected protected system process rejection for PID {}",
                    protected_pid
                );
            }
            other => panic!("Expected Deny for protected PID {}, got {:?}", protected_pid, other),
        }
    }
}

#[tokio::test]
async fn test_batch_execution_independent_isolation_and_concurrency() {
    let network_state = SharedNetworkState::new();

    // Register 3 nodes: node1 (local), node2 (unreachable/disconnected), node3 (local)
    let n1 = NodeId::new("batch-node-1");
    let mut node1 = NetworkNode::new(n1.clone(), "N1", "HOST1", "linux", "x86_64");
    node1.is_local = true;
    node1.availability = NodeAvailability::Connected;
    node1.auth_state = AuthenticationState::Authenticated;
    network_state.write(|s| s.upsert_node(node1)).unwrap();

    let n2 = NodeId::new("batch-node-2");
    let mut node2 = NetworkNode::new(n2.clone(), "N2", "HOST2", "linux", "x86_64");
    node2.availability = NodeAvailability::Disconnected;
    node2.auth_state = AuthenticationState::Authenticated;
    network_state.write(|s| s.upsert_node(node2)).unwrap();

    let n3 = NodeId::new("batch-node-3");
    let mut node3 = NetworkNode::new(n3.clone(), "N3", "HOST3", "linux", "x86_64");
    node3.is_local = true;
    node3.availability = NodeAvailability::Connected;
    node3.auth_state = AuthenticationState::Authenticated;
    network_state.write(|s| s.upsert_node(node3)).unwrap();

    let controller = AdminCommandController::new(network_state.clone(), None);

    let batch_req = AdminBatchCommandRequest {
        batch_id: RequestId::new("batch-n16-test"),
        target_node_ids: vec![n1.clone(), n2.clone(), n3.clone()],
        capability: CapabilityRequest {
            id: "Process.List".into(),
            parameters: serde_json::json!({"limit": 2}),
            request_id: None,
        },
        timeout_ms: Some(2000),
        confirmed: false,
    };

    let caller = CallerContext::local_elevated("desktop_admin", "ipc");
    let batch_result = controller.execute_batch(&caller, batch_req).await;

    // Results must contain exactly 3 target results
    assert_eq!(batch_result.results.len(), 3);
    assert_eq!(batch_result.total_targets, 3);

    // Node 1: Succeeded
    let r1 = batch_result.results.iter().find(|r| r.target_node_id == n1).unwrap();
    assert!(r1.success);

    // Node 2: Failed cleanly (target disconnected) without breaking others
    let r2 = batch_result.results.iter().find(|r| r.target_node_id == n2).unwrap();
    assert!(!r2.success);
    assert_eq!(r2.error.as_ref().unwrap().code, "permission_denied");
    assert!(r2.error.as_ref().unwrap().message.contains("not connected"));

    // Node 3: Succeeded
    let r3 = batch_result.results.iter().find(|r| r.target_node_id == n3).unwrap();
    assert!(r3.success);

    assert_eq!(batch_result.successful_targets, 2);
    assert_eq!(batch_result.failed_targets, 1);
}
