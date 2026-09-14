use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

use crate::network::error::{NetworkError, NetworkResult};
use crate::network::ids::{ConnectionId, DeviceId, EventId, NodeId};
use crate::network::types::{DeviceState, FlowProtocol, FlowState, TrafficRates};

// ============================================================================
// 1. Node & Role Models
// ============================================================================

/// Canonical operational cluster role of a Fluffy node.
/// Note: Availability (e.g. advertising or discoverable on LAN) is an availability state (`NodeAvailability`),
/// not an architectural role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeRole {
    /// Local standalone operation only (default)
    Standalone,
    /// Controller node administering remote cluster nodes
    Admin,
    /// Dedicated cluster worker / managed agent node
    Worker,
    /// Symmetrical cluster peer node
    Peer,
}

impl Default for NodeRole {
    fn default() -> Self {
        NodeRole::Standalone
    }
}

impl fmt::Display for NodeRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NodeRole::Standalone => write!(f, "standalone"),
            NodeRole::Admin => write!(f, "admin"),
            NodeRole::Worker => write!(f, "worker"),
            NodeRole::Peer => write!(f, "peer"),
        }
    }
}

/// Dynamic availability and reachability state of a node in the cluster mesh.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeAvailability {
    /// Discovered on LAN and advertising availability for cluster participation
    Available,
    /// In the process of cryptographic pairing
    Pairing,
    /// In the process of handshake authentication
    Authenticating,
    /// Actively connected and verified
    Connected,
    /// Disconnected or unreachable
    Disconnected,
    /// Recovering from temporary heartbeat loss
    Recovering,
    /// Status unknown or unverified
    Unknown,
}

impl Default for NodeAvailability {
    fn default() -> Self {
        NodeAvailability::Unknown
    }
}

impl fmt::Display for NodeAvailability {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            NodeAvailability::Available => write!(f, "available"),
            NodeAvailability::Pairing => write!(f, "pairing"),
            NodeAvailability::Authenticating => write!(f, "authenticating"),
            NodeAvailability::Connected => write!(f, "connected"),
            NodeAvailability::Disconnected => write!(f, "disconnected"),
            NodeAvailability::Recovering => write!(f, "recovering"),
            NodeAvailability::Unknown => write!(f, "unknown"),
        }
    }
}

/// Bounded failure classification for authentication attempts.
/// Crucial Security Invariant: Prevents credentials, passwords, tokens, or raw secrets from entering serialized domain state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthFailureReason {
    InvalidCredentials,
    TokenExpired,
    ChallengeMismatch,
    HandshakeTimeout,
    UnsupportedProtocol,
    PolicyRejected,
    RateLimited,
    NetworkError,
    Unknown,
}

impl fmt::Display for AuthFailureReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthFailureReason::InvalidCredentials => write!(f, "invalid_credentials"),
            AuthFailureReason::TokenExpired => write!(f, "token_expired"),
            AuthFailureReason::ChallengeMismatch => write!(f, "challenge_mismatch"),
            AuthFailureReason::HandshakeTimeout => write!(f, "handshake_timeout"),
            AuthFailureReason::UnsupportedProtocol => write!(f, "unsupported_protocol"),
            AuthFailureReason::PolicyRejected => write!(f, "policy_rejected"),
            AuthFailureReason::RateLimited => write!(f, "rate_limited"),
            AuthFailureReason::NetworkError => write!(f, "network_error"),
            AuthFailureReason::Unknown => write!(f, "unknown"),
        }
    }
}

/// Authentication state of a cluster peer connection.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "status", content = "reason", rename_all = "snake_case")]
pub enum AuthenticationState {
    Unauthenticated,
    Authenticating,
    Authenticated,
    Failed(AuthFailureReason),
}

impl Default for AuthenticationState {
    fn default() -> Self {
        AuthenticationState::Unauthenticated
    }
}

/// Pairing state of a cluster peer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PairingState {
    Unpaired,
    PairingRequested,
    Paired,
    Rejected,
}

