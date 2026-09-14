//! # Fluffy Network Subsystem
//!
//! The authoritative Rust Network subsystem for Fluffy Assistant.
//!
//! ## Subsystem Responsibilities
//!
//! - **Canonical Domain Model**: Strongly typed representations of cluster nodes,
//!   network devices, logical connections, traffic attribution, events, and security observations.
//! - **Local Host Observability**: Native, read-only extraction of network interfaces,
//!   traffic throughput rates, passive ARP neighbor discovery, active socket flows,
//!   Wi-Fi profiles (non-secret metadata), and bounded packet monitoring.
//! - **Transport Configuration**: Centralized definition of transport endpoints, ports,
//!   and bind addresses across IPC, cluster mesh, WebSocket bridge, and REST services.
//! - **Network Identifiers & Errors**: Strongly typed identifiers (`NodeId`, `DeviceId`, `ConnectionId`,
//!   `NetworkInterfaceId`) and structured error domain model (`NetworkError`, `NetworkResult`).
//! - **Subsystem Lifecycle**: Structured entry point (`NetworkSubsystem`) coordinating
//!   future authoritative cluster state (Phase N3) and authenticated mesh transport (Phase N5).
//!
//! ## Submodules
//!
//! - [`capture`]: Bounded, metadata-only packet monitoring (N8/SIH26117).
//! - [`config`]: Central transport configuration abstraction (`NetworkTransportConfig`).
//! - [`discovery`]: Passive local subnet neighbor discovery from OS ARP/neighbor cache.
//! - [`error`]: Strongly typed Network domain error model (`NetworkError`, `NetworkResult`).
//! - [`flows`]: Active transport socket and connection flow mapping with PID ownership.
//! - [`ids`]: Stable strongly typed network identifiers (`NodeId`, `DeviceId`, `ConnectionId`, `NetworkInterfaceId`).
//! - [`interfaces`]: Cross-platform interface enumeration, MAC normalization, and classification.
//! - [`model`]: Canonical Network domain entities, states, enums, and events (Phase N2).
//! - [`subsystem`]: Network subsystem lifecycle coordinator and handle (`NetworkSubsystem`).
//! - [`traffic`]: Reusable, anomaly-safe traffic rate calculation primitives.
//! - [`types`]: Strongly typed domain models for interfaces, devices, flows, and metrics.
//! - [`wifi`]: Wi-Fi network profile and non-secret security metadata observation.

pub mod admin;
pub mod api;
pub mod capture;
pub mod cluster;
pub mod config;
pub mod crypto;
pub mod diagnostics;
pub mod discovery;
pub mod error;
pub mod event;
pub mod flows;
pub mod ids;
pub mod interfaces;
pub mod model;
pub mod monitor_server;
pub mod state;
pub mod subsystem;
pub mod telemetry;
pub mod traffic;
pub mod transport;
pub mod types;
pub mod wifi;

// Re-export Crypto & Security Transport types (Phase N14)
pub use crypto::{derive_sas, NodeKeypair, PublicKey, TrustEvaluation, TrustStatus, TrustedPeer, TrustedPeerStore};
pub use transport::{
    perform_noise_handshake_initiator, perform_noise_handshake_responder, read_frame, write_frame,
    BinaryFrame, FrameHeader, FrameMessageType, FramingError, HandshakeError, SecureSession,
    SessionError, SharedSecureSession, FRAME_MAGIC, MAX_FRAME_SIZE, NOISE_PATTERN,
};

// Re-export Admin Control Plane types (Phase N13)
pub use admin::{
    global_admin_audit_logger, notify_remote_capability_result_by_id, AdminAuditEntry,
    AdminAuditLogger, AdminBatchCommandRequest, AdminBatchCommandResult, AdminCommandController,
    AdminCommandRequest, AdminCommandResult, CallerContext,
};

