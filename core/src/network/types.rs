use serde::{Deserialize, Serialize};

/// Classification of network interfaces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterfaceType {
    Wifi,
    Ethernet,
    Loopback,
    Virtual,
    Vpn,
    Bridge,
    Other,
}

impl std::fmt::Display for InterfaceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InterfaceType::Wifi => write!(f, "wifi"),
            InterfaceType::Ethernet => write!(f, "ethernet"),
            InterfaceType::Loopback => write!(f, "loopback"),
            InterfaceType::Virtual => write!(f, "virtual"),
            InterfaceType::Vpn => write!(f, "vpn"),
            InterfaceType::Bridge => write!(f, "bridge"),
            InterfaceType::Other => write!(f, "other"),
        }
    }
}

/// Operational state of a network adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationalStatus {
    Up,
    Down,
    Testing,
    Dormant,
    NotPresent,
    LowerLayerDown,
    Unknown,
}

impl std::fmt::Display for OperationalStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OperationalStatus::Up => write!(f, "up"),
            OperationalStatus::Down => write!(f, "down"),
            OperationalStatus::Testing => write!(f, "testing"),
            OperationalStatus::Dormant => write!(f, "dormant"),
            OperationalStatus::NotPresent => write!(f, "not_present"),
            OperationalStatus::LowerLayerDown => write!(f, "lower_layer_down"),
            OperationalStatus::Unknown => write!(f, "unknown"),
        }
    }
}

/// Instantaneous traffic throughput rates for an interface.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TrafficRates {
    pub rx_bytes_per_second: f64,
    pub tx_bytes_per_second: f64,
    pub rx_bits_per_second: f64,
    pub tx_bits_per_second: f64,
}

/// Discrete counter sample at a specific timestamp for rate computations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct InterfaceSample {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub timestamp_nanos: u64,
}

/// Complete structural model of a local host network interface.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkInterfaceInfo {
    /// Stable system identifier (e.g. adapter name or GUID)
    pub id: String,
    /// User-friendly name (e.g. "Wi-Fi", "eth0")
    pub name: String,
    /// Detailed hardware or driver description where provided by the OS
    pub description: Option<String>,
    /// Formatted MAC address (e.g. "00:1A:2B:3C:4D:5E")
    pub mac_address: Option<String>,
    /// Categorized interface type
    pub interface_type: InterfaceType,
    /// Current operational status
    pub status: OperationalStatus,
    /// True if backed by physical hardware (false for virtual/tun/tap/loopback)
    pub is_physical: bool,
    /// True if this is a loopback interface
    pub is_loopback: bool,
    /// True if this adapter is assigned as default gateway
    pub is_default_gateway: bool,
    /// List of assigned IPv4 addresses (with optional subnet CIDR, e.g. "192.168.1.100/24")
    pub ipv4_addresses: Vec<String>,
    /// List of assigned IPv6 addresses
    pub ipv6_addresses: Vec<String>,
    /// Default gateway IP address if configured
    pub gateway: Option<String>,
    /// Configured DNS servers for this adapter
    pub dns_servers: Vec<String>,
    /// Maximum Transmission Unit in bytes
    pub mtu: Option<u32>,
    /// Maximum link speed in Mbps
    pub link_speed_mbps: Option<u64>,
    /// Cumulative received bytes since system/adapter startup
    pub total_received_bytes: u64,
    /// Cumulative transmitted bytes since system/adapter startup
    pub total_transmitted_bytes: u64,
    /// Calculated instantaneous traffic rate (populated if samples exist)
    pub rates: Option<TrafficRates>,
}

/// Reachability and neighbor table state of a local network device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceState {
    Reachable,
    Stale,
    Permanent,
    Incomplete,
    Delay,
    Probe,
    Unknown,
}

impl std::fmt::Display for DeviceState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DeviceState::Reachable => write!(f, "reachable"),
            DeviceState::Stale => write!(f, "stale"),
            DeviceState::Permanent => write!(f, "permanent"),
            DeviceState::Incomplete => write!(f, "incomplete"),
            DeviceState::Delay => write!(f, "delay"),
            DeviceState::Probe => write!(f, "probe"),
            DeviceState::Unknown => write!(f, "unknown"),
        }
    }
}

/// Structural model of a discovered local network neighbor device.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LocalNetworkDevice {
    /// IP address of the local network device (IPv4 or IPv6)
    pub ip_address: String,
    /// Physical MAC address if present in neighbor cache
    pub mac_address: Option<String>,
    /// Resolved hostname if available
    pub hostname: Option<String>,
    /// Associated network interface name
    pub interface_name: Option<String>,
    /// True if this device IP matches the default gateway
    pub is_gateway: bool,
    /// True if this device is the local host itself
    pub is_self: bool,
    /// Current neighbor table reachability state
    pub state: DeviceState,
    /// Unix timestamp epoch (seconds) when first discovered
    pub first_seen: Option<u64>,
    /// Unix timestamp epoch (seconds) when last observed active
    pub last_seen: Option<u64>,
}

