use sysinfo::Networks;
use crate::network::traffic::TrafficRateCalculator;
use crate::network::types::{
    InterfaceSample, InterfaceType, NetworkInterfaceInfo, OperationalStatus,
};

/// Categorize an interface type based on adapter name and metadata conventions.
pub fn classify_interface_type(name: &str, is_loopback: bool) -> InterfaceType {
    if is_loopback {
        return InterfaceType::Loopback;
    }

    let lower = name.to_lowercase();

    if lower.contains("loopback") || lower == "lo" {
        InterfaceType::Loopback
    } else if lower.contains("docker")
        || lower.contains("vethernet")
        || lower.contains("veth")
        || lower.contains("virbr")
        || lower.contains("vmnet")
        || lower.contains("vbox")
        || lower.contains("hyper-v")
        || lower.contains("virtual")
    {
        InterfaceType::Virtual
    } else if lower.contains("tun")
        || lower.contains("tap")
        || lower.contains("tailscale")
        || lower.contains("wireguard")
        || lower.starts_with("wg")
        || lower.contains("vpn")
        || lower.contains("ppp")
    {
        InterfaceType::Vpn
    } else if lower.contains("bridge") || lower.starts_with("br-") || lower == "br0" {
        InterfaceType::Bridge
    } else if lower.contains("wi-fi")
        || lower.contains("wlan")
        || lower.contains("wireless")
        || lower.contains("802.11")
        || lower.starts_with("wl")
    {
        InterfaceType::Wifi
    } else if lower.contains("ethernet")
        || lower.contains("eth")
        || lower.contains("lan")
        || lower.starts_with("en")
        || lower.contains("gigabit")
        || lower.contains("gbe")
    {
        InterfaceType::Ethernet
    } else {
        InterfaceType::Other
    }
}

/// Helper to sanitize and normalize a MAC address string. Returns None if blank or null/zero MAC.
pub fn normalize_mac_address(mac_str: &str) -> Option<String> {
    let trimmed = mac_str.trim();
    if trimmed.is_empty()
        || trimmed == "00:00:00:00:00:00"
        || trimmed == "00-00-00-00-00-00"
        || trimmed == "0:0:0:0:0:0"
    {
        None
    } else {
        Some(trimmed.to_uppercase())
    }
}

/// Enumerate local network interfaces using cross-platform system facilities.
pub fn get_interfaces() -> Vec<NetworkInterfaceInfo> {
    let networks = Networks::new_with_refreshed_list();
    let mut results = Vec::new();

    for (name, data) in &networks {
        let mut ipv4_addrs = Vec::new();
        let mut ipv6_addrs = Vec::new();

        for ip_net in data.ip_networks() {
            let addr_str = ip_net.to_string();
            if addr_str.contains(':') {
                ipv6_addrs.push(addr_str);
            } else {
                ipv4_addrs.push(addr_str);
            }
        }

        let is_loopback = name.to_lowercase() == "lo"
            || name.to_lowercase().contains("loopback")
            || ipv4_addrs.iter().any(|ip| ip.starts_with("127."));

        let iface_type = classify_interface_type(name, is_loopback);
        let is_physical = matches!(iface_type, InterfaceType::Ethernet | InterfaceType::Wifi);

        let mac = normalize_mac_address(&data.mac_address().to_string());
        let total_rx = data.total_received();
        let total_tx = data.total_transmitted();

        // Operational status inference: if it has IP addresses or active byte activity, it is UP
        let status = if !ipv4_addrs.is_empty() || !ipv6_addrs.is_empty() || total_rx > 0 || total_tx > 0 {
            OperationalStatus::Up
        } else {
            OperationalStatus::Down
        };

        results.push(NetworkInterfaceInfo {
            id: name.clone(),
            name: name.clone(),
            description: None, // Can be enriched by platform-specific providers
            mac_address: mac,
            interface_type: iface_type,
            status,
            is_physical,
            is_loopback,
            is_default_gateway: false, // Default gateway detection is an extension point
            ipv4_addresses: ipv4_addrs,
            ipv6_addresses: ipv6_addrs,
            gateway: None,
            dns_servers: Vec::new(),
            mtu: None,
            link_speed_mbps: None,
            total_received_bytes: total_rx,
            total_transmitted_bytes: total_tx,
            rates: None,
        });
    }

    results
}