// Re-export Foundation & Configuration types (Phase N1)
pub use config::NetworkTransportConfig;
pub use error::{NetworkError, NetworkResult};
pub use ids::{ConnectionId, DeviceId, EventId, NetworkInterfaceId, NodeId, RequestId};
pub use state::{NetworkState, NetworkStateSnapshot, SharedNetworkState};
pub use subsystem::{global_network_subsystem, record_security_observation, NetworkSubsystem};

// Re-export Network API & Contract types (Phase N7)
pub use api::{
    GetCapabilitiesRequest, GetCapabilitiesResponse, GetConnectionRequest, GetConnectionResponse,
    GetDeviceRequest, GetDeviceResponse, GetInterfaceRequest, GetInterfaceResponse,
    GetNetworkSnapshotRequest, GetNetworkSnapshotResponse, GetNodeRequest, GetNodeResponse,
    GetTrafficRequest, GetTrafficResponse, ListConnectionsRequest, ListConnectionsResponse,
    ListDevicesRequest, ListDevicesResponse, ListInterfacesRequest, ListInterfacesResponse,
    ListNodesRequest, ListNodesResponse, NetworkApi, NetworkApiError, NetworkApiResponse,
    NetworkApiResult, NetworkCapabilitiesMetadata, NetworkProtocolVersion,
};

// Re-export Event System types (Phase N6)
pub use event::{
    DEFAULT_EVENT_BUFFER_CAPACITY, EventRecvError, EventSubscriber, EventTryRecvError,
    NetworkEventBus,
};

// Re-export Cluster Management types (Phase N4)
pub use cluster::{
    validate_transition, ClusterManager, HeartbeatConfig, HeartbeatTracker, NodeHeartbeatRecord,
    PythonClusterAdapter, PythonMachineEntry, TerminalMeshAdapter,
};

// Re-export Discovery & Telemetry types (Phase N5)
pub use telemetry::{NetworkTelemetryService, TelemetrySummary};

// Re-export Diagnostics & Observability types (Phase N17/OBS-01)
pub use diagnostics::{global_diagnostics, NetworkDiagnostics, NetworkDiagnosticsSnapshot};

// Re-export Canonical Domain Models & Enums (Phase N2)
pub use model::{
    AuthFailureReason, AuthenticationState, ConnectionDirection, ConnectionKind, DeviceCategory,
    DiscoverySource, EventCategory, EventSeverity, NetworkConnection, NetworkDevice, NetworkEvent,
    NetworkEventType, NetworkNode, NetworkSecurityObservation, NodeAvailability, NodeRole,
    PairingState, SecurityRiskLevel, TopTalker, TrafficMetrics,
};

