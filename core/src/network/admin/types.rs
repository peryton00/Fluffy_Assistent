use serde::{Deserialize, Serialize};
use crate::capabilities::types::{CapabilityError, CapabilityRequest};
use crate::network::ids::{NodeId, RequestId};
use crate::network::model::{AuthenticationState, NodeRole};

/// Caller authorization context for administrative command dispatch.
/// Distinct from `NodeRole`, representing the validated identity and security posture of the caller.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CallerContext {
    /// Local Desktop UI user session
    LocalUser {
        user_id: String,
        session_id: String,
        is_elevated: bool,
    },
    /// Remote Fluffy Cluster Node
    RemoteNode {
        node_id: NodeId,
        role: NodeRole,
        auth_state: AuthenticationState,
        transport_mode: String,
        #[serde(default)]
        is_cryptographically_verified: bool,
    },
    /// Internal Rust System Subsystem
    SystemInternal {
        subsystem: String,
    },
}

impl CallerContext {
    /// Helper to create a default local admin/elevated user context
    pub fn local_admin() -> Self {
        Self::LocalUser {
            user_id: "local_desktop_user".into(),
            session_id: "local_session".into(),
            is_elevated: true,
        }
    }

    /// Helper to create a default local standard user context
    pub fn local_standard() -> Self {
        Self::LocalUser {
            user_id: "local_desktop_user".into(),
            session_id: "local_session".into(),
            is_elevated: false,
        }
    }

    /// Helper to create a local standard user context
    pub fn local_standard_with(user_id: impl Into<String>, session_id: impl Into<String>) -> Self {
        Self::LocalUser {
            user_id: user_id.into(),
            session_id: session_id.into(),
            is_elevated: false,
        }
    }

    /// Helper to create a local elevated/admin user context
    pub fn local_elevated(user_id: impl Into<String>, session_id: impl Into<String>) -> Self {
        Self::LocalUser {
            user_id: user_id.into(),
            session_id: session_id.into(),
            is_elevated: true,
        }
    }

    /// Helper to create a remote secure authenticated context
    pub fn remote_secure(node_id: NodeId, role: NodeRole) -> Self {
        Self::RemoteNode {
            node_id,
            role,
            auth_state: AuthenticationState::Authenticated,
            transport_mode: "authenticated_secure".into(),
            is_cryptographically_verified: true,
        }
    }

    /// Helper to create a remote legacy compatibility context
    pub fn remote_legacy(node_id: NodeId, role: NodeRole) -> Self {
        Self::RemoteNode {
            node_id,
            role,
            auth_state: AuthenticationState::Authenticated,
            transport_mode: "legacy_compatibility".into(),
            is_cryptographically_verified: false,
        }
    }

    /// Helper to create a system internal context
    pub fn system(subsystem: impl Into<String>) -> Self {
        Self::SystemInternal {
            subsystem: subsystem.into(),
        }
    }

    /// Is this caller elevated/admin?
    pub fn is_elevated(&self) -> bool {
        match self {
            Self::LocalUser { is_elevated, .. } => *is_elevated,
            Self::RemoteNode { role, auth_state, is_cryptographically_verified, .. } => {
                *role == NodeRole::Admin && *auth_state == AuthenticationState::Authenticated && *is_cryptographically_verified
            }
            Self::SystemInternal { .. } => true,
        }
    }
}

/// Structured request to execute an administrative capability on a target node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminCommandRequest {
    /// Request correlation identifier
    pub request_id: RequestId,
    /// Target node to execute the command on
    pub target_node_id: NodeId,
    /// Native capability request payload
    pub capability: CapabilityRequest,
    /// Timeout in milliseconds (defaults to 5000ms if None)
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// Explicit confirmation flag provided by UI after user review
    #[serde(default)]
    pub confirmed: bool,
    /// Session ID binding this request to an active authenticated session
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Timestamp epoch ms when command was created (for freshness checks)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at_epoch_ms: Option<u64>,
    /// Deadline epoch ms after which command is invalid
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_epoch_ms: Option<u64>,
}

impl AdminCommandRequest {
    pub fn new(request_id: RequestId, target_node_id: NodeId, capability: CapabilityRequest) -> Self {
        Self {
            request_id,
            target_node_id,
            capability,
            timeout_ms: Some(5000),
            confirmed: false,
            session_id: None,
            created_at_epoch_ms: None,
            deadline_epoch_ms: None,
        }
    }
}

/// Execution result of a single-target administrative command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminCommandResult {
    pub request_id: RequestId,
    pub target_node_id: NodeId,
    pub capability_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CapabilityError>,
    pub execution_duration_ms: u64,
    pub timestamp_epoch_ms: u64,
}

/// Structured request to execute an administrative capability across multiple target nodes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminBatchCommandRequest {
    /// Batch correlation identifier
    pub batch_id: RequestId,
    /// Target nodes to execute the command on
    pub target_node_ids: Vec<NodeId>,
    /// Native capability request payload
    pub capability: CapabilityRequest,
    /// Per-target timeout in milliseconds (defaults to 5000ms if None)
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// Explicit confirmation flag provided by UI after user review
    #[serde(default)]
    pub confirmed: bool,
}

/// Aggregated result of a batch administrative command execution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminBatchCommandResult {
    pub batch_id: RequestId,
    pub total_targets: usize,
    pub successful_targets: usize,
    pub failed_targets: usize,
    pub results: Vec<AdminCommandResult>,
    pub total_duration_ms: u64,
    pub timestamp_epoch_ms: u64,
}

/// Operational administrative audit record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdminAuditEntry {
    pub timestamp_epoch_ms: u64,
    pub request_id: String,
    pub target_node_id: String,
    pub capability_id: String,
    pub caller_type: String,
    pub authorization_decision: String,
    pub success: bool,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}
