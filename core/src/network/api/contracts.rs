use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::network::api::error::NetworkApiError;
use crate::network::api::version::NetworkProtocolVersion;
use crate::network::ids::{ConnectionId, DeviceId, NetworkInterfaceId, NodeId, RequestId};
use crate::network::model::{
    ConnectionKind, EventCategory, NetworkConnection, NetworkDevice, NetworkNode, NodeRole,
    TrafficMetrics,
};
use crate::network::state::NetworkStateSnapshot;
use crate::network::types::NetworkInterfaceInfo;

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ============================================================================
// Generic API Response Envelope
// ============================================================================

/// Standardized serialized envelope for all Network API responses.
///
/// Ensures request-response correlation via `RequestId`, protocol versioning,
/// timestamp attribution, and consistent success/error payload structuring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkApiResponse<T> {
    /// Correlated RequestId provided by the client (or generated on receipt)
    pub request_id: RequestId,
    /// Protocol version under which this response was formulated
    pub protocol_version: NetworkProtocolVersion,
    /// Server epoch timestamp (milliseconds) when this response was generated
    pub timestamp_epoch_ms: u64,
    /// Boolean indicating whether the operation succeeded
    pub success: bool,
    /// Strongly typed payload data if the operation succeeded
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    /// Structured client-safe error if the operation failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<NetworkApiError>,
}

impl<T> NetworkApiResponse<T> {
    /// Create a successful response envelope
    pub fn ok(request_id: RequestId, data: T) -> Self {
        Self {
            request_id,
            protocol_version: NetworkProtocolVersion::current(),
            timestamp_epoch_ms: current_epoch_ms(),
            success: true,
            data: Some(data),
            error: None,
        }
    }