/// Transport protocol of an active network socket flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlowProtocol {
    Tcp,
    Udp,
}

impl std::fmt::Display for FlowProtocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FlowProtocol::Tcp => write!(f, "tcp"),
            FlowProtocol::Udp => write!(f, "udp"),
        }
    }
}

/// Connection state of a transport layer network flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowState {
    Listen,
    SynSent,
    SynReceived,
    Established,
    FinWait1,
    FinWait2,
    CloseWait,
    Closing,
    LastAck,
    TimeWait,
    Closed,
    Unknown,
}

impl std::fmt::Display for FlowState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FlowState::Listen => write!(f, "listen"),
            FlowState::SynSent => write!(f, "syn_sent"),
            FlowState::SynReceived => write!(f, "syn_received"),
            FlowState::Established => write!(f, "established"),
            FlowState::FinWait1 => write!(f, "fin_wait1"),
            FlowState::FinWait2 => write!(f, "fin_wait2"),
            FlowState::CloseWait => write!(f, "close_wait"),
            FlowState::Closing => write!(f, "closing"),
            FlowState::LastAck => write!(f, "last_ack"),
            FlowState::TimeWait => write!(f, "time_wait"),
            FlowState::Closed => write!(f, "closed"),
            FlowState::Unknown => write!(f, "unknown"),
        }
    }
}

/// Active socket connection flow mapped to local process ownership.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkFlow {
    /// Transport layer protocol (TCP/UDP)
    pub protocol: FlowProtocol,
    /// Local bound IP address
    pub local_address: String,
    /// Local port number
    pub local_port: u16,
    /// Remote target IP address (None for UDP/listening sockets)
    pub remote_address: Option<String>,
    /// Remote port number (None for UDP/listening sockets)
    pub remote_port: Option<u16>,
    /// Connection state
    pub state: FlowState,
    /// Process ID owning this socket
    pub pid: Option<u32>,
    /// Executable or process name owning this socket
    pub process_name: Option<String>,
    /// Associated network interface if bound to a specific adapter
    pub interface_name: Option<String>,
}

/// Structural model of a known local Wi-Fi network profile and non-secret metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WifiProfile {
    /// SSID or profile display name
    pub ssid: String,
    /// Associated wireless adapter interface name
    pub interface_name: Option<String>,
    /// True if currently connected to this Wi-Fi network
    pub connected: bool,
    /// Instantaneous signal quality (0 - 100 percent) where available
    pub signal_percent: Option<u8>,
    /// Normalized security classification (e.g. "WPA2-Personal", "WPA3-Personal", "Open")
    pub security: Option<String>,
    /// Encryption cipher (e.g. "AES", "TKIP", "GCMP", "None")
    pub cipher: Option<String>,
    /// Raw authentication type identifier (e.g. "WPA2PSK", "WPA3SAE", "Open")
    pub auth_type: Option<String>,
    /// True if profile configuration exists in local system storage
    pub has_profile: bool,
}

/// Supported transport/network protocols for packet observation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PacketProtocol {
    Tcp,
    Udp,
    Icmp,
    Icmpv6,
    Arp,
    Other,
}

impl std::fmt::Display for PacketProtocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PacketProtocol::Tcp => write!(f, "tcp"),
            PacketProtocol::Udp => write!(f, "udp"),
            PacketProtocol::Icmp => write!(f, "icmp"),
            PacketProtocol::Icmpv6 => write!(f, "icmpv6"),
            PacketProtocol::Arp => write!(f, "arp"),
            PacketProtocol::Other => write!(f, "other"),
        }
    }
}

/// Direction classification for an observed packet relative to the host.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PacketDirection {
    Inbound,
    Outbound,
    Local,
    Unknown,
}

impl std::fmt::Display for PacketDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PacketDirection::Inbound => write!(f, "inbound"),
            PacketDirection::Outbound => write!(f, "outbound"),
            PacketDirection::Local => write!(f, "local"),
            PacketDirection::Unknown => write!(f, "unknown"),
        }
    }
}

/// Normalized TCP header flags for an observed packet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct TcpFlags {
    pub syn: bool,
    pub ack: bool,
    pub fin: bool,
    pub rst: bool,
    pub psh: bool,
    pub urg: bool,
}

/// Structured, metadata-only observation of a single network packet.
/// Crucial Security Invariant: Absolutely NO application payload bytes or secrets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PacketObservation {
    pub id: String,
    pub timestamp: String,
    pub interface_name: String,
    pub protocol: PacketProtocol,
    pub direction: PacketDirection,
    pub source_ip: String,
    pub source_port: Option<u16>,
    pub destination_ip: String,
    pub destination_port: Option<u16>,
    pub packet_size_bytes: usize,
    pub tcp_flags: Option<TcpFlags>,
    pub summary: String,
}

