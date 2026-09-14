//! # Network API & Contracts Layer (Phase N7)
//!
//! Provides a stable, Rust-owned, read-only API and contract layer for external consumers:
//! - Tauri / UI (Phase N8+)
//! - Python Brain
//! - Guardian (Phase N12)
//!
//! ## Architectural Invariants
//!
//! - **Authoritative State Invariant**: `NetworkState` remains the single authoritative source of
//!   network reality. The API layer is a thin query and transformation interface, NOT a second state store.
//! - **Authoritative Event Invariant**: `NetworkEventBus` remains the canonical event dispatcher.
//!   Events are ephemeral occurrence notifications, not persistent state.
//! - **Zero Side-Effects Invariant**: All N7 API query methods are strictly read-only and perform
//!   no mutation on `NetworkState`.
//! - **Lock Safety**: State reads clone detached data structures before returning; no locks are held
//!   across serialization or event streaming boundaries.

pub mod contracts;
pub mod error;
pub mod version;

pub use contracts::*;
pub use error::{NetworkApiError, NetworkApiResult};
pub use version::NetworkProtocolVersion;

use crate::network::admin::AdminCommandController;
use crate::network::cluster::{ClusterManager, HeartbeatConfig};
use crate::network::event::{DEFAULT_EVENT_BUFFER_CAPACITY, EventSubscriber, NetworkEventBus};
use crate::network::model::{ConnectionKind, EventCategory, NodeRole};
use crate::network::state::SharedNetworkState;

/// Thin, thread-safe Network API service bridging external consumers to authoritative
/// runtime state and event stream.
#[derive(Debug, Clone)]
pub struct NetworkApi {
    state: SharedNetworkState,
    events: NetworkEventBus,
    cluster: ClusterManager,
    admin: AdminCommandController,
}