impl Default for PairingState {
    fn default() -> Self {
        PairingState::Unpaired
    }
}

/// Canonical domain model representing a Fluffy-managed node in the distributed cluster.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkNode {
    /// Stable logical identifier for this Fluffy node
    pub id: NodeId,
    /// Human-friendly display name
    pub name: String,
    /// Machine hostname reported by OS
    pub hostname: String,
    /// Operating system name (e.g. "windows", "linux", "macos")
    pub os: String,
    /// Operating system version or build string
    pub os_version: Option<String>,
    /// CPU architecture (e.g. "x86_64", "aarch64")
    pub arch: String,
    /// Current operational role
    pub role: NodeRole,
    /// Mesh availability state
    pub availability: NodeAvailability,
    /// Authentication state
    pub auth_state: AuthenticationState,
    /// Pairing state
    pub pairing_state: PairingState,
    /// Assigned IP addresses
    pub ip_addresses: Vec<String>,
    /// Associated hardware MAC addresses
    pub mac_addresses: Vec<String>,
    /// Declared capability identifiers
    pub capabilities: Vec<String>,
    /// True if this node is the local machine running this process
    pub is_local: bool,
    /// Epoch timestamp (seconds) when last observed active
    pub last_seen_epoch: u64,
    /// Extensible metadata key-values (no secrets permitted)
    pub metadata: HashMap<String, String>,
}

impl NetworkNode {
    /// Create a new NetworkNode instance
    pub fn new(id: NodeId, name: impl Into<String>, hostname: impl Into<String>, os: impl Into<String>, arch: impl Into<String>) -> Self {
        Self {
            id,
            name: name.into(),
            hostname: hostname.into(),
            os: os.into(),
            os_version: None,
            arch: arch.into(),
            role: NodeRole::Standalone,
            availability: NodeAvailability::Unknown,
            auth_state: AuthenticationState::Unauthenticated,
            pairing_state: PairingState::Unpaired,
            ip_addresses: Vec::new(),
            mac_addresses: Vec::new(),
            capabilities: Vec::new(),
            is_local: false,
            last_seen_epoch: 0,
            metadata: HashMap::new(),
        }
    }

    /// Validate domain invariants
    pub fn validate(&self) -> NetworkResult<()> {
        if self.id.as_str().trim().is_empty() {
            return Err(NetworkError::InvalidConfig("Node ID cannot be empty".into()));
        }
        if self.name.trim().is_empty() {
            return Err(NetworkError::InvalidConfig("Node name cannot be empty".into()));
        }
        Ok(())
    }
}

// ============================================================================
// 2. Network Device Models (Discovered Subnet Entities)
// ============================================================================

/// High-level semantic classification of a discovered network device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeviceCategory {
    Gateway,
    Router,
    Workstation,
    Laptop,
    Phone,
    Tablet,
    Iot,
    Printer,
    Server,
    Infrastructure,
    Unknown,
}

impl Default for DeviceCategory {
    fn default() -> Self {
        DeviceCategory::Unknown
    }
}

impl fmt::Display for DeviceCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeviceCategory::Gateway => write!(f, "GATEWAY"),
            DeviceCategory::Router => write!(f, "ROUTER"),
            DeviceCategory::Workstation => write!(f, "WORKSTATION"),
            DeviceCategory::Laptop => write!(f, "LAPTOP"),
            DeviceCategory::Phone => write!(f, "PHONE"),
            DeviceCategory::Tablet => write!(f, "TABLET"),
            DeviceCategory::Iot => write!(f, "IOT"),
            DeviceCategory::Printer => write!(f, "PRINTER"),
            DeviceCategory::Server => write!(f, "SERVER"),
            DeviceCategory::Infrastructure => write!(f, "NETWORK_INFRASTRUCTURE"),
            DeviceCategory::Unknown => write!(f, "UNKNOWN"),
        }
    }
}

