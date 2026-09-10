use crate::network::interfaces::{get_interfaces, normalize_mac_address};
use crate::network::types::{DeviceState, LocalNetworkDevice};

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::ptr;

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct MIB_IPNETROW {
        dw_index: u32,
        dw_phys_addr_len: u32,
        b_phys_addr: [u8; 8],
        dw_addr: u32,
        dw_type: u32,
    }

    #[repr(C)]
    struct MIB_IPNETTABLE {
        dw_num_entries: u32,
        table: [MIB_IPNETROW; 1],
    }

    #[link(name = "iphlpapi")]
    extern "system" {
        fn GetIpNetTable(
            pIpNetTable: *mut MIB_IPNETTABLE,
            pdwSize: *mut u32,
            bOrder: i32,
        ) -> u32;
    }

    pub fn get_neighbor_devices(self_ips: &[String]) -> Vec<LocalNetworkDevice> {
        let mut size: u32 = 0;
        let mut devices = Vec::new();

        unsafe {
            // First call to determine required buffer size
            let _ret = GetIpNetTable(ptr::null_mut(), &mut size, 1);
            if size == 0 {
                return devices;
            }

            let mut buffer = vec![0u8; size as usize];
            let table_ptr = buffer.as_mut_ptr() as *mut MIB_IPNETTABLE;

            if GetIpNetTable(table_ptr, &mut size, 1) == 0 {
                let num_entries = (*table_ptr).dw_num_entries as usize;
                let rows_ptr = (*table_ptr).table.as_ptr();

                for i in 0..num_entries {
                    let row = *rows_ptr.add(i);

                    // dw_type: 1 = Other, 2 = Invalid, 3 = Dynamic, 4 = Static
                    if row.dw_type == 2 {
                        continue; // Skip invalid entries
                    }

                    // Convert dw_addr (network byte order / little-endian representation) to IPv4
                    let ip_bytes = row.dw_addr.to_ne_bytes();
                    let ip = format!("{}.{}.{}.{}", ip_bytes[0], ip_bytes[1], ip_bytes[2], ip_bytes[3]);

                    // Ignore loopback and multicast / broadcast ranges
                    if ip == "0.0.0.0" || ip == "255.255.255.255" || ip.starts_with("224.") || ip.starts_with("239.") || ip.starts_with("127.") {
                        continue;
                    }

                    let mac_len = (row.dw_phys_addr_len as usize).min(6);
                    let mac_str = if mac_len == 6 {
                        Some(format!(
                            "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                            row.b_phys_addr[0],
                            row.b_phys_addr[1],
                            row.b_phys_addr[2],
                            row.b_phys_addr[3],
                            row.b_phys_addr[4],
                            row.b_phys_addr[5]
                        ))
                    } else {
                        None
                    };

                    let normalized_mac = mac_str.and_then(|m| normalize_mac_address(&m));
                    let is_self = self_ips.iter().any(|s| s == &ip || s.starts_with(&format!("{}/", ip)));
                    let is_gateway = ip.ends_with(".1") || ip.ends_with(".254");

                    let state = match row.dw_type {
                        3 => DeviceState::Reachable, // Dynamic active entry
                        4 => DeviceState::Permanent, // Static entry
                        _ => DeviceState::Stale,
                    };

                    devices.push(LocalNetworkDevice {
                        ip_address: ip,
                        mac_address: normalized_mac,
                        hostname: None,
                        interface_name: None,
                        is_gateway,
                        is_self,
                        state,
                        first_seen: None,
                        last_seen: None,
                    });
                }
            }
        }

        devices
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    pub fn get_neighbor_devices(self_ips: &[String]) -> Vec<LocalNetworkDevice> {
        if let Ok(content) = std::fs::read_to_string("/proc/net/arp") {
            parse_linux_arp(&content, self_ips)
        } else {
            Vec::new()
        }
    }
}