/// Status and bounded metadata buffer for an active or recent packet monitoring session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct PacketCaptureStatus {
    pub is_active: bool,
    pub interface_name: Option<String>,
    pub started_at: Option<String>,
    pub duration_seconds: f64,
    pub max_duration_seconds: u32,
    pub packets_observed: u64,
    pub packets_dropped: u64,
    pub current_rate_pps: f64,
    pub observations: Vec<PacketObservation>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interface_type_display_and_serialization() {
        let t = InterfaceType::Wifi;
        assert_eq!(t.to_string(), "wifi");
        let serialized = serde_json::to_string(&t).unwrap();
        assert_eq!(serialized, "\"wifi\"");
        let deserialized: InterfaceType = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized, InterfaceType::Wifi);
    }

    #[test]
    fn test_operational_status_display_and_serialization() {
        let s = OperationalStatus::Up;
        assert_eq!(s.to_string(), "up");
        let serialized = serde_json::to_string(&s).unwrap();
        assert_eq!(serialized, "\"up\"");
        let deserialized: OperationalStatus = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized, OperationalStatus::Up);
    }

    #[test]
    fn test_network_interface_info_serialization_with_options() {
        let iface = NetworkInterfaceInfo {
            id: "iface-1".into(),
            name: "Wi-Fi".into(),
            description: Some("Intel Wi-Fi 6 AX200".into()),
            mac_address: Some("00:11:22:33:44:55".into()),
            interface_type: InterfaceType::Wifi,
            status: OperationalStatus::Up,
            is_physical: true,
            is_loopback: false,
            is_default_gateway: true,
            ipv4_addresses: vec!["192.168.1.50/24".into()],
            ipv6_addresses: vec!["fe80::1".into()],
            gateway: Some("192.168.1.1".into()),
            dns_servers: vec!["1.1.1.1".into(), "8.8.8.8".into()],
            mtu: Some(1500),
            link_speed_mbps: Some(1200),
            total_received_bytes: 1048576,
            total_transmitted_bytes: 524288,
            rates: Some(TrafficRates {
                rx_bytes_per_second: 10240.0,
                tx_bytes_per_second: 5120.0,
                rx_bits_per_second: 81920.0,
                tx_bits_per_second: 40960.0,
            }),
        };

        let json = serde_json::to_string(&iface).unwrap();
        assert!(json.contains("\"name\":\"Wi-Fi\""));
        assert!(json.contains("\"interface_type\":\"wifi\""));
        assert!(json.contains("\"status\":\"up\""));
        assert!(json.contains("\"rx_bits_per_second\":81920.0"));

        let deserialized: NetworkInterfaceInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "iface-1");
        assert_eq!(deserialized.description, Some("Intel Wi-Fi 6 AX200".into()));
        assert_eq!(deserialized.rates.unwrap().rx_bytes_per_second, 10240.0);
    }

    #[test]
    fn test_network_interface_info_none_fields() {
        let iface = NetworkInterfaceInfo {
            id: "lo".into(),
            name: "lo".into(),
            description: None,
            mac_address: None,
            interface_type: InterfaceType::Loopback,
            status: OperationalStatus::Up,
            is_physical: false,
            is_loopback: true,
            is_default_gateway: false,
            ipv4_addresses: vec!["127.0.0.1/8".into()],
            ipv6_addresses: vec!["::1".into()],
            gateway: None,
            dns_servers: vec![],
            mtu: None,
            link_speed_mbps: None,
            total_received_bytes: 0,
            total_transmitted_bytes: 0,
            rates: None,
        };

        let json = serde_json::to_string(&iface).unwrap();
        let deserialized: NetworkInterfaceInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "lo");
        assert_eq!(deserialized.description, None);
        assert_eq!(deserialized.mac_address, None);
        assert_eq!(deserialized.gateway, None);
        assert_eq!(deserialized.rates, None);
    }

    #[test]
    fn test_local_network_device_serialization() {
        let dev = LocalNetworkDevice {
            ip_address: "192.168.1.1".into(),
            mac_address: Some("00:11:22:33:44:55".into()),
            hostname: Some("router.local".into()),
            interface_name: Some("Wi-Fi".into()),
            is_gateway: true,
            is_self: false,
            state: DeviceState::Reachable,
            first_seen: Some(1700000000),
            last_seen: Some(1700000010),
        };

        let json = serde_json::to_string(&dev).unwrap();
        assert!(json.contains("\"ip_address\":\"192.168.1.1\""));
        assert!(json.contains("\"state\":\"reachable\""));
        assert!(json.contains("\"is_gateway\":true"));

        let deserialized: LocalNetworkDevice = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.ip_address, "192.168.1.1");
        assert_eq!(deserialized.state, DeviceState::Reachable);
        assert_eq!(deserialized.hostname, Some("router.local".into()));
    }

    #[test]
    fn test_network_flow_serialization() {
        let flow = NetworkFlow {
            protocol: FlowProtocol::Tcp,
            local_address: "127.0.0.1".into(),
            local_port: 9001,
            remote_address: Some("127.0.0.1".into()),
            remote_port: Some(54321),
            state: FlowState::Established,
            pid: Some(1234),
            process_name: Some("fluffy-core.exe".into()),
            interface_name: Some("Loopback".into()),
        };

        let json = serde_json::to_string(&flow).unwrap();
        assert!(json.contains("\"protocol\":\"tcp\""));
        assert!(json.contains("\"state\":\"established\""));
        assert!(json.contains("\"pid\":1234"));

        let deserialized: NetworkFlow = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.protocol, FlowProtocol::Tcp);
        assert_eq!(deserialized.local_port, 9001);
        assert_eq!(deserialized.state, FlowState::Established);
        assert_eq!(deserialized.pid, Some(1234));
    }

    #[test]
    fn test_wifi_profile_serialization() {
        let profile = WifiProfile {
            ssid: "Fluffy_5G".into(),
            interface_name: Some("Wi-Fi".into()),
            connected: true,
            signal_percent: Some(88),
            security: Some("WPA2-Personal".into()),
            cipher: Some("AES".into()),
            auth_type: Some("WPA2PSK".into()),
            has_profile: true,
        };

        let json = serde_json::to_string(&profile).unwrap();
        assert!(json.contains("\"ssid\":\"Fluffy_5G\""));
        assert!(json.contains("\"connected\":true"));
        assert!(json.contains("\"signal_percent\":88"));
        assert!(json.contains("\"security\":\"WPA2-Personal\""));

        // Crucial security invariant: Ensure no password or key fields exist in serialized representation
        assert!(!json.contains("password"));
        assert!(!json.contains("keyMaterial"));
        assert!(!json.contains("credential"));

        let deserialized: WifiProfile = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.ssid, "Fluffy_5G");
        assert_eq!(deserialized.signal_percent, Some(88));
        assert_eq!(deserialized.connected, true);
        assert_eq!(deserialized.cipher, Some("AES".into()));
    }

    #[test]
    fn test_packet_observation_serialization() {
        let obs = PacketObservation {
            id: "pkt-1".into(),
            timestamp: "2026-09-11T00:00:00Z".into(),
            interface_name: "eth0".into(),
            protocol: PacketProtocol::Tcp,
            direction: PacketDirection::Inbound,
            source_ip: "192.168.1.100".into(),
            source_port: Some(51234),
            destination_ip: "192.168.1.10".into(),
            destination_port: Some(8080),
            packet_size_bytes: 1420,
            tcp_flags: Some(TcpFlags {
                syn: true,
                ack: false,
                fin: false,
                rst: false,
                psh: false,
                urg: false,
            }),
            summary: "TCP SYN 192.168.1.100:51234 -> 192.168.1.10:8080 (1420 B)".into(),
        };

        let json = serde_json::to_string(&obs).unwrap();
        assert!(json.contains("\"protocol\":\"tcp\""));
        assert!(json.contains("\"direction\":\"inbound\""));
        assert!(json.contains("\"packet_size_bytes\":1420"));
        assert!(json.contains("\"syn\":true"));
        // Ensure no payload field
        assert!(!json.contains("payload"));
        assert!(!json.contains("body"));
        assert!(!json.contains("data_hex"));

        let deserialized: PacketObservation = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "pkt-1");
        assert_eq!(deserialized.protocol, PacketProtocol::Tcp);
        assert_eq!(deserialized.destination_port, Some(8080));
    }

    #[test]
    fn test_packet_capture_status_serialization() {
        let status = PacketCaptureStatus {
            is_active: true,
            interface_name: Some("Wi-Fi".into()),
            started_at: Some("2026-09-11T00:00:00Z".into()),
            duration_seconds: 12.5,
            max_duration_seconds: 60,
            packets_observed: 450,
            packets_dropped: 2,
            current_rate_pps: 36.0,
            observations: vec![],
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"is_active\":true"));
        assert!(json.contains("\"packets_observed\":450"));
        assert!(json.contains("\"packets_dropped\":2"));
        assert!(json.contains("\"current_rate_pps\":36.0"));

        let deserialized: PacketCaptureStatus = serde_json::from_str(&json).unwrap();
        assert!(deserialized.is_active);
        assert_eq!(deserialized.packets_observed, 450);
    }
}