/// Source mechanism through which a device was discovered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoverySource {
    ArpTable,
    NeighborDiscovery,
    PassiveDns,
    ClusterAnnouncement,
    Manual,
}

impl Default for DiscoverySource {
    fn default() -> Self {
        DiscoverySource::ArpTable
    }
}

/// Canonical domain model representing any discovered device on the local network.
/// Note: A NetworkDevice is NOT assumed to be a Fluffy node unless `is_fluffy_node` is verified.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkDevice {
    /// Stable identifier for this device (hardware-anchored or explicitly ephemeral)
    pub id: DeviceId,
    /// Primary IP address
    pub ip_address: String,
    /// Physical MAC address if known
    pub mac_address: Option<String>,
    /// Resolved hostname or DNS name
    pub hostname: Option<String>,
    /// Manufacturer or vendor derived from MAC OUI
    pub vendor: Option<String>,
    /// Device category classification
    pub category: DeviceCategory,
    /// Reachability state in OS neighbor table
    pub state: DeviceState,
    /// Discovery mechanism
    pub source: DiscoverySource,
    /// True if this device is the default gateway
    pub is_gateway: bool,
    /// True if this device is the local host
    pub is_self: bool,
    /// True if this device runs a verified Fluffy Assistant instance
    pub is_fluffy_node: bool,
    /// Associated NodeId if identified as a Fluffy cluster node
    pub associated_node_id: Option<NodeId>,
    /// Epoch timestamp (seconds) when first discovered
    pub first_seen_epoch: u64,
    /// Epoch timestamp (seconds) when last observed
    pub last_seen_epoch: u64,
}

impl NetworkDevice {
    /// Create a new NetworkDevice instance
    pub fn new(id: DeviceId, ip_address: impl Into<String>) -> Self {
        Self {
            id,
            ip_address: ip_address.into(),
            mac_address: None,
            hostname: None,
            vendor: None,
            category: DeviceCategory::Unknown,
            state: DeviceState::Reachable,
            source: DiscoverySource::ArpTable,
            is_gateway: false,
            is_self: false,
            is_fluffy_node: false,
            associated_node_id: None,
            first_seen_epoch: 0,
            last_seen_epoch: 0,
        }
    }

    /// Factory constructor deriving hardware-anchored ID from MAC, or falling back to ephemeral ID
    pub fn from_discovered(mac: Option<&str>, ip: impl Into<String>) -> Self {
        let ip_str = ip.into();
        let (id, mac_opt) = match mac.and_then(DeviceId::from_mac) {
            Some(dev_id) => (dev_id, mac.map(String::from)),
            None => (DeviceId::ephemeral(), mac.map(String::from)),
        };
        let mut dev = Self::new(id, ip_str);
        dev.mac_address = mac_opt;
        dev
    }

    /// Validate domain invariants
    pub fn validate(&self) -> NetworkResult<()> {
        if self.ip_address.trim().is_empty() {
            return Err(NetworkError::InvalidConfig("Device IP address cannot be empty".into()));
        }
        Ok(())
    }
}

// ============================================================================
// 3. Network Connection Models
// ============================================================================

/// Nature and purpose of a logical network connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionKind {
    /// Local host socket connection flow (from OS table)
    LocalSocketFlow,
    /// Inter-machine Fluffy cluster peer transport stream
    ClusterTransport,
    /// Local IPC command/telemetry stream
    IpcStream,
    /// UI real-time WebSocket bridge
    WebSocketBridge,
}

impl Default for ConnectionKind {
    fn default() -> Self {
        ConnectionKind::LocalSocketFlow
    }
}

/// Direction of connection relative to the local host.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionDirection {
    Inbound,
    Outbound,
    Local,
    Unknown,
}

impl Default for ConnectionDirection {
    fn default() -> Self {
        ConnectionDirection::Unknown
    }
}