// Re-export Local Network Observability collectors and primitives
pub use capture::{
    get_packet_capture_status, record_packet_observation, start_packet_capture, stop_packet_capture,
};
pub use discovery::{get_local_devices, parse_linux_arp};
pub use flows::{get_active_flows, parse_linux_proc_net};
pub use interfaces::{get_interface_by_name, get_interfaces, get_interfaces_with_rates};
pub use traffic::{calculate_rates, TrafficRateCalculator};
pub use types::{
    DeviceState, FlowProtocol, FlowState, InterfaceSample, InterfaceType, LocalNetworkDevice,
    NetworkFlow, NetworkInterfaceInfo, OperationalStatus, PacketCaptureStatus, PacketDirection,
    PacketObservation, PacketProtocol, TcpFlags, TrafficRates, WifiProfile,
};
pub use wifi::{get_wifi_profiles, parse_linux_nmconnection, parse_windows_profile_xml};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_subsystem_entry_point_reexports() {
        let config = NetworkTransportConfig::default();
        assert_eq!(config.cluster_mesh_port, 9000);

        let node_id = NodeId::new("node-1");
        assert_eq!(node_id.as_str(), "node-1");

        let dev_id = DeviceId::new("dev-1");
        assert_eq!(dev_id.as_str(), "dev-1");

        let iface_id = NetworkInterfaceId::new("eth0");
        assert_eq!(iface_id.as_str(), "eth0");

        let conn_id = ConnectionId::new("conn-1");
        assert_eq!(conn_id.as_str(), "conn-1");

        let err = NetworkError::Other("test error".into());
        assert_eq!(err.kind(), "network_error");

        let mut sub = NetworkSubsystem::new(config);
        assert!(sub.start().is_ok());
        assert!(sub.is_running());
        assert_eq!(sub.state().revision(), 0);
        assert!(sub.stop().is_ok());
    }

    #[test]
    fn test_authoritative_state_reexports() {
        let state = NetworkState::new();
        assert_eq!(state.revision(), 0);

        let shared = SharedNetworkState::new();
        assert_eq!(shared.revision(), 0);

        let snap: NetworkStateSnapshot = shared.get_snapshot();
        assert_eq!(snap.revision, 0);
        assert!(snap.nodes.is_empty());
    }

    #[test]
    fn test_cluster_management_reexports() {
        let state = SharedNetworkState::new();
        let mgr = ClusterManager::new(state, HeartbeatConfig::default());
        assert_eq!(mgr.list_nodes().len(), 0);

        let node_id = NodeId::new("node-test");
        let node = NetworkNode::new(node_id.clone(), "Test Node", "host", "linux", "x86_64");
        assert!(mgr.register_node(node).is_ok());
        assert_eq!(mgr.list_nodes().len(), 1);
        assert!(validate_transition(NodeAvailability::Unknown, NodeAvailability::Available).is_ok());
    }

    #[test]
    fn test_telemetry_service_reexports() {
        let state = SharedNetworkState::new();
        let telemetry = NetworkTelemetryService::new(state.clone());
        assert_eq!(telemetry.state().revision(), 0);

        let summary = telemetry.poll_all().unwrap();
        assert!(summary.timestamp_epoch_ms > 0);
    }

    #[test]
    fn test_canonical_domain_reexports() {
        let node = NetworkNode::new(NodeId::new("node-1"), "Node One", "host1", "linux", "x86_64");
        assert_eq!(node.role, NodeRole::Standalone);

        let dev = NetworkDevice::new(DeviceId::new("dev-1"), "192.168.1.1");
        assert_eq!(dev.category, DeviceCategory::Unknown);

        let conn = NetworkConnection::new(
            ConnectionId::new("conn-1"),
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "127.0.0.1",
            9000,
            FlowState::Established,
        );
        assert_eq!(conn.kind, ConnectionKind::ClusterTransport);

        let event = NetworkEvent {
            event_id: EventId::new("evt-1"),
            sequence: 1,
            state_revision: Some(5),
            timestamp_epoch_ms: 1000,
            category: EventCategory::Cluster,
            event_type: NetworkEventType::NodeDiscovered,
            severity: EventSeverity::Info,
            source_node_id: Some(NodeId::new("node-1")),
            target_node_id: None,
            target_device_id: None,
            target_connection_id: None,
            summary: "Node discovered".into(),
            details: serde_json::json!({}),
        };
        assert_eq!(event.event_type, NetworkEventType::NodeDiscovered);
    }

    #[test]
    fn test_event_system_reexports() {
        let bus = NetworkEventBus::new(10);
        let mut sub = bus.subscribe();
        let evt = NetworkEvent::new(EventCategory::Cluster, NetworkEventType::NodeConnected, EventSeverity::Info, "Node connected");
        let seq = bus.publish(evt);
        assert_eq!(seq, 1);
        let rec = sub.try_recv().unwrap();
        assert_eq!(rec.event_type, NetworkEventType::NodeConnected);
    }

    #[test]
    fn test_existing_collectors_callable_via_facade() {
        let ifaces = get_interfaces();
        // Returns a vector on any platform without panicking
        let _ = ifaces.len();

        let devices = get_local_devices();
        let _ = devices.len();

        let flows = get_active_flows();
        let _ = flows.len();

        let wifi = get_wifi_profiles();
        let _ = wifi.len();

        let capture_status = get_packet_capture_status();
        assert!(!capture_status.is_active);
    }
}
