use crate::capabilities::registry::CapabilityRegistry;
use crate::capabilities::types::{CapabilityRequest, SecurityTier};
use crate::ipc::command::Command;
use crate::network::admin::types::CallerContext;
use crate::network::model::{AuthenticationState, NetworkNode, NodeAvailability, NodeRole};
use crate::permissions::decision::PermissionDecision;

pub fn evaluate(cmd: &Command) -> PermissionDecision {
    match cmd {
        // Meta commands are never evaluated here
        &Command::Confirm { .. } | &Command::Cancel { .. } => {
            PermissionDecision::Deny {
                reason: "Confirmation commands are not executable actions".into(),
            }
        }

        // Capability discovery is always read-only / allowed
        &Command::DiscoverCapabilities => PermissionDecision::Allow,

        // Native capability evaluation
        Command::Capability { request } => {
            let registry = CapabilityRegistry::default();
            if let Some(meta) = registry.get_metadata(&request.id) {
                if meta.security_tier == SecurityTier::Blocked {
                    return PermissionDecision::Deny {
                        reason: format!("Capability '{}' is blocked by security policy", request.id),
                    };
                }
                if meta.requires_confirmation {
                    return PermissionDecision::RequireConfirmation {
                        reason: format!("Native capability '{}' modifies system state and requires confirmation", request.id),
                    };
                }
                PermissionDecision::Allow
            } else {
                PermissionDecision::Allow // Will be rejected as unknown_capability during dispatch
            }
        }

        // Process Termination (Protected system processes and pid < 100 are guarded)
        &Command::KillProcess { pid } => {
            if pid < 100 {
                PermissionDecision::Deny {
                    reason: "System process protection: Core system PIDs (< 100) cannot be terminated".into(),
                }
            } else {
                PermissionDecision::Allow
            }
        }

        // Cleanup is impactful
        &Command::RequestCleanup => {
            PermissionDecision::RequireConfirmation {
                reason: "Cleanup may close background applications".into(),
            }
        }

        // Safe operation
        &Command::OpenPath { .. } => PermissionDecision::Allow,

        // System actions - Direct allow for the dashboard experience
        &Command::NormalizeSystem => {
            PermissionDecision::Allow
        }

        // Startup App Management - Direct allow for dashboard controls
        &Command::StartupAdd { .. } | &Command::StartupRemove { .. } | &Command::StartupToggle { .. } => {
            PermissionDecision::Allow
        }

        // UI state sync is always allowed
        &Command::SetUiActive { .. } => PermissionDecision::Allow,
    }
}