    /// Create an error response envelope
    pub fn err(request_id: RequestId, error: NetworkApiError) -> Self {
        Self {
            request_id,
            protocol_version: NetworkProtocolVersion::current(),
            timestamp_epoch_ms: current_epoch_ms(),
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

// ============================================================================
// 1. Snapshot Contracts
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetNetworkSnapshotRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl GetNetworkSnapshotRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for GetNetworkSnapshotRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetNetworkSnapshotResponse {
    pub snapshot: NetworkStateSnapshot,
}

// ============================================================================
// 2. Node Query Contracts
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListNodesRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl ListNodesRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for ListNodesRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ListNodesResponse {
    pub revision: u64,
    pub nodes: Vec<NetworkNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetNodeRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub node_id: NodeId,
}

impl GetNodeRequest {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, node_id: NodeId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetNodeResponse {
    pub revision: u64,
    pub node: NetworkNode,
}

// ============================================================================
// 3. Device Query Contracts
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListDevicesRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl ListDevicesRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for ListDevicesRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ListDevicesResponse {
    pub revision: u64,
    pub devices: Vec<NetworkDevice>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetDeviceRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub device_id: DeviceId,
}

impl GetDeviceRequest {
    pub fn new(device_id: DeviceId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            device_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, device_id: DeviceId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            device_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetDeviceResponse {
    pub revision: u64,
    pub device: NetworkDevice,
}

// ============================================================================
// 4. Connection Query Contracts
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListConnectionsRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl ListConnectionsRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for ListConnectionsRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ListConnectionsResponse {
    pub revision: u64,
    pub connections: Vec<NetworkConnection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetConnectionRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub connection_id: ConnectionId,
}

impl GetConnectionRequest {
    pub fn new(connection_id: ConnectionId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            connection_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, connection_id: ConnectionId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            connection_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetConnectionResponse {
    pub revision: u64,
    pub connection: NetworkConnection,
}

// ============================================================================
// 5. Interface Query Contracts
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListInterfacesRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl ListInterfacesRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for ListInterfacesRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ListInterfacesResponse {
    pub revision: u64,
    pub interfaces: Vec<NetworkInterfaceInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetInterfaceRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub interface_id: NetworkInterfaceId,
}

impl GetInterfaceRequest {
    pub fn new(interface_id: NetworkInterfaceId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            interface_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, interface_id: NetworkInterfaceId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            interface_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetInterfaceResponse {
    pub revision: u64,
    pub interface: NetworkInterfaceInfo,
}

// ============================================================================
// 6. Traffic Query Contracts
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetTrafficRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl GetTrafficRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for GetTrafficRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetTrafficResponse {
    pub revision: u64,
    pub traffic: TrafficMetrics,
}

// ============================================================================
// 7. Capabilities & Metadata Contract
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetCapabilitiesRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl GetCapabilitiesRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }

    pub fn with_request_id(request_id: RequestId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for GetCapabilitiesRequest {
    fn default() -> Self {
        Self::new()
    }
}

/// Metadata descriptor of current, implemented Network subsystem capabilities.
///
/// Reflects only existing, verified capabilities (no speculative or future claims).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkCapabilitiesMetadata {
    pub protocol_version: NetworkProtocolVersion,
    pub subsystem_available: bool,
    pub supported_read_operations: Vec<String>,
    pub supported_event_categories: Vec<EventCategory>,
    pub supported_connection_kinds: Vec<ConnectionKind>,
    pub supported_node_roles: Vec<NodeRole>,
    pub telemetry_supported: bool,
    pub event_buffer_capacity: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetCapabilitiesResponse {
    pub capabilities: NetworkCapabilitiesMetadata,
}

// ============================================================================
// 8. Controlled Connection & Pairing Contracts (Phase N10)
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectNodeRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub node_id: NodeId,
}

impl ConnectNodeRequest {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, node_id: NodeId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConnectNodeResponse {
    pub revision: u64,
    pub node: NetworkNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<NetworkConnection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DisconnectNodeRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub node_id: NodeId,
}

impl DisconnectNodeRequest {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, node_id: NodeId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DisconnectNodeResponse {
    pub revision: u64,
    pub node: NetworkNode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetConnectionInfoRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub node_id: NodeId,
}

impl GetConnectionInfoRequest {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }

    pub fn with_request_id(request_id: RequestId, node_id: NodeId) -> Self {
        Self {
            request_id,
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }
}

/// Pure presentation projection of authoritative NetworkState and session metadata
/// for explaining why a node can or cannot be connected. (Zero secrets included).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub node_id: NodeId,
    pub node_name: String,
    pub hostname: String,
    pub ip_addresses: Vec<String>,
    pub port: Option<u16>,
    pub transport_mode: String,
    pub auth_mode: String,
    pub availability: crate::network::model::NodeAvailability,
    pub pairing_state: crate::network::model::PairingState,
    pub auth_state: crate::network::model::AuthenticationState,
    pub last_seen_epoch: u64,
    pub capabilities: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_connection_id: Option<ConnectionId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetConnectionInfoResponse {
    pub revision: u64,
    pub info: ConnectionInfo,
}

// ============================================================================
// 9. Admin Control Plane Contracts (Phase N13)
// ============================================================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecuteAdminCommandRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub command: crate::network::admin::AdminCommandRequest,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecuteAdminCommandResponse {
    pub result: crate::network::admin::AdminCommandResult,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecuteBatchAdminCommandRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub batch: crate::network::admin::AdminBatchCommandRequest,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecuteBatchAdminCommandResponse {
    pub result: crate::network::admin::AdminBatchCommandResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetAdminAuditLogRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetAdminAuditLogResponse {
    pub entries: Vec<crate::network::admin::AdminAuditEntry>,
}

// ============================================================================
// 10. Node Pairing & Cryptographic Trust Contracts (Phase N14)
// ============================================================================

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GetNodeFingerprintRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub target_node_id: Option<NodeId>,
}

impl GetNodeFingerprintRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            target_node_id: None,
        }
    }

    pub fn with_target(target_node_id: NodeId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            target_node_id: Some(target_node_id),
        }
    }
}

impl Default for GetNodeFingerprintRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GetNodeFingerprintResponse {
    pub local_public_key_hex: String,
    pub local_fingerprint: String,
    pub sas_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PairNodeWithKeyRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub node_id: NodeId,
    pub public_key_hex: String,
}

impl PairNodeWithKeyRequest {
    pub fn new(node_id: NodeId, public_key_hex: String) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
            public_key_hex,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PairNodeWithKeyResponse {
    pub node_id: NodeId,
    pub fingerprint: String,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevokeNodeTrustRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
    pub node_id: NodeId,
}

impl RevokeNodeTrustRequest {
    pub fn new(node_id: NodeId) -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
            node_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RevokeNodeTrustResponse {
    pub node_id: NodeId,
    pub revoked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListTrustedPeersRequest {
    pub request_id: RequestId,
    #[serde(default)]
    pub protocol_version: Option<NetworkProtocolVersion>,
}

impl ListTrustedPeersRequest {
    pub fn new() -> Self {
        Self {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::current()),
        }
    }
}

impl Default for ListTrustedPeersRequest {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ListTrustedPeersResponse {
    pub peers: Vec<crate::network::crypto::TrustedPeer>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_response_envelope_serialization() {
        let req_id = RequestId::new("req_test_123");
        let resp_data = ListNodesResponse {
            revision: 42,
            nodes: vec![],
        };
        let envelope = NetworkApiResponse::ok(req_id.clone(), resp_data);

        let json = serde_json::to_string(&envelope).unwrap();
        assert!(json.contains("\"request_id\":\"req_test_123\""));
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"revision\":42"));

        let deserialized: NetworkApiResponse<ListNodesResponse> = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, envelope);
    }
}