/// Canonical domain model representing a logical or transport connection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkConnection {
    /// Unique connection identifier
    pub id: ConnectionId,
    /// Kind of connection
    pub kind: ConnectionKind,
    /// Transport protocol (TCP/UDP)
    pub protocol: FlowProtocol,
    /// Local bound IP address
    pub local_addr: String,
    /// Local bound port
    pub local_port: u16,
    /// Remote target IP address (None if listening or local)
    pub remote_addr: Option<String>,
    /// Remote target port (None if listening or local)
    pub remote_port: Option<u16>,
    /// Connection state
    pub state: FlowState,
    /// Connection direction
    pub direction: ConnectionDirection,
    /// Associated cluster NodeId if this is a cluster connection
    pub associated_node_id: Option<NodeId>,
    /// Process ID owning this socket on local host
    pub pid: Option<u32>,
    /// Executable name owning this socket
    pub process_name: Option<String>,
    /// Timestamp (epoch seconds) when connection was established
    pub established_at_epoch: Option<u64>,
    /// Timestamp (epoch seconds) of last observed activity
    pub last_active_epoch: u64,
}

impl NetworkConnection {
    /// Create a new NetworkConnection instance
    pub fn new(id: ConnectionId, kind: ConnectionKind, protocol: FlowProtocol, local_addr: impl Into<String>, local_port: u16, state: FlowState) -> Self {
        Self {
            id,
            kind,
            protocol,
            local_addr: local_addr.into(),
            local_port,
            remote_addr: None,
            remote_port: None,
            state,
            direction: ConnectionDirection::Unknown,
            associated_node_id: None,
            pid: None,
            process_name: None,
            established_at_epoch: None,
            last_active_epoch: 0,
        }
    }

    /// Validate domain invariants
    pub fn validate(&self) -> NetworkResult<()> {
        if self.local_addr.trim().is_empty() {
            return Err(NetworkError::InvalidConfig("Local address cannot be empty".into()));
        }
        Ok(())
    }
}

// ============================================================================
// 4. Network Traffic Models
// ============================================================================

/// Aggregate metrics and throughput statistics for an entity or connection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TrafficMetrics {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_packets: u64,
    pub tx_packets: u64,
    pub rx_errors: u64,
    pub tx_errors: u64,
    pub rx_drops: u64,
    pub tx_drops: u64,
    pub rates: Option<TrafficRates>,
    #[serde(default)]
    pub top_talkers: Vec<TopTalker>,
}

/// Represents a prominent traffic-generating node, process, or endpoint.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TopTalker {
    pub entity_id: String,
    pub entity_name: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_rate_bps: f64,
    pub tx_rate_bps: f64,
}

// ============================================================================
// 5. Network Event & Security Models
// ============================================================================

/// High-level category of a network event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventCategory {
    Cluster,
    Network,
    Discovery,
    Telemetry,
    Connection,
    Security,
    Admin,
    System,
}

impl fmt::Display for EventCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EventCategory::Cluster => write!(f, "cluster"),
            EventCategory::Network => write!(f, "network"),
            EventCategory::Discovery => write!(f, "discovery"),
            EventCategory::Telemetry => write!(f, "telemetry"),
            EventCategory::Connection => write!(f, "connection"),
            EventCategory::Security => write!(f, "security"),
            EventCategory::Admin => write!(f, "admin"),
            EventCategory::System => write!(f, "system"),
        }
    }
}

/// Severity classification of a network event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventSeverity {
    Info,
    Notice,
    Warning,
    Error,
    Critical,
}

impl fmt::Display for EventSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EventSeverity::Info => write!(f, "info"),
            EventSeverity::Notice => write!(f, "notice"),
            EventSeverity::Warning => write!(f, "warning"),
            EventSeverity::Error => write!(f, "error"),
            EventSeverity::Critical => write!(f, "critical"),
        }
    }
}