/// Authoritatively evaluate an administrative capability invocation request for a given caller context and target node.
#[allow(dead_code)]
pub fn evaluate_capability(
    caller: &CallerContext,
    target_node: Option<&NetworkNode>,
    request: &CapabilityRequest,
) -> PermissionDecision {
    // 1. Target node lifecycle & authentication validation (if remote node target)
    if let Some(node) = target_node {
        if node.availability != NodeAvailability::Connected {
            return PermissionDecision::Deny {
                reason: format!("Target node '{}' is not connected (status: {:?})", node.id, node.availability),
            };
        }
        if node.auth_state != AuthenticationState::Authenticated {
            return PermissionDecision::Deny {
                reason: format!("Target node '{}' is not authenticated (auth_state: {:?})", node.id, node.auth_state),
            };
        }
    }

    // 2. Capability metadata and security tier check
    let registry = CapabilityRegistry::default();
    let meta = match registry.get_metadata(&request.id) {
        Some(m) => m,
        None => {
            return PermissionDecision::Allow; // Will fail cleanly as unknown_capability on dispatch
        }
    };

    if meta.security_tier == SecurityTier::Blocked {
        return PermissionDecision::Deny {
            reason: format!("Capability '{}' is permanently blocked by security policy", request.id),
        };
    }

    // 3. Domain invariant validations (e.g. Process.Terminate PID < 100 protection)
    if request.id == "Process.Terminate" {
        if let Some(pid) = request.parameters.get("pid").and_then(|p| p.as_u64()) {
            if pid < 100 {
                return PermissionDecision::Deny {
                    reason: "System process protection: Core system PIDs (< 100) cannot be terminated".into(),
                };
            }
        }
    }

    // 4. Role-based security tier matrix
    match caller {
        CallerContext::LocalUser { is_elevated, .. } => {
            if *is_elevated {
                match meta.security_tier {
                    SecurityTier::ReadOnly | SecurityTier::Safe => PermissionDecision::Allow,
                    SecurityTier::ConfirmationRequired | SecurityTier::HighRisk => {
                        PermissionDecision::RequireConfirmation {
                            reason: format!("Capability '{}' modifies system state and requires confirmation", request.id),
                        }
                    }
                    SecurityTier::Blocked => PermissionDecision::Deny {
                        reason: format!("Capability '{}' is blocked", request.id),
                    },
                }
            } else {
                match meta.security_tier {
                    SecurityTier::ReadOnly | SecurityTier::Safe => PermissionDecision::Allow,
                    SecurityTier::ConfirmationRequired => PermissionDecision::RequireConfirmation {
                        reason: format!("Capability '{}' requires user confirmation", request.id),
                    },
                    SecurityTier::HighRisk => PermissionDecision::Deny {
                        reason: format!("Standard user is not authorized for HighRisk capability '{}'", request.id),
                    },
                    SecurityTier::Blocked => PermissionDecision::Deny {
                        reason: format!("Capability '{}' is blocked", request.id),
                    },
                }
            }
        }
        CallerContext::RemoteNode {
            role,
            auth_state,
            transport_mode,
            is_cryptographically_verified,
            ..
        } => {
            if *auth_state != AuthenticationState::Authenticated {
                return PermissionDecision::Deny {
                    reason: "Remote caller is unauthenticated".into(),
                };
            }

            // Invariant: Mutating capabilities (ConfirmationRequired or HighRisk) require cryptographic authentication
            if meta.security_tier == SecurityTier::ConfirmationRequired || meta.security_tier == SecurityTier::HighRisk {
                if !*is_cryptographically_verified || transport_mode != "authenticated_secure" {
                    return PermissionDecision::Deny {
                        reason: format!(
                            "Capability '{}' modifies system state and is forbidden over unauthenticated legacy compatibility transport (N14)",
                            request.id
                        ),
                    };
                }
            }

            if *role == NodeRole::Admin {
                match meta.security_tier {
                    SecurityTier::ReadOnly | SecurityTier::Safe => PermissionDecision::Allow,
                    SecurityTier::ConfirmationRequired | SecurityTier::HighRisk => {
                        PermissionDecision::RequireConfirmation {
                            reason: format!("Administrative remote capability '{}' requires confirmation", request.id),
                        }
                    }
                    SecurityTier::Blocked => PermissionDecision::Deny {
                        reason: format!("Capability '{}' is blocked", request.id),
                    },
                }
            } else {
                // Worker, Peer, Standalone remote nodes are restricted to ReadOnly
                match meta.security_tier {
                    SecurityTier::ReadOnly => PermissionDecision::Allow,
                    _ => PermissionDecision::Deny {
                        reason: format!("Remote node with role '{:?}' is not authorized for capability '{}'", role, request.id),
                    },
                }
            }
        }
        CallerContext::SystemInternal { .. } => PermissionDecision::Allow,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::ids::NodeId;
    use crate::network::model::{NetworkNode, NodeAvailability, NodeRole, PairingState};
    use serde_json::json;

    fn mock_connected_node() -> NetworkNode {
        let mut node = NetworkNode::new(
            NodeId::new("node-test-1"),
            "Test Node",
            "test-pc",
            "linux",
            "x86_64",
        );
        node.availability = NodeAvailability::Connected;
        node.auth_state = AuthenticationState::Authenticated;
        node.pairing_state = PairingState::Paired;
        node
    }

    #[test]
    fn test_evaluate_elevated_local_user_tiers() {
        let node = mock_connected_node();
        let caller = CallerContext::local_admin();

        // ReadOnly -> Allow
        let req_read = CapabilityRequest {
            id: "System.GetHardware".into(),
            parameters: json!({}),
            request_id: Some("req-1".into()),
        };
        assert_eq!(evaluate_capability(&caller, Some(&node), &req_read), PermissionDecision::Allow);

        // Safe -> Allow
        let req_safe = CapabilityRequest {
            id: "Application.Launch".into(),
            parameters: json!({"app_name": "notepad"}),
            request_id: Some("req-2".into()),
        };
        assert_eq!(evaluate_capability(&caller, Some(&node), &req_safe), PermissionDecision::Allow);

        // ConfirmationRequired -> RequireConfirmation
        let req_confirm = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 1234}),
            request_id: Some("req-3".into()),
        };
        match evaluate_capability(&caller, Some(&node), &req_confirm) {
            PermissionDecision::RequireConfirmation { .. } => {}
            other => panic!("Expected RequireConfirmation, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_standard_local_user_high_risk_denied() {
        let node = mock_connected_node();
        let caller = CallerContext::local_standard();

        // Process.Terminate is ConfirmationRequired -> RequireConfirmation
        let req_confirm = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 1234}),
            request_id: Some("req-1".into()),
        };
        match evaluate_capability(&caller, Some(&node), &req_confirm) {
            PermissionDecision::RequireConfirmation { .. } => {}
            other => panic!("Expected RequireConfirmation, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_worker_remote_node_denied_mutating() {
        let node = mock_connected_node();
        let caller = CallerContext::RemoteNode {
            node_id: NodeId::new("node-worker-1"),
            role: NodeRole::Worker,
            auth_state: AuthenticationState::Authenticated,
            transport_mode: "legacy_compatibility".into(),
            is_cryptographically_verified: false,
        };

        // ReadOnly -> Allow
        let req_read = CapabilityRequest {
            id: "System.GetHardware".into(),
            parameters: json!({}),
            request_id: Some("req-1".into()),
        };
        assert_eq!(evaluate_capability(&caller, Some(&node), &req_read), PermissionDecision::Allow);

        // Safe / ConfirmationRequired -> Denied
        let req_terminate = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 1234}),
            request_id: Some("req-2".into()),
        };
        match evaluate_capability(&caller, Some(&node), &req_terminate) {
            PermissionDecision::Deny { .. } => {}
            other => panic!("Expected Deny for worker remote node, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_remote_admin_secure_vs_legacy() {
        let node = mock_connected_node();
        let secure_admin = CallerContext::remote_secure(NodeId::new("admin_peer"), NodeRole::Admin);
        let legacy_admin = CallerContext::remote_legacy(NodeId::new("admin_peer"), NodeRole::Admin);

        let req_terminate = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 1234}),
            request_id: Some("req-term".into()),
        };

        // 1. Secure admin caller -> RequireConfirmation
        match evaluate_capability(&secure_admin, Some(&node), &req_terminate) {
            PermissionDecision::RequireConfirmation { .. } => {}
            other => panic!("Expected RequireConfirmation for secure admin, got {:?}", other),
        }

        // 2. Legacy unauthenticated admin caller -> Strictly Denied by N14 policy
        match evaluate_capability(&legacy_admin, Some(&node), &req_terminate) {
            PermissionDecision::Deny { reason } => {
                assert!(reason.contains("forbidden over unauthenticated legacy compatibility transport"));
            }
            other => panic!("Expected Deny for legacy admin on mutating capability, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_disconnected_or_unauthenticated_target_denied() {
        let caller = CallerContext::local_admin();
        let mut node = mock_connected_node();

        // Disconnected -> Denied
        node.availability = NodeAvailability::Disconnected;
        let req = CapabilityRequest {
            id: "System.GetHardware".into(),
            parameters: json!({}),
            request_id: Some("req-1".into()),
        };
        match evaluate_capability(&caller, Some(&node), &req) {
            PermissionDecision::Deny { reason } => assert!(reason.contains("not connected")),
            other => panic!("Expected Deny, got {:?}", other),
        }

        // Unauthenticated -> Denied
        node.availability = NodeAvailability::Connected;
        node.auth_state = AuthenticationState::Unauthenticated;
        match evaluate_capability(&caller, Some(&node), &req) {
            PermissionDecision::Deny { reason } => assert!(reason.contains("not authenticated")),
            other => panic!("Expected Deny, got {:?}", other),
        }
    }

    #[test]
    fn test_evaluate_protected_pid_rejection() {
        let caller = CallerContext::local_admin();
        let node = mock_connected_node();

        let req_pid4 = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 4}),
            request_id: Some("req-pid4".into()),
        };
        match evaluate_capability(&caller, Some(&node), &req_pid4) {
            PermissionDecision::Deny { reason } => assert!(reason.contains("PIDs (< 100)")),
            other => panic!("Expected Deny for system PID, got {:?}", other),
        }
    }
}