impl NetworkApi {
    /// Create a new Network API service bound to the authoritative network state and event bus
    pub fn new(state: SharedNetworkState, events: NetworkEventBus) -> Self {
        let cluster = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events.clone());
        let admin = AdminCommandController::new_with_bus(state.clone(), events.clone());
        Self { state, events, cluster, admin }
    }

    /// Create a new Network API service with an explicit ClusterManager instance
    pub fn new_with_cluster(state: SharedNetworkState, events: NetworkEventBus, cluster: ClusterManager) -> Self {
        let admin = AdminCommandController::new_with_bus(state.clone(), events.clone());
        Self { state, events, cluster, admin }
    }

    /// Create a new Network API service with explicit ClusterManager and AdminCommandController
    pub fn new_with_admin(
        state: SharedNetworkState,
        events: NetworkEventBus,
        cluster: ClusterManager,
        admin: AdminCommandController,
    ) -> Self {
        Self { state, events, cluster, admin }
    }

    /// Access the underlying SharedNetworkState handle
    pub fn state(&self) -> &SharedNetworkState {
        &self.state
    }

    /// Access the underlying NetworkEventBus handle
    pub fn events(&self) -> &NetworkEventBus {
        &self.events
    }

    /// Access the underlying ClusterManager handle
    pub fn cluster(&self) -> &ClusterManager {
        &self.cluster
    }

    /// Access the underlying AdminCommandController handle
    pub fn admin(&self) -> &AdminCommandController {
        &self.admin
    }

    /// Helper to validate protocol version compatibility on incoming requests
    fn validate_version(&self, req_version: Option<NetworkProtocolVersion>) -> Result<(), NetworkApiError> {
        if let Some(ver) = req_version {
            if !ver.is_compatible() {
                return Err(NetworkApiError::UnsupportedVersion {
                    requested: ver.to_string(),
                    supported: NetworkProtocolVersion::current().to_string(),
                });
            }
        }
        Ok(())
    }

    // ========================================================================
    // 1. Snapshot Operations
    // ========================================================================

    /// Obtain a coherent, point-in-time snapshot of the authoritative NetworkState
    pub fn get_snapshot(&self, req: GetNetworkSnapshotRequest) -> Result<GetNetworkSnapshotResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let snapshot = self.state.get_snapshot();
        Ok(GetNetworkSnapshotResponse { snapshot })
    }

    /// Obtain a coherent snapshot wrapped in the standardized response envelope
    pub fn get_snapshot_envelope(
        &self,
        req: GetNetworkSnapshotRequest,
    ) -> NetworkApiResponse<GetNetworkSnapshotResponse> {
        let request_id = req.request_id.clone();
        match self.get_snapshot(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 2. Node Query Operations
    // ========================================================================

    /// List all authoritative cluster nodes
    pub fn list_nodes(&self, req: ListNodesRequest) -> Result<ListNodesResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let nodes = self.state.list_nodes();
        Ok(ListNodesResponse { revision, nodes })
    }

    /// List all authoritative cluster nodes wrapped in response envelope
    pub fn list_nodes_envelope(&self, req: ListNodesRequest) -> NetworkApiResponse<ListNodesResponse> {
        let request_id = req.request_id.clone();
        match self.list_nodes(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Retrieve a specific cluster node by NodeId
    pub fn get_node(&self, req: GetNodeRequest) -> Result<GetNodeResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let node = self.state.get_node(&req.node_id).ok_or_else(|| {
            NetworkApiError::not_found("node", req.node_id.as_str())
        })?;
        Ok(GetNodeResponse { revision, node })
    }

    /// Retrieve a specific cluster node wrapped in response envelope
    pub fn get_node_envelope(&self, req: GetNodeRequest) -> NetworkApiResponse<GetNodeResponse> {
        let request_id = req.request_id.clone();
        match self.get_node(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 3. Device Query Operations
    // ========================================================================

    /// List all discovered network devices
    pub fn list_devices(&self, req: ListDevicesRequest) -> Result<ListDevicesResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let devices = self.state.list_devices();
        Ok(ListDevicesResponse { revision, devices })
    }

    /// List all discovered network devices wrapped in response envelope
    pub fn list_devices_envelope(&self, req: ListDevicesRequest) -> NetworkApiResponse<ListDevicesResponse> {
        let request_id = req.request_id.clone();
        match self.list_devices(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Retrieve a specific network device by DeviceId
    pub fn get_device(&self, req: GetDeviceRequest) -> Result<GetDeviceResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let device = self.state.get_device(&req.device_id).ok_or_else(|| {
            NetworkApiError::not_found("device", req.device_id.as_str())
        })?;
        Ok(GetDeviceResponse { revision, device })
    }

    /// Retrieve a specific network device wrapped in response envelope
    pub fn get_device_envelope(&self, req: GetDeviceRequest) -> NetworkApiResponse<GetDeviceResponse> {
        let request_id = req.request_id.clone();
        match self.get_device(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 4. Connection Query Operations
    // ========================================================================

    /// List all active network connections and socket flows
    pub fn list_connections(&self, req: ListConnectionsRequest) -> Result<ListConnectionsResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let connections = self.state.list_connections();
        Ok(ListConnectionsResponse {
            revision,
            connections,
        })
    }

    /// List all active network connections wrapped in response envelope
    pub fn list_connections_envelope(
        &self,
        req: ListConnectionsRequest,
    ) -> NetworkApiResponse<ListConnectionsResponse> {
        let request_id = req.request_id.clone();
        match self.list_connections(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Retrieve a specific network connection by ConnectionId
    pub fn get_connection(&self, req: GetConnectionRequest) -> Result<GetConnectionResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let connection = self.state.get_connection(&req.connection_id).ok_or_else(|| {
            NetworkApiError::not_found("connection", req.connection_id.as_str())
        })?;
        Ok(GetConnectionResponse {
            revision,
            connection,
        })
    }

    /// Retrieve a specific network connection wrapped in response envelope
    pub fn get_connection_envelope(&self, req: GetConnectionRequest) -> NetworkApiResponse<GetConnectionResponse> {
        let request_id = req.request_id.clone();
        match self.get_connection(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 5. Interface Query Operations
    // ========================================================================

    /// List all authoritative host network interface adapters
    pub fn list_interfaces(&self, req: ListInterfacesRequest) -> Result<ListInterfacesResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let interfaces = self.state.list_interfaces();
        Ok(ListInterfacesResponse {
            revision,
            interfaces,
        })
    }

    /// List all authoritative host network interface adapters wrapped in response envelope
    pub fn list_interfaces_envelope(&self, req: ListInterfacesRequest) -> NetworkApiResponse<ListInterfacesResponse> {
        let request_id = req.request_id.clone();
        match self.list_interfaces(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Retrieve a specific network interface adapter by NetworkInterfaceId
    pub fn get_interface(&self, req: GetInterfaceRequest) -> Result<GetInterfaceResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let interface = self.state.get_interface(&req.interface_id).ok_or_else(|| {
            NetworkApiError::not_found("interface", req.interface_id.as_str())
        })?;
        Ok(GetInterfaceResponse {
            revision,
            interface,
        })
    }

    /// Retrieve a specific network interface adapter wrapped in response envelope
    pub fn get_interface_envelope(&self, req: GetInterfaceRequest) -> NetworkApiResponse<GetInterfaceResponse> {
        let request_id = req.request_id.clone();
        match self.get_interface(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 6. Traffic Query Operations
    // ========================================================================

    /// Retrieve authoritative aggregate traffic metrics
    pub fn get_traffic(&self, req: GetTrafficRequest) -> Result<GetTrafficResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revision = self.state.revision();
        let traffic = self.state.traffic();
        Ok(GetTrafficResponse { revision, traffic })
    }

    /// Retrieve authoritative aggregate traffic metrics wrapped in response envelope
    pub fn get_traffic_envelope(&self, req: GetTrafficRequest) -> NetworkApiResponse<GetTrafficResponse> {
        let request_id = req.request_id.clone();
        match self.get_traffic(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 7. Capabilities & Metadata Operations
    // ========================================================================

    /// Query the current metadata and verified capabilities of the Network subsystem
    pub fn get_capabilities(
        &self,
        req: GetCapabilitiesRequest,
    ) -> Result<GetCapabilitiesResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let capabilities = NetworkCapabilitiesMetadata {
            protocol_version: NetworkProtocolVersion::current(),
            subsystem_available: true,
            supported_read_operations: vec![
                "get_snapshot".to_string(),
                "list_nodes".to_string(),
                "get_node".to_string(),
                "list_devices".to_string(),
                "get_device".to_string(),
                "list_connections".to_string(),
                "get_connection".to_string(),
                "list_interfaces".to_string(),
                "get_interface".to_string(),
                "get_traffic".to_string(),
                "get_capabilities".to_string(),
            ],
            supported_event_categories: vec![
                EventCategory::Cluster,
                EventCategory::Network,
                EventCategory::Discovery,
                EventCategory::Telemetry,
                EventCategory::Connection,
                EventCategory::Security,
                EventCategory::Admin,
                EventCategory::System,
            ],
            supported_connection_kinds: vec![
                ConnectionKind::LocalSocketFlow,
                ConnectionKind::ClusterTransport,
                ConnectionKind::IpcStream,
                ConnectionKind::WebSocketBridge,
            ],
            supported_node_roles: vec![
                NodeRole::Standalone,
                NodeRole::Admin,
                NodeRole::Worker,
                NodeRole::Peer,
            ],
            telemetry_supported: true,
            event_buffer_capacity: DEFAULT_EVENT_BUFFER_CAPACITY,
        };
        Ok(GetCapabilitiesResponse { capabilities })
    }

    /// Query metadata and capabilities wrapped in response envelope
    pub fn get_capabilities_envelope(
        &self,
        req: GetCapabilitiesRequest,
    ) -> NetworkApiResponse<GetCapabilitiesResponse> {
        let request_id = req.request_id.clone();
        match self.get_capabilities(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 8. Controlled Connection & Pairing Operations (Phase N10)
    // ========================================================================

    /// Execute the complete canonical connection workflow for an eligible node:
    /// Available/Disconnected -> Pairing -> Authenticating -> Connected.
    pub fn connect_node(&self, req: ConnectNodeRequest) -> Result<ConnectNodeResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let (node, connection) = self.cluster.connect_node(&req.node_id).map_err(|e| {
            NetworkApiError::internal(format!("Connect node failed: {}", e))
        })?;
        let revision = self.state.revision();
        Ok(ConnectNodeResponse { revision, node, connection })
    }

    /// Execute the complete canonical connection workflow wrapped in response envelope
    pub fn connect_node_envelope(&self, req: ConnectNodeRequest) -> NetworkApiResponse<ConnectNodeResponse> {
        let request_id = req.request_id.clone();
        match self.connect_node(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Disconnect an active cluster node: Connected -> Disconnected.
    pub fn disconnect_node(&self, req: DisconnectNodeRequest) -> Result<DisconnectNodeResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let node = self.cluster.disconnect_node(&req.node_id).map_err(|e| {
            NetworkApiError::internal(format!("Disconnect node failed: {}", e))
        })?;
        let revision = self.state.revision();
        Ok(DisconnectNodeResponse { revision, node })
    }

    /// Disconnect an active cluster node wrapped in response envelope
    pub fn disconnect_node_envelope(&self, req: DisconnectNodeRequest) -> NetworkApiResponse<DisconnectNodeResponse> {
        let request_id = req.request_id.clone();
        match self.disconnect_node(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Project pure non-secret connection and session information for a node.
    pub fn get_connection_info(&self, req: GetConnectionInfoRequest) -> Result<GetConnectionInfoResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let info = self.cluster.get_connection_info(&req.node_id).map_err(|_e| {
            NetworkApiError::not_found("node_connection_info", req.node_id.as_str())
        })?;
        let revision = self.state.revision();
        Ok(GetConnectionInfoResponse { revision, info })
    }

    /// Project connection info wrapped in response envelope
    pub fn get_connection_info_envelope(&self, req: GetConnectionInfoRequest) -> NetworkApiResponse<GetConnectionInfoResponse> {
        let request_id = req.request_id.clone();
        match self.get_connection_info(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 9. Admin Control Plane Operations (Phase N13)
    // ========================================================================

    /// Execute a single-target administrative capability command
    pub async fn execute_admin_command(
        &self,
        req: ExecuteAdminCommandRequest,
    ) -> Result<ExecuteAdminCommandResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let result = self.admin.execute_command(req.command).await;
        Ok(ExecuteAdminCommandResponse { result })
    }

    /// Execute a single-target administrative capability command wrapped in response envelope
    pub async fn execute_admin_command_envelope(
        &self,
        req: ExecuteAdminCommandRequest,
    ) -> NetworkApiResponse<ExecuteAdminCommandResponse> {
        let request_id = req.request_id.clone();
        match self.execute_admin_command(req).await {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Execute a batch administrative capability command with bounded concurrency
    pub async fn execute_batch_admin_command(
        &self,
        req: ExecuteBatchAdminCommandRequest,
    ) -> Result<ExecuteBatchAdminCommandResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let result = self.admin.execute_batch_command(req.batch).await;
        Ok(ExecuteBatchAdminCommandResponse { result })
    }

    /// Execute a batch administrative capability command wrapped in response envelope
    pub async fn execute_batch_admin_command_envelope(
        &self,
        req: ExecuteBatchAdminCommandRequest,
    ) -> NetworkApiResponse<ExecuteBatchAdminCommandResponse> {
        let request_id = req.request_id.clone();
        match self.execute_batch_admin_command(req).await {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Retrieve the in-memory/recent operational admin audit log records
    pub fn get_admin_audit_log(
        &self,
        req: GetAdminAuditLogRequest,
    ) -> Result<GetAdminAuditLogResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let entries = crate::network::admin::global_admin_audit_logger().get_recent(req.limit);
        Ok(GetAdminAuditLogResponse { entries })
    }

    /// Retrieve operational admin audit log records wrapped in response envelope
    pub fn get_admin_audit_log_envelope(
        &self,
        req: GetAdminAuditLogRequest,
    ) -> NetworkApiResponse<GetAdminAuditLogResponse> {
        let request_id = req.request_id.clone();
        match self.get_admin_audit_log(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 10. Node Pairing & Cryptographic Trust Operations (Phase N14)
    // ========================================================================

    /// Inspect local node cryptographic fingerprint and derive SAS code if target node specified
    pub fn get_node_fingerprint(
        &self,
        req: GetNodeFingerprintRequest,
    ) -> Result<GetNodeFingerprintResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let local_keypair = crate::network::crypto::NodeKeypair::load_or_generate(
            &crate::network::crypto::NodeKeypair::default_key_path(),
        )
        .unwrap_or_else(|_| crate::network::crypto::NodeKeypair::generate().unwrap());

        let local_public_key_hex = local_keypair.public.to_hex();
        let local_fingerprint = local_keypair.public.fingerprint();

        let sas_code = if let Some(target_id) = req.target_node_id {
            if let Some(target_peer) = self.cluster.get_trusted_peer(&target_id) {
                Some(crate::network::crypto::derive_sas(
                    &local_keypair.public,
                    &target_peer.static_public_key,
                ))
            } else {
                None
            }
        } else {
            None
        };

        Ok(GetNodeFingerprintResponse {
            local_public_key_hex,
            local_fingerprint,
            sas_code,
        })
    }

    /// Inspect node fingerprint wrapped in response envelope
    pub fn get_node_fingerprint_envelope(
        &self,
        req: GetNodeFingerprintRequest,
    ) -> NetworkApiResponse<GetNodeFingerprintResponse> {
        let request_id = req.request_id.clone();
        match self.get_node_fingerprint(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Explicitly pair a node with its verified static public key
    pub fn pair_node_with_key(
        &self,
        req: PairNodeWithKeyRequest,
    ) -> Result<PairNodeWithKeyResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let public_key = crate::network::crypto::PublicKey::from_hex(&req.public_key_hex)
            .map_err(|e| NetworkApiError::internal(format!("Invalid public key hex: {}", e)))?;

        let fingerprint = public_key.fingerprint();
        self.cluster
            .pair_node_with_key(&req.node_id, public_key)
            .map_err(|e| NetworkApiError::internal(format!("Pair node failed: {}", e)))?;

        Ok(PairNodeWithKeyResponse {
            node_id: req.node_id,
            fingerprint,
            status: "paired_trusted".into(),
        })
    }

    /// Pair node with key wrapped in response envelope
    pub fn pair_node_with_key_envelope(
        &self,
        req: PairNodeWithKeyRequest,
    ) -> NetworkApiResponse<PairNodeWithKeyResponse> {
        let request_id = req.request_id.clone();
        match self.pair_node_with_key(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// Explicitly revoke trust for a peer node
    pub fn revoke_node_trust(
        &self,
        req: RevokeNodeTrustRequest,
    ) -> Result<RevokeNodeTrustResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let revoked = self.cluster.revoke_peer_trust(&req.node_id);
        Ok(RevokeNodeTrustResponse {
            node_id: req.node_id,
            revoked,
        })
    }

    /// Revoke node trust wrapped in response envelope
    pub fn revoke_node_trust_envelope(
        &self,
        req: RevokeNodeTrustRequest,
    ) -> NetworkApiResponse<RevokeNodeTrustResponse> {
        let request_id = req.request_id.clone();
        match self.revoke_node_trust(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    /// List all trusted peers and their key binding status
    pub fn list_trusted_peers(
        &self,
        req: ListTrustedPeersRequest,
    ) -> Result<ListTrustedPeersResponse, NetworkApiError> {
        self.validate_version(req.protocol_version)?;
        let peers = self.cluster.list_trusted_peers();
        Ok(ListTrustedPeersResponse { peers })
    }

    /// List trusted peers wrapped in response envelope
    pub fn list_trusted_peers_envelope(
        &self,
        req: ListTrustedPeersRequest,
    ) -> NetworkApiResponse<ListTrustedPeersResponse> {
        let request_id = req.request_id.clone();
        match self.list_trusted_peers(req) {
            Ok(resp) => NetworkApiResponse::ok(request_id, resp),
            Err(err) => NetworkApiResponse::err(request_id, err),
        }
    }

    // ========================================================================
    // 11. Event Subscription
    // ========================================================================

    /// Subscribe to the canonical NetworkEvent stream emitted by the NetworkEventBus.
    ///
    /// Semantics:
    /// - Delivers canonical `NetworkEvent` records with sequence, timestamp, category, and state_revision.
    /// - Memory bounded: slow consumers lag and receive `EventRecvError::Lagged(n)`.
    /// - Clients should resynchronize from a snapshot upon encountering lag.
    pub fn subscribe(&self) -> EventSubscriber {
        self.events.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::event::EventTryRecvError;
    use crate::network::ids::{ConnectionId, DeviceId, NetworkInterfaceId, NodeId, RequestId};
    use crate::network::model::{
        ConnectionDirection, ConnectionKind, DeviceCategory, DiscoverySource, EventCategory,
        EventSeverity, NetworkConnection, NetworkDevice, NetworkEvent, NetworkEventType,
        NetworkNode, NodeAvailability, NodeRole, TrafficMetrics,
    };
    use crate::network::types::{FlowProtocol, FlowState, NetworkInterfaceInfo};
    use std::sync::Arc;

    fn setup_test_api() -> (NetworkApi, SharedNetworkState, NetworkEventBus) {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::default();
        let api = NetworkApi::new(state.clone(), events.clone());
        (api, state, events)
    }

    // A. RequestId uniqueness
    #[test]
    fn test_a_request_id_uniqueness() {
        let id1 = RequestId::random();
        let id2 = RequestId::random();
        assert_ne!(id1, id2);
        assert!(id1.as_str().starts_with("req_"));
        assert!(id2.as_str().starts_with("req_"));

        let explicit = RequestId::new("req_custom_001");
        assert_eq!(explicit.as_str(), "req_custom_001");
        assert_eq!(explicit.to_string(), "req_custom_001");
    }

    // B. Request/response correlation
    #[test]
    fn test_b_request_response_correlation() {
        let (api, _, _) = setup_test_api();
        let custom_req_id = RequestId::new("req_corr_test_999");
        let req = GetNetworkSnapshotRequest::with_request_id(custom_req_id.clone());

        let envelope = api.get_snapshot_envelope(req);
        assert_eq!(envelope.request_id, custom_req_id);
        assert!(envelope.success);
        assert!(envelope.data.is_some());
        assert!(envelope.error.is_none());
        assert_eq!(envelope.protocol_version, NetworkProtocolVersion::current());
        assert!(envelope.timestamp_epoch_ms > 0);
    }

    // C. Protocol version acceptance
    #[test]
    fn test_c_protocol_version_acceptance() {
        let (api, _, _) = setup_test_api();
        let req = GetCapabilitiesRequest {
            request_id: RequestId::random(),
            protocol_version: Some(NetworkProtocolVersion::new(1, 0)),
        };
        let res = api.get_capabilities(req);
        assert!(res.is_ok());
        let cap = res.unwrap().capabilities;
        assert_eq!(cap.protocol_version, NetworkProtocolVersion::new(1, 0));
        assert!(cap.subsystem_available);
    }

    // D. Unsupported version returns structured error
    #[test]
    fn test_d_unsupported_version_returns_structured_error() {
        let (api, _, _) = setup_test_api();
        let bad_ver_req = GetCapabilitiesRequest {
            request_id: RequestId::new("req_bad_ver"),
            protocol_version: Some(NetworkProtocolVersion::new(2, 0)),
        };
        let res = api.get_capabilities(bad_ver_req.clone());
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert_eq!(
            err,
            NetworkApiError::UnsupportedVersion {
                requested: "2.0".to_string(),
                supported: "1.0".to_string(),
            }
        );

        let envelope = api.get_capabilities_envelope(bad_ver_req);
        assert!(!envelope.success);
        assert!(envelope.data.is_none());
        assert_eq!(
            envelope.error,
            Some(NetworkApiError::UnsupportedVersion {
                requested: "2.0".to_string(),
                supported: "1.0".to_string(),
            })
        );
    }

    // E. Network snapshot is coherent & F. Snapshot revision is exposed correctly
    #[test]
    fn test_e_f_network_snapshot_coherence_and_revision() {
        let (api, state, _) = setup_test_api();

        // Populate initial state
        let node_id = NodeId::new("node_alpha");
        let mut node = NetworkNode::new(node_id.clone(), "Alpha", "ALPHA-PC", "windows", "x86_64");
        node.availability = NodeAvailability::Available;
        state.upsert_node(node).unwrap();

        let dev_id = DeviceId::from_mac("AA:BB:CC:DD:EE:FF").unwrap();
        let mut dev = NetworkDevice::new(dev_id.clone(), "192.168.1.50");
        dev.mac_address = Some("aa:bb:cc:dd:ee:ff".to_string());
        dev.hostname = Some("Printer".to_string());
        dev.category = DeviceCategory::Printer;
        dev.source = DiscoverySource::ArpTable;
        state.upsert_device(dev).unwrap();

        let initial_rev = state.revision();
        assert_eq!(initial_rev, 2);

        let req = GetNetworkSnapshotRequest::new();
        let resp = api.get_snapshot(req).unwrap();
        assert_eq!(resp.snapshot.revision, initial_rev);
        assert_eq!(resp.snapshot.nodes.len(), 1);
        assert_eq!(resp.snapshot.nodes[0].id, node_id);
        assert_eq!(resp.snapshot.devices.len(), 1);
        assert_eq!(resp.snapshot.devices[0].id, dev_id);
        assert!(resp.snapshot.captured_at_epoch_ms > 0);
    }

    // G. Node query works
    #[test]
    fn test_g_node_queries() {
        let (api, state, _) = setup_test_api();
        let node_id = NodeId::new("node_query_target");
        let mut node = NetworkNode::new(node_id.clone(), "Target Node", "TGT-PC", "linux", "x86_64");
        node.role = NodeRole::Worker;
        state.upsert_node(node.clone()).unwrap();

        // List nodes
        let list_resp = api.list_nodes(ListNodesRequest::new()).unwrap();
        assert_eq!(list_resp.nodes.len(), 1);
        assert_eq!(list_resp.nodes[0].id, node_id);

        // Get existing node
        let get_resp = api.get_node(GetNodeRequest::new(node_id.clone())).unwrap();
        assert_eq!(get_resp.node.id, node_id);
        assert_eq!(get_resp.node.role, NodeRole::Worker);

        // Get nonexistent node returns structured ResourceNotFound
        let missing_id = NodeId::new("nonexistent_node");
        let err = api.get_node(GetNodeRequest::new(missing_id.clone())).unwrap_err();
        assert_eq!(
            err,
            NetworkApiError::ResourceNotFound {
                resource_type: "node".to_string(),
                id: "nonexistent_node".to_string(),
            }
        );
    }

    // H. Device query works
    #[test]
    fn test_h_device_queries() {
        let (api, state, _) = setup_test_api();
        let dev_id = DeviceId::from_mac("11:22:33:44:55:66").unwrap();
        let mut dev = NetworkDevice::new(dev_id.clone(), "10.0.0.5");
        dev.mac_address = Some("11:22:33:44:55:66".to_string());
        dev.hostname = Some("Router".to_string());
        dev.category = DeviceCategory::Router;
        dev.source = DiscoverySource::ArpTable;
        state.upsert_device(dev).unwrap();

        // List devices
        let list_resp = api.list_devices(ListDevicesRequest::new()).unwrap();
        assert_eq!(list_resp.devices.len(), 1);
        assert_eq!(list_resp.devices[0].id, dev_id);

        // Get existing device
        let get_resp = api.get_device(GetDeviceRequest::new(dev_id.clone())).unwrap();
        assert_eq!(get_resp.device.id, dev_id);

        // Get nonexistent device returns ResourceNotFound
        let missing_id = DeviceId::new("dev_missing");
        let err = api.get_device(GetDeviceRequest::new(missing_id.clone())).unwrap_err();
        assert_eq!(
            err,
            NetworkApiError::ResourceNotFound {
                resource_type: "device".to_string(),
                id: "dev_missing".to_string(),
            }
        );
    }

    // I. Connection query works
    #[test]
    fn test_i_connection_queries() {
        let (api, state, _) = setup_test_api();
        let conn_id = ConnectionId::new("conn_test_01");
        let mut conn = NetworkConnection::new(
            conn_id.clone(),
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "127.0.0.1",
            9000,
            FlowState::Established,
        );
        conn.remote_addr = Some("127.0.0.1".to_string());
        conn.remote_port = Some(9001);
        conn.direction = ConnectionDirection::Outbound;
        state.upsert_connection(conn).unwrap();

        // List connections
        let list_resp = api.list_connections(ListConnectionsRequest::new()).unwrap();
        assert_eq!(list_resp.connections.len(), 1);
        assert_eq!(list_resp.connections[0].id, conn_id);

        // Get connection
        let get_resp = api.get_connection(GetConnectionRequest::new(conn_id.clone())).unwrap();
        assert_eq!(get_resp.connection.id, conn_id);

        // Get missing connection
        let missing = ConnectionId::new("conn_missing");
        let err = api.get_connection(GetConnectionRequest::new(missing)).unwrap_err();
        assert_eq!(
            err,
            NetworkApiError::ResourceNotFound {
                resource_type: "connection".to_string(),
                id: "conn_missing".to_string(),
            }
        );
    }

    // J. Interface query works
    #[test]
    fn test_j_interface_queries() {
        let (api, state, _) = setup_test_api();
        let iface_id = NetworkInterfaceId::new("eth0");
        let iface = NetworkInterfaceInfo {
            id: "eth0".to_string(),
            name: "eth0".to_string(),
            description: Some("Ethernet Adapter".to_string()),
            mac_address: Some("AA:BB:CC:DD:EE:01".to_string()),
            interface_type: crate::network::types::InterfaceType::Ethernet,
            status: crate::network::types::OperationalStatus::Up,
            is_up: true,
            is_physical: true,
            is_loopback: false,
            is_default_gateway: false,
            ipv4_addresses: vec!["192.168.1.10".to_string()],
            ipv6_addresses: vec![],
            gateway: None,
            dns_servers: vec![],
            mtu: Some(1500),
            link_speed_mbps: Some(1000),
            total_received_bytes: 10000,
            total_transmitted_bytes: 5000,
            rates: None,
        };
        state.upsert_interface(iface).unwrap();

        // List interfaces
        let list_resp = api.list_interfaces(ListInterfacesRequest::new()).unwrap();
        assert_eq!(list_resp.interfaces.len(), 1);
        assert_eq!(list_resp.interfaces[0].id, "eth0");

        // Get interface
        let get_resp = api.get_interface(GetInterfaceRequest::new(iface_id.clone())).unwrap();
        assert_eq!(get_resp.interface.name, "eth0");

        // Missing interface
        let missing = NetworkInterfaceId::new("eth99");
        let err = api.get_interface(GetInterfaceRequest::new(missing)).unwrap_err();
        assert_eq!(
            err,
            NetworkApiError::ResourceNotFound {
                resource_type: "interface".to_string(),
                id: "eth99".to_string(),
            }
        );
    }

    // K. Traffic query works
    #[test]
    fn test_k_traffic_queries() {
        let (api, state, _) = setup_test_api();
        let mut traffic = TrafficMetrics::default();
        traffic.rx_bytes = 5000;
        traffic.tx_bytes = 2500;
        state.update_traffic(traffic).unwrap();

        let resp = api.get_traffic(GetTrafficRequest::new()).unwrap();
        assert_eq!(resp.traffic.rx_bytes, 5000);
        assert_eq!(resp.traffic.tx_bytes, 2500);
    }

    // L. Event subscription exposes canonical NetworkEvent
    // M. Event sequence is preserved
    // N. Event state_revision is preserved
    #[test]
    fn test_l_m_n_event_subscription_canonical_events() {
        let (api, _, events) = setup_test_api();
        let mut sub = api.subscribe();

        // Publish event with known state_revision
        let mut event = NetworkEvent::new(
            EventCategory::Cluster,
            NetworkEventType::NodeAvailable,
            EventSeverity::Info,
            "Worker 1 available",
        );
        event.state_revision = Some(42);
        event.details = serde_json::json!({ "node_name": "Worker 1" });

        events.publish(event.clone());

        let received = sub.try_recv().unwrap();
        assert_eq!(received.event_id, event.event_id);
        assert_eq!(received.event_type, NetworkEventType::NodeAvailable);
        assert_eq!(received.category, EventCategory::Cluster);
        assert_eq!(received.state_revision, Some(42));
        assert_eq!(received.sequence, 1);
        assert!(received.timestamp_epoch_ms > 0);
        assert_eq!(received.details["node_name"], "Worker 1");
    }

    // O. Subscriber lag is represented correctly
    #[test]
    fn test_o_subscriber_lag_handling() {
        let state = SharedNetworkState::new();
        // Create event bus with small capacity 2
        let events = NetworkEventBus::new(2);
        let api = NetworkApi::new(state, events.clone());

        let mut slow_sub = api.subscribe();

        // Emit 5 events overflowing the buffer of size 2
        for i in 1..=5 {
            let mut evt = NetworkEvent::new(
                EventCategory::Cluster,
                NetworkEventType::HeartbeatMissed,
                EventSeverity::Warning,
                format!("Heartbeat missed {}", i),
            );
            evt.details = serde_json::json!({ "index": i });
            events.publish(evt);
        }

        // Subscriber should detect lag and report dropped count
        match slow_sub.try_recv() {
            Err(EventTryRecvError::Lagged(dropped)) => {
                assert!(dropped >= 3);
                assert!(slow_sub.dropped_count() >= 3);
            }
            other => panic!("Expected EventTryRecvError::Lagged, got {:?}", other),
        }

        // Once lag is acknowledged, subsequent buffered message is delivered
        let next_evt = slow_sub.try_recv().unwrap();
        assert_eq!(next_evt.sequence, 4);
    }

    // P. API does not mutate NetworkState for read-only calls
    #[test]
    fn test_p_read_only_invariant() {
        let (api, state, _) = setup_test_api();
        let initial_rev = state.revision();

        // Execute every read API method
        let _ = api.get_snapshot(GetNetworkSnapshotRequest::new());
        let _ = api.list_nodes(ListNodesRequest::new());
        let _ = api.get_node(GetNodeRequest::new(NodeId::new("none")));
        let _ = api.list_devices(ListDevicesRequest::new());
        let _ = api.get_device(GetDeviceRequest::new(DeviceId::new("none")));
        let _ = api.list_connections(ListConnectionsRequest::new());
        let _ = api.get_connection(GetConnectionRequest::new(ConnectionId::new("none")));
        let _ = api.list_interfaces(ListInterfacesRequest::new());
        let _ = api.get_interface(GetInterfaceRequest::new(NetworkInterfaceId::new("none")));
        let _ = api.get_traffic(GetTrafficRequest::new());
        let _ = api.get_capabilities(GetCapabilitiesRequest::new());

        // Revision and state MUST remain completely untouched
        assert_eq!(state.revision(), initial_rev);
    }

    // Q. Concurrent snapshot requests are safe
    #[test]
    fn test_q_concurrent_snapshot_safety() {
        let (api, state, _) = setup_test_api();

        for i in 0..20 {
            let node_id = NodeId::new(format!("node_{}", i));
            let node = NetworkNode::new(node_id, format!("Node {}", i), "PC", "linux", "x86_64");
            state.upsert_node(node).unwrap();
        }

        let api_arc = Arc::new(api);
        let mut handles = vec![];

        for _ in 0..10 {
            let api_clone = Arc::clone(&api_arc);
            let handle = std::thread::spawn(move || {
                for _ in 0..50 {
                    let snap = api_clone.get_snapshot(GetNetworkSnapshotRequest::new()).unwrap();
                    assert_eq!(snap.snapshot.nodes.len(), 20);
                }
            });
            handles.push(handle);
        }

        for h in handles {
            h.join().unwrap();
        }
    }

    // R. Error serialization does not leak secrets
    #[test]
    fn test_r_error_serialization_no_secret_leak() {
        let err = NetworkApiError::Internal {
            message: "Authentication handshake failed".to_string(),
        };
        let serialized = serde_json::to_string(&err).unwrap();
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("private_key"));
        assert!(!serialized.contains("token"));

        let envelope: NetworkApiResponse<()> = NetworkApiResponse::err(
            RequestId::new("req_err_sec"),
            NetworkApiError::ResourceNotFound {
                resource_type: "device".to_string(),
                id: "dev_99".to_string(),
            },
        );
        let env_json = serde_json::to_string(&envelope).unwrap();
        assert!(env_json.contains("\"success\":false"));
        assert!(env_json.contains("\"resource_type\":\"device\""));
    }

    // S. Connect Node API Workflow
    #[test]
    fn test_s_connect_node_api_workflow() {
        let (api, state, _) = setup_test_api();
        let node_id = NodeId::new("node_api_connect");
        let mut node = NetworkNode::new(node_id.clone(), "API Connect Node", "API-PC", "linux", "x86_64");
        node.availability = NodeAvailability::Available;
        node.ip_addresses = vec!["192.168.1.120".into()];
        state.upsert_node(node).unwrap();

        let req = ConnectNodeRequest::new(node_id.clone());
        let envelope = api.connect_node_envelope(req);
        assert!(envelope.success);
        let data = envelope.data.unwrap();
        assert_eq!(data.node.availability, NodeAvailability::Connected);
        assert!(data.connection.is_some());
        assert_eq!(data.connection.unwrap().associated_node_id, Some(node_id.clone()));
    }

    // T. Disconnect Node API Workflow
    #[test]
    fn test_t_disconnect_node_api_workflow() {
        let (api, state, _) = setup_test_api();
        let node_id = NodeId::new("node_api_disc");
        let mut node = NetworkNode::new(node_id.clone(), "API Disc Node", "API-PC", "linux", "x86_64");
        node.availability = NodeAvailability::Available;
        state.upsert_node(node).unwrap();

        // Connect first
        api.connect_node(ConnectNodeRequest::new(node_id.clone())).unwrap();

        // Disconnect
        let req = DisconnectNodeRequest::new(node_id.clone());
        let envelope = api.disconnect_node_envelope(req);
        assert!(envelope.success);
        let data = envelope.data.unwrap();
        assert_eq!(data.node.availability, NodeAvailability::Disconnected);
    }

    // U. Get Connection Info API Projection
    #[test]
    fn test_u_get_connection_info_api_projection() {
        let (api, state, _) = setup_test_api();
        let node_id = NodeId::new("node_api_info");
        let mut node = NetworkNode::new(node_id.clone(), "API Info Node", "API-PC", "windows", "x86_64");
        node.availability = NodeAvailability::Available;
        node.ip_addresses = vec!["10.0.0.75".into()];
        state.upsert_node(node).unwrap();

        let req = GetConnectionInfoRequest::new(node_id.clone());
        let envelope = api.get_connection_info_envelope(req);
        assert!(envelope.success);
        let data = envelope.data.unwrap();
        assert_eq!(data.info.node_id, node_id);
        assert_eq!(data.info.availability, NodeAvailability::Available);
        assert_eq!(data.info.transport_mode, "legacy_compatibility");
        assert_eq!(data.info.auth_mode, "compatibility");
    }
}