/// Strongly typed taxonomy of network lifecycle, state transition, and security events.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NetworkEventType {
    // Cluster events
    NodeDiscovered,
    NodeAvailable,
    PairingStarted,
    PairingCompleted,
    AuthStarted,
    Authenticated,
    AuthFailed,
    NodeConnected,
    NodeDisconnected,
    NodeRecovered,
    HeartbeatMissed,
    RoleChanged,

    // Local Network / Discovery events
    InterfaceChanged,
    InterfaceAdded,
    InterfaceRemoved,
    DeviceDiscovered,
    DeviceUpdated,
    DeviceRemoved,
    DeviceStateChanged,
    ConnectionOpened,
    ConnectionClosed,
    ConnectionStateChanged,
    TrafficSpike,
    TrafficMetricsUpdated,

    // Security & Anomaly events
    UnknownDevice,
    SuspiciousTraffic,
    AuthViolation,
    AnomalyDetected,
    PolicyViolation,
    SecurityObservationCreated,

    // Administration events
    RemoteActionStarted,
    RemoteActionCompleted,
    RemoteActionDenied,
    TerminalSessionOpened,
    TerminalSessionClosed,
    AdminCommandDispatched,
    AdminCommandAuthorizationDenied,
    AdminCommandCompleted,
    AdminCommandFailed,
    AdminBatchCompleted,

    // N14 Security & Cryptographic Transport events
    SecureSessionEstablished,
    SecureSessionClosed,
    CryptographicHandshakeFailed,
    IdentityMismatch,
    ProtocolMismatch,
    ReplayRejected,
    SessionExpired,
    LegacyTransportUsed,
}

/// Canonical domain model representing an event occurring within the network subsystem.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkEvent {
    /// Unique event identifier
    pub event_id: EventId,
    /// Monotonically increasing sequence number assigned by the event bus
    #[serde(default)]
    pub sequence: u64,
    /// Authoritative NetworkState revision associated with this event
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_revision: Option<u64>,
    /// Timestamp epoch in milliseconds
    pub timestamp_epoch_ms: u64,
    /// High-level event category
    pub category: EventCategory,
    /// Specific event type
    pub event_type: NetworkEventType,
    /// Event severity
    pub severity: EventSeverity,
    /// Source node emitting or causing the event
    pub source_node_id: Option<NodeId>,
    /// Target node affected by the event
    pub target_node_id: Option<NodeId>,
    /// Target device affected by the event
    pub target_device_id: Option<DeviceId>,
    /// Target connection affected by the event
    pub target_connection_id: Option<ConnectionId>,
    /// Human-readable summary
    pub summary: String,
    /// Structured event payload details
    pub details: serde_json::Value,
}

impl NetworkEvent {
    /// Create a new NetworkEvent instance
    pub fn new(
        category: EventCategory,
        event_type: NetworkEventType,
        severity: EventSeverity,
        summary: impl Into<String>,
    ) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Self {
            event_id: EventId::random(),
            sequence: 0,
            state_revision: None,
            timestamp_epoch_ms: now,
            category,
            event_type,
            severity,
            source_node_id: None,
            target_node_id: None,
            target_device_id: None,
            target_connection_id: None,
            summary: summary.into(),
            details: serde_json::json!({}),
        }
    }

    /// Builder: attach state revision
    pub fn with_state_revision(mut self, revision: u64) -> Self {
        self.state_revision = Some(revision);
        self
    }

    /// Builder: attach target node id
    pub fn with_target_node(mut self, node_id: NodeId) -> Self {
        self.target_node_id = Some(node_id);
        self
    }

    /// Builder: attach target device id
    pub fn with_target_device(mut self, device_id: DeviceId) -> Self {
        self.target_device_id = Some(device_id);
        self
    }

    /// Builder: attach target connection id
    pub fn with_target_connection(mut self, conn_id: ConnectionId) -> Self {
        self.target_connection_id = Some(conn_id);
        self
    }

    /// Builder: attach source node id
    pub fn with_source_node(mut self, node_id: NodeId) -> Self {
        self.source_node_id = Some(node_id);
        self
    }

    /// Builder: attach structured JSON details
    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = details;
        self
    }
}