/// Pure testable parser for Linux /proc/net/arp contents.
pub fn parse_linux_arp(content: &str, self_ips: &[String]) -> Vec<LocalNetworkDevice> {
    let mut devices = Vec::new();

    // Format of /proc/net/arp:
    // IP address       HW type     Flags       HW address            Mask     Device
    // 192.168.1.1      0x1         0x2         00:11:22:33:44:55     *        eth0
    for line in content.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            continue;
        }

        let ip = parts[0].to_string();
        let flags_str = parts[2];
        let mac_raw = parts[3];
        let iface = parts[5].to_string();

        let mac = normalize_mac_address(mac_raw);
        let flags = u32::from_str_radix(flags_str.trim_start_matches("0x"), 16).unwrap_or(0);

        let state = if flags & 0x02 != 0 {
            DeviceState::Reachable // Complete entry
        } else if flags & 0x04 != 0 {
            DeviceState::Permanent
        } else {
            DeviceState::Incomplete
        };

        let is_self = self_ips.iter().any(|s| s == &ip || s.starts_with(&format!("{}/", ip)));
        let is_gateway = ip.ends_with(".1") || ip.ends_with(".254");

        devices.push(LocalNetworkDevice {
            ip_address: ip,
            mac_address: mac,
            hostname: None,
            interface_name: Some(iface),
            is_gateway,
            is_self,
            state,
            first_seen: None,
            last_seen: None,
        });
    }

    devices
}

/// Discover local network neighbor devices passively via OS neighbor tables.
pub fn get_local_devices() -> Vec<LocalNetworkDevice> {
    let local_ifaces = get_interfaces();
    let mut self_ips = Vec::new();

    for iface in &local_ifaces {
        for ip in &iface.ipv4_addresses {
            // Strip CIDR prefix if present (e.g. 192.168.1.50/24 -> 192.168.1.50)
            let ip_only = ip.split('/').next().unwrap_or(ip).to_string();
            self_ips.push(ip_only);
        }
    }

    #[cfg(target_os = "windows")]
    {
        windows::get_neighbor_devices(&self_ips)
    }

    #[cfg(target_os = "linux")]
    {
        linux::get_neighbor_devices(&self_ips)
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_linux_arp_complete() {
        let sample_arp = r#"IP address       HW type     Flags       HW address            Mask     Device
192.168.1.1      0x1         0x2         00:11:22:33:44:55     *        eth0
192.168.1.50     0x1         0x2         AA:BB:CC:DD:EE:FF     *        eth0
192.168.1.100    0x1         0x0         00:00:00:00:00:00     *        wlan0
"#;

        let self_ips = vec!["192.168.1.50".to_string()];
        let devices = parse_linux_arp(sample_arp, &self_ips);

        assert_eq!(devices.len(), 3);

        // Gateway
        assert_eq!(devices[0].ip_address, "192.168.1.1");
        assert_eq!(devices[0].mac_address, Some("00:11:22:33:44:55".into()));
        assert_eq!(devices[0].is_gateway, true);
        assert_eq!(devices[0].is_self, false);
        assert_eq!(devices[0].state, DeviceState::Reachable);

        // Self
        assert_eq!(devices[1].ip_address, "192.168.1.50");
        assert_eq!(devices[1].mac_address, Some("AA:BB:CC:DD:EE:FF".into()));
        assert_eq!(devices[1].is_self, true);

        // Incomplete / Zero MAC
        assert_eq!(devices[2].ip_address, "192.168.1.100");
        assert_eq!(devices[2].mac_address, None);
        assert_eq!(devices[2].state, DeviceState::Incomplete);
    }

    #[test]
    fn test_parse_linux_arp_empty_or_malformed() {
        let empty_arp = "IP address       HW type     Flags       HW address            Mask     Device\n";
        let devs = parse_linux_arp(empty_arp, &[]);
        assert!(devs.is_empty());

        let malformed = "some random non-arp garbage\nshort line";
        let devs2 = parse_linux_arp(malformed, &[]);
        assert!(devs2.is_empty());
    }

    #[test]
    fn test_get_local_devices_live_system() {
        let devs = get_local_devices();
        // On live system, this should run without crashing and return valid entries or empty list
        for dev in &devs {
            assert!(!dev.ip_address.is_empty());
            assert!(!dev.ip_address.contains("0.0.0.0"));
        }
    }
}