/// Enumerate local network interfaces and calculate instantaneous traffic rates using a stateful calculator.
pub fn get_interfaces_with_rates(
    calculator: &mut TrafficRateCalculator,
    timestamp_nanos: u64,
) -> Vec<NetworkInterfaceInfo> {
    let mut ifaces = get_interfaces();

    for iface in &mut ifaces {
        let sample = InterfaceSample {
            rx_bytes: iface.total_received_bytes,
            tx_bytes: iface.total_transmitted_bytes,
            timestamp_nanos,
        };
        let rates = calculator.update(&iface.name, sample);
        iface.rates = Some(rates);
    }

    ifaces
}

/// Retrieve a single interface by name.
pub fn get_interface_by_name(name: &str) -> Option<NetworkInterfaceInfo> {
    get_interfaces().into_iter().find(|i| i.name == name || i.id == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_interface_types() {
        assert_eq!(classify_interface_type("Wi-Fi", false), InterfaceType::Wifi);
        assert_eq!(classify_interface_type("wlan0", false), InterfaceType::Wifi);
        assert_eq!(classify_interface_type("eth0", false), InterfaceType::Ethernet);
        assert_eq!(classify_interface_type("enp3s0", false), InterfaceType::Ethernet);
        assert_eq!(classify_interface_type("lo", true), InterfaceType::Loopback);
        assert_eq!(classify_interface_type("docker0", false), InterfaceType::Virtual);
        assert_eq!(classify_interface_type("vEthernet (Default Switch)", false), InterfaceType::Virtual);
        assert_eq!(classify_interface_type("tun0", false), InterfaceType::Vpn);
        assert_eq!(classify_interface_type("tailscale0", false), InterfaceType::Vpn);
        assert_eq!(classify_interface_type("br-lan", false), InterfaceType::Bridge);
        assert_eq!(classify_interface_type("random_dev", false), InterfaceType::Other);
    }

    #[test]
    fn test_normalize_mac_address() {
        assert_eq!(normalize_mac_address("00:11:22:33:44:55"), Some("00:11:22:33:44:55".into()));
        assert_eq!(normalize_mac_address("  aa:bb:cc:dd:ee:ff  "), Some("AA:BB:CC:DD:EE:FF".into()));
        assert_eq!(normalize_mac_address("00:00:00:00:00:00"), None);
        assert_eq!(normalize_mac_address(""), None);
    }

    #[test]
    fn test_get_interfaces_enumeration() {
        let ifaces = get_interfaces();
        // Every system has at least 1 interface (or loopback)
        assert!(!ifaces.is_empty(), "Interfaces should not be empty");
        for iface in &ifaces {
            assert!(!iface.name.is_empty());
            assert!(!iface.id.is_empty());
        }
    }

    #[test]
    fn test_get_interfaces_with_rates() {
        let mut calc = TrafficRateCalculator::new();
        let ifaces1 = get_interfaces_with_rates(&mut calc, 1_000_000_000);
        assert!(!ifaces1.is_empty());
        // First tick rates should be zero
        for iface in &ifaces1 {
            let rates = iface.rates.as_ref().expect("Rates should be present");
            assert_eq!(rates.rx_bytes_per_second, 0.0);
        }

        let ifaces2 = get_interfaces_with_rates(&mut calc, 2_000_000_000);
        assert!(!ifaces2.is_empty());
        for iface in &ifaces2 {
            assert!(iface.rates.is_some());
        }
    }
}