/// Risk level classification for network security observations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityRiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Structured network security observation designed for Guardian correlation and alerts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkSecurityObservation {
    pub observation_id: String,
    pub timestamp_epoch_ms: u64,
    pub risk_level: SecurityRiskLevel,
    pub anomaly_kind: String,
    pub affected_interface: Option<String>,
    pub affected_ip: Option<String>,
    pub affected_mac: Option<String>,
    pub affected_pid: Option<u32>,
    pub description: String,
    pub evidence: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_role_and_availability_semantics() {
        let role = NodeRole::Admin;
        let role_json = serde_json::to_string(&role).unwrap();
        assert_eq!(role_json, "\"admin\"");
        assert_eq!(serde_json::from_str::<NodeRole>(&role_json).unwrap(), NodeRole::Admin);

        let worker_role = NodeRole::Worker;
        assert_eq!(worker_role.to_string(), "worker");

        let peer_role = NodeRole::Peer;
        assert_eq!(peer_role.to_string(), "peer");

        let avail = NodeAvailability::Available;
        let avail_json = serde_json::to_string(&avail).unwrap();
        assert_eq!(avail_json, "\"available\"");
        assert_eq!(serde_json::from_str::<NodeAvailability>(&avail_json).unwrap(), NodeAvailability::Available);
    }

    #[test]
    fn test_authentication_state_bounded_failure_safety() {
        // Ensure failure reasons are strongly typed and bounded
        let fail_state = AuthenticationState::Failed(AuthFailureReason::InvalidCredentials);
        let json = serde_json::to_string(&fail_state).unwrap();
        assert!(json.contains("\"status\":\"failed\""));
        assert!(json.contains("\"reason\":\"invalid_credentials\""));

        // Crucial security invariant: Arbitrary strings, passwords or submitted tokens cannot leak into state
        assert!(!json.contains("password"));
        assert!(!json.contains("secret"));
        assert!(!json.contains("token"));

        let deserialized: AuthenticationState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, fail_state);
    }

    #[test]
    fn test_network_node_creation_and_validation() {
        let node_id = NodeId::new("node-alpha-1");
        let mut node = NetworkNode::new(node_id.clone(), "Workstation Alpha", "DESKTOP-XYZ", "windows", "x86_64");
        node.role = NodeRole::Admin;
        node.availability = NodeAvailability::Connected;
        node.ip_addresses.push("192.168.1.50".into());
        node.capabilities.push("Process.List".into());

        assert!(node.validate().is_ok());

        let json = serde_json::to_string(&node).unwrap();
        assert!(json.contains("\"name\":\"Workstation Alpha\""));
        assert!(json.contains("\"role\":\"admin\""));
        assert!(json.contains("\"availability\":\"connected\""));
        assert!(!json.contains("password"));

        let deserialized: NetworkNode = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, node_id);
        assert_eq!(deserialized.role, NodeRole::Admin);
    }

    #[test]
    fn test_network_node_invalid_id_rejected() {
        let node = NetworkNode::new(NodeId::new(""), "Alpha", "host", "linux", "x86_64");
        assert!(node.validate().is_err());
    }

    #[test]
    fn test_network_device_with_mac_and_ephemeral_fallback() {
        // 1. Hardware-anchored device
        let dev_anchored = NetworkDevice::from_discovered(Some("00:1A:2B:3C:4D:5E"), "192.168.1.100");
        assert!(dev_anchored.id.is_hardware_anchored());
        assert!(!dev_anchored.id.is_ephemeral());
        assert_eq!(dev_anchored.id.as_str(), "dev_mac_001a2b3c4d5e");

        // 2. Ephemeral device when MAC is absent
        let dev_ephem = NetworkDevice::from_discovered(None, "192.168.1.101");
        assert!(dev_ephem.id.is_ephemeral());
        assert!(!dev_ephem.id.is_hardware_anchored());
        assert!(dev_ephem.id.as_str().starts_with("dev_ephem_"));
    }

    #[test]
    fn test_network_connection_creation_and_direction() {
        let conn_id = ConnectionId::new("conn-1");
        let mut conn = NetworkConnection::new(
            conn_id.clone(),
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "127.0.0.1",
            9000,
            FlowState::Established,
        );
        conn.remote_addr = Some("192.168.1.100".into());
        conn.remote_port = Some(54321);
        conn.direction = ConnectionDirection::Inbound;
        conn.associated_node_id = Some(NodeId::new("node-remote-1"));

        assert!(conn.validate().is_ok());

        let json = serde_json::to_string(&conn).unwrap();
        assert!(json.contains("\"kind\":\"cluster_transport\""));
        assert!(json.contains("\"protocol\":\"tcp\""));
        assert!(json.contains("\"state\":\"established\""));
        assert!(json.contains("\"direction\":\"inbound\""));

        let deserialized: NetworkConnection = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, conn_id);
        assert_eq!(deserialized.kind, ConnectionKind::ClusterTransport);
    }

    #[test]
    fn test_network_event_creation_and_details() {
        let event = NetworkEvent {
            event_id: EventId::new("evt-001"),
            sequence: 42,
            state_revision: Some(10),
            timestamp_epoch_ms: 1726000000000,
            category: EventCategory::Cluster,
            event_type: NetworkEventType::NodeConnected,
            severity: EventSeverity::Info,
            source_node_id: Some(NodeId::new("node-alpha")),
            target_node_id: Some(NodeId::new("node-beta")),
            target_device_id: None,
            target_connection_id: Some(ConnectionId::new("conn-1")),
            summary: "Node Beta connected to cluster mesh".into(),
            details: serde_json::json!({
                "ip": "192.168.1.105",
                "handshake_version": "1.0"
            }),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event_type\":\"node_connected\""));
        assert!(json.contains("\"severity\":\"info\""));
        assert!(json.contains("\"category\":\"cluster\""));
        assert!(json.contains("\"sequence\":42"));
        assert!(json.contains("\"state_revision\":10"));

        let deserialized: NetworkEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.event_id, EventId::new("evt-001"));
        assert_eq!(deserialized.sequence, 42);
        assert_eq!(deserialized.state_revision, Some(10));
        assert_eq!(deserialized.event_type, NetworkEventType::NodeConnected);

        // Builder pattern test
        let built = NetworkEvent::new(EventCategory::Discovery, NetworkEventType::DeviceDiscovered, EventSeverity::Info, "New device found")
            .with_state_revision(15)
            .with_target_device(DeviceId::new("dev_1"));
        assert_eq!(built.category, EventCategory::Discovery);
        assert_eq!(built.event_type, NetworkEventType::DeviceDiscovered);
        assert_eq!(built.state_revision, Some(15));
        assert!(built.target_device_id.is_some());
    }

    #[test]
    fn test_security_observation_serialization() {
        let obs = NetworkSecurityObservation {
            observation_id: "sec-001".into(),
            timestamp_epoch_ms: 1726000000000,
            risk_level: SecurityRiskLevel::High,
            anomaly_kind: "gateway_mac_mismatch".into(),
            affected_interface: Some("Wi-Fi".into()),
            affected_ip: Some("192.168.1.1".into()),
            affected_mac: Some("00:11:22:33:44:55".into()),
            affected_pid: None,
            description: "Default gateway MAC changed unexpectedly".into(),
            evidence: vec!["Expected MAC: 00:AA:BB:CC:DD:EE".into(), "Observed MAC: 00:11:22:33:44:55".into()],
        };

        let json = serde_json::to_string(&obs).unwrap();
        assert!(json.contains("\"risk_level\":\"high\""));
        assert!(json.contains("\"anomaly_kind\":\"gateway_mac_mismatch\""));

        let deserialized: NetworkSecurityObservation = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.risk_level, SecurityRiskLevel::High);
    }
}
