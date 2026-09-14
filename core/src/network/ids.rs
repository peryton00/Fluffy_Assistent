use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

/// Unique identifier for a distributed cluster node or peer agent.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct NodeId(String);

impl NodeId {
    /// Create a new NodeId from a string
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Generate a random unique NodeId (UUID v4)
    pub fn random() -> Self {
        Self(format!("node_{}", Uuid::new_v4()))
    }

    /// Generate an explicitly ephemeral node identity for legacy/unauthenticated sessions
    pub fn ephemeral() -> Self {
        Self(format!("node_ephem_{}", Uuid::new_v4()))
    }

    /// Returns true if this identity is explicitly marked ephemeral
    pub fn is_ephemeral(&self) -> bool {
        self.0.starts_with("node_ephem_")
    }

    /// Access the underlying string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for NodeId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for NodeId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for NodeId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Unique identifier for a discovered or managed network device (e.g. host, printer, router).
/// 
/// Identity Invariant:
/// - MAC/Hardware identity is used as a canonical anchor when available (`dev_mac_<hex>`).
/// - IP address and hostname MUST NOT be treated as stable device identities.
/// - If no hardware address is available, explicitly ephemeral identity is generated (`dev_ephem_<uuid>`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DeviceId(String);

impl DeviceId {
    /// Create a new DeviceId from an explicit identifier string
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Derive a stable canonical DeviceId from a validated physical MAC address.
    /// Normalizes hex digits and removes standard delimiters (':', '-', '.').
    /// Returns None if the MAC is missing, malformed, or all zeroes (e.g. "00:00:00:00:00:00").
    pub fn from_mac(mac: &str) -> Option<Self> {
        let clean = mac.replace([':', '-', '.'], "").to_lowercase();
        if clean.len() != 12 || clean.chars().all(|c| c == '0') || !clean.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        Some(Self(format!("dev_mac_{}", clean)))
    }

    /// Generate an explicitly ephemeral device identity when no hardware anchor is available.
    /// Prefixed with `dev_ephem_` to clearly distinguish from permanent/hardware-anchored identities.
    pub fn ephemeral() -> Self {
        Self(format!("dev_ephem_{}", Uuid::new_v4()))
    }

    /// Generate a random unique DeviceId (UUID v4)
    pub fn random() -> Self {
        Self(format!("dev_{}", Uuid::new_v4()))
    }

    /// Returns true if this identity is explicitly ephemeral
    pub fn is_ephemeral(&self) -> bool {
        self.0.starts_with("dev_ephem_")
    }

    /// Returns true if this identity is anchored to a physical MAC address
    pub fn is_hardware_anchored(&self) -> bool {
        self.0.starts_with("dev_mac_")
    }

    /// Access the underlying string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for DeviceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for DeviceId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for DeviceId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for DeviceId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Unique identifier for an active network transport connection.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ConnectionId(String);

impl ConnectionId {
    /// Create a new ConnectionId from a string
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Generate a random unique ConnectionId (UUID v4)
    pub fn random() -> Self {
        Self(Uuid::new_v4().to_string())
    }

    /// Access the underlying string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ConnectionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for ConnectionId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for ConnectionId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for ConnectionId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Unique system identifier for a local network interface adapter (e.g. GUID or interface name).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct NetworkInterfaceId(String);

impl NetworkInterfaceId {
    /// Create a new NetworkInterfaceId from a string
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Access the underlying string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for NetworkInterfaceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for NetworkInterfaceId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for NetworkInterfaceId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for NetworkInterfaceId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Unique identifier for an individual network event occurrence.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EventId(String);

impl EventId {
    /// Create a new EventId from an explicit identifier string
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Generate a random unique EventId (UUID v4 with `evt_` prefix)
    pub fn random() -> Self {
        Self(format!("evt_{}", Uuid::new_v4()))
    }

    /// Access the underlying string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for EventId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for EventId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for EventId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for EventId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// Unique identifier for an individual Network API request / response correlation.
///
/// Distinguishes API request-response pairs from event IDs, node IDs, connection IDs,
/// state revisions, and sequence numbers.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RequestId(String);

impl RequestId {
    /// Create a new RequestId from an explicit identifier string
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Generate a random unique RequestId (UUID v4 with `req_` prefix)
    pub fn random() -> Self {
        Self(format!("req_{}", Uuid::new_v4()))
    }

    /// Access the underlying string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for RequestId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<String> for RequestId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for RequestId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl AsRef<str> for RequestId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_id_creation_and_display() {
        let node_id = NodeId::new("node-alpha-1");
        assert_eq!(node_id.as_str(), "node-alpha-1");
        assert_eq!(node_id.to_string(), "node-alpha-1");

        let random_id = NodeId::random();
        assert!(!random_id.as_str().is_empty());

        let json = serde_json::to_string(&node_id).unwrap();
        assert_eq!(json, "\"node-alpha-1\"");
        let deserialized: NodeId = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, node_id);
    }

    #[test]
    fn test_node_id_ephemeral() {
        let ephem = NodeId::ephemeral();
        assert!(ephem.is_ephemeral());
        assert!(ephem.as_str().starts_with("node_ephem_"));

        let permanent = NodeId::new("node-permanent-1");
        assert!(!permanent.is_ephemeral());
    }

    #[test]
    fn test_device_id_from_mac_normalization() {
        // Standard colon delimiter
        let dev1 = DeviceId::from_mac("00:1A:2B:3C:4D:5E").unwrap();
        assert_eq!(dev1.as_str(), "dev_mac_001a2b3c4d5e");
        assert!(dev1.is_hardware_anchored());
        assert!(!dev1.is_ephemeral());

        // Hyphen delimiter and mixed case
        let dev2 = DeviceId::from_mac("00-1a-2B-3C-4d-5e").unwrap();
        assert_eq!(dev1, dev2);

        // Dot delimiter (Cisco style)
        let dev3 = DeviceId::from_mac("001a.2b3c.4d5e").unwrap();
        assert_eq!(dev1, dev3);
    }

    #[test]
    fn test_device_id_same_mac_changing_ip() {
        // Device with MAC 00:11:22:33:44:55 observed with IP 192.168.1.50
        let dev_id_t1 = DeviceId::from_mac("00:11:22:33:44:55").unwrap();
        // Later observed with DHCP renewed IP 192.168.1.150
        let dev_id_t2 = DeviceId::from_mac("00:11:22:33:44:55").unwrap();
        // Identity remains identical regardless of IP change
        assert_eq!(dev_id_t1, dev_id_t2);
    }

    #[test]
    fn test_device_id_different_mac_same_ip() {
        // Two different devices that sequentially occupied the same IP
        let dev_a = DeviceId::from_mac("AA:BB:CC:DD:EE:01").unwrap();
        let dev_b = DeviceId::from_mac("AA:BB:CC:DD:EE:02").unwrap();
        assert_ne!(dev_a, dev_b);
    }

    #[test]
    fn test_device_id_invalid_mac_and_ephemeral_fallback() {
        // All zeroes (incomplete ARP)
        assert!(DeviceId::from_mac("00:00:00:00:00:00").is_none());
        // Invalid length
        assert!(DeviceId::from_mac("00:11:22").is_none());
        // Non-hex
        assert!(DeviceId::from_mac("00:11:22:33:44:ZZ").is_none());

        // When no valid MAC exists, explicitly ephemeral identity is generated
        let ephem = DeviceId::ephemeral();
        assert!(ephem.is_ephemeral());
        assert!(!ephem.is_hardware_anchored());
        assert!(ephem.as_str().starts_with("dev_ephem_"));
    }

    #[test]
    fn test_connection_id_creation() {
        let conn_id = ConnectionId::new("conn-tcp-9000-1");
        assert_eq!(conn_id.as_ref(), "conn-tcp-9000-1");
        let random_conn = ConnectionId::random();
        assert!(!random_conn.as_str().is_empty());
    }

    #[test]
    fn test_interface_id_creation() {
        let iface_id = NetworkInterfaceId::new("{3A8B12C4-9D8E-4F5A-A6B7-8C9D0E1F2A3B}");
        assert_eq!(iface_id.to_string(), "{3A8B12C4-9D8E-4F5A-A6B7-8C9D0E1F2A3B}");
        let json = serde_json::to_string(&iface_id).unwrap();
        let deserialized: NetworkInterfaceId = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, iface_id);
    }

    #[test]
    fn test_event_id_creation_and_randomness() {
        let explicit = EventId::new("evt_custom_100");
        assert_eq!(explicit.as_str(), "evt_custom_100");
        assert_eq!(explicit.to_string(), "evt_custom_100");

        let random_id = EventId::random();
        assert!(random_id.as_str().starts_with("evt_"));

        let json = serde_json::to_string(&explicit).unwrap();
        assert_eq!(json, "\"evt_custom_100\"");
        let deserialized: EventId = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, explicit);
    }
}
