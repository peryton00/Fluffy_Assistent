use std::collections::HashMap;
use sysinfo::{ProcessesToUpdate, System};
use crate::network::types::{FlowProtocol, FlowState, NetworkFlow};

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::ptr;

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct MIB_TCPROW_OWNER_PID {
        dw_state: u32,
        dw_local_addr: u32,
        dw_local_port: u32,
        dw_remote_addr: u32,
        dw_remote_port: u32,
        dw_owning_pid: u32,
    }

    #[repr(C)]
    struct MIB_TCPTABLE_OWNER_PID {
        dw_num_entries: u32,
        table: [MIB_TCPROW_OWNER_PID; 1],
    }

    #[repr(C)]
    #[derive(Debug, Copy, Clone)]
    struct MIB_UDPROW_OWNER_PID {
        dw_local_addr: u32,
        dw_local_port: u32,
        dw_owning_pid: u32,
    }

    #[repr(C)]
    struct MIB_UDPTABLE_OWNER_PID {
        dw_num_entries: u32,
        table: [MIB_UDPROW_OWNER_PID; 1],
    }

    const AF_INET: u32 = 2;
    const TCP_TABLE_OWNER_PID_ALL: u32 = 5;
    const UDP_TABLE_OWNER_PID: u32 = 1;

    #[link(name = "iphlpapi")]
    extern "system" {
        fn GetExtendedTcpTable(
            pTcpTable: *mut std::ffi::c_void,
            pdwSize: *mut u32,
            bOrder: i32,
            ulAf: u32,
            TableClass: u32,
            Reserved: u32,
        ) -> u32;

        fn GetExtendedUdpTable(
            pUdpTable: *mut std::ffi::c_void,
            pdwSize: *mut u32,
            bOrder: i32,
            ulAf: u32,
            TableClass: u32,
            Reserved: u32,
        ) -> u32;
    }

    fn parse_tcp_state(dw_state: u32) -> FlowState {
        match dw_state {
            1 => FlowState::Closed,
            2 => FlowState::Listen,
            3 => FlowState::SynSent,
            4 => FlowState::SynReceived,
            5 => FlowState::Established,
            6 => FlowState::FinWait1,
            7 => FlowState::FinWait2,
            8 => FlowState::CloseWait,
            9 => FlowState::Closing,
            10 => FlowState::LastAck,
            11 => FlowState::TimeWait,
            _ => FlowState::Unknown,
        }
    }

    fn u32_to_ipv4(addr: u32) -> String {
        let b = addr.to_ne_bytes();
        format!("{}.{}.{}.{}", b[0], b[1], b[2], b[3])
    }

    fn port_from_dw(dw_port: u32) -> u16 {
        u16::from_be(dw_port as u16)
    }

    pub fn get_tcp_flows(proc_map: &HashMap<u32, String>) -> Vec<NetworkFlow> {
        let mut size: u32 = 0;
        let mut flows = Vec::new();

        unsafe {
            let _ = GetExtendedTcpTable(
                ptr::null_mut(),
                &mut size,
                1,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            );

            if size == 0 {
                return flows;
            }

            let mut buffer = vec![0u8; size as usize];
            let table_ptr = buffer.as_mut_ptr() as *mut MIB_TCPTABLE_OWNER_PID;

            if GetExtendedTcpTable(
                table_ptr as *mut std::ffi::c_void,
                &mut size,
                1,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            ) == 0
            {
                let count = (*table_ptr).dw_num_entries as usize;
                let rows_ptr = (*table_ptr).table.as_ptr();

                for i in 0..count {
                    let row = *rows_ptr.add(i);
                    let local_ip = u32_to_ipv4(row.dw_local_addr);
                    let local_port = port_from_dw(row.dw_local_port);
                    let remote_ip = u32_to_ipv4(row.dw_remote_addr);
                    let remote_port = port_from_dw(row.dw_remote_port);
                    let state = parse_tcp_state(row.dw_state);
                    let pid = row.dw_owning_pid;

                    let (rem_ip, rem_port) = if state == FlowState::Listen || remote_ip == "0.0.0.0" {
                        (None, None)
                    } else {
                        (Some(remote_ip), Some(remote_port))
                    };

                    let process_name = proc_map.get(&pid).cloned();

                    flows.push(NetworkFlow {
                        protocol: FlowProtocol::Tcp,
                        local_address: local_ip,
                        local_port,
                        remote_address: rem_ip,
                        remote_port: rem_port,
                        state,
                        pid: if pid > 0 { Some(pid) } else { None },
                        process_name,
                        interface_name: None,
                    });
                }
            }
        }

        flows
    }

    pub fn get_udp_flows(proc_map: &HashMap<u32, String>) -> Vec<NetworkFlow> {
        let mut size: u32 = 0;
        let mut flows = Vec::new();

        unsafe {
            let _ = GetExtendedUdpTable(
                ptr::null_mut(),
                &mut size,
                1,
                AF_INET,
                UDP_TABLE_OWNER_PID,
                0,
            );

            if size == 0 {
                return flows;
            }

            let mut buffer = vec![0u8; size as usize];
            let table_ptr = buffer.as_mut_ptr() as *mut MIB_UDPTABLE_OWNER_PID;

            if GetExtendedUdpTable(
                table_ptr as *mut std::ffi::c_void,
                &mut size,
                1,
                AF_INET,
                UDP_TABLE_OWNER_PID,
                0,
            ) == 0
            {
                let count = (*table_ptr).dw_num_entries as usize;
                let rows_ptr = (*table_ptr).table.as_ptr();

                for i in 0..count {
                    let row = *rows_ptr.add(i);
                    let local_ip = u32_to_ipv4(row.dw_local_addr);
                    let local_port = port_from_dw(row.dw_local_port);
                    let pid = row.dw_owning_pid;
                    let process_name = proc_map.get(&pid).cloned();

                    flows.push(NetworkFlow {
                        protocol: FlowProtocol::Udp,
                        local_address: local_ip,
                        local_port,
                        remote_address: None,
                        remote_port: None,
                        state: FlowState::Listen, // UDP is connectionless
                        pid: if pid > 0 { Some(pid) } else { None },
                        process_name,
                        interface_name: None,
                    });
                }
            }
        }

        flows
    }
}

/// Pure testable parser for Linux /proc/net/tcp and /proc/net/udp format.
pub fn parse_linux_proc_net(
    content: &str,
    protocol: FlowProtocol,
    _proc_map: &HashMap<u32, String>,
) -> Vec<NetworkFlow> {
    let mut flows = Vec::new();

    for line in content.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }

        // Format: sl local_address rem_address st
        // local_address: 0100007F:1F90 (hex IP:hex Port)
        let local_pair: Vec<&str> = parts[1].split(':').collect();
        let rem_pair: Vec<&str> = parts[2].split(':').collect();
        let st_hex = parts[3];

        if local_pair.len() != 2 || rem_pair.len() != 2 {
            continue;
        }

        let local_ip = parse_hex_ipv4(local_pair[0]);
        let local_port = u16::from_str_radix(local_pair[1], 16).unwrap_or(0);
        let rem_ip = parse_hex_ipv4(rem_pair[0]);
        let rem_port = u16::from_str_radix(rem_pair[1], 16).unwrap_or(0);

        let state = match st_hex {
            "01" => FlowState::Established,
            "02" => FlowState::SynSent,
            "03" => FlowState::SynReceived,
            "04" => FlowState::FinWait1,
            "05" => FlowState::FinWait2,
            "06" => FlowState::TimeWait,
            "07" => FlowState::Closed,
            "08" => FlowState::CloseWait,
            "09" => FlowState::LastAck,
            "0A" => FlowState::Listen,
            "0B" => FlowState::Closing,
            _ => FlowState::Unknown,
        };

        let (final_rem_ip, final_rem_port) = if state == FlowState::Listen || rem_ip == "0.0.0.0" {
            (None, None)
        } else {
            (Some(rem_ip), Some(rem_port))
        };

        // If inode or UID mapping is available, proc_map lookup can be attached
        let pid = None;
        let process_name = None;

        flows.push(NetworkFlow {
            protocol,
            local_address: local_ip,
            local_port,
            remote_address: final_rem_ip,
            remote_port: final_rem_port,
            state,
            pid,
            process_name,
            interface_name: None,
        });
    }

    flows
}

fn parse_hex_ipv4(hex_str: &str) -> String {
    if let Ok(num) = u32::from_str_radix(hex_str, 16) {
        let b = num.to_ne_bytes();
        // In Linux /proc/net/tcp, 0100007F on little-endian reads as 127.0.0.1
        format!("{}.{}.{}.{}", b[0], b[1], b[2], b[3])
    } else {
        "0.0.0.0".to_string()
    }
}

/// Enumerate active TCP and UDP network flows mapped to process ownership.
pub fn get_active_flows() -> Vec<NetworkFlow> {
    // Build PID -> Process Name map from sysinfo
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut proc_map = HashMap::new();
    for (pid, proc_) in system.processes() {
        proc_map.insert(pid.as_u32(), proc_.name().to_string_lossy().into_owned());
    }

    #[cfg(target_os = "windows")]
    {
        let mut flows = windows::get_tcp_flows(&proc_map);
        let udp_flows = windows::get_udp_flows(&proc_map);
        flows.extend(udp_flows);
        flows
    }

    #[cfg(target_os = "linux")]
    {
        let mut flows = Vec::new();
        if let Ok(tcp) = std::fs::read_to_string("/proc/net/tcp") {
            flows.extend(parse_linux_proc_net(&tcp, FlowProtocol::Tcp, &proc_map));
        }
        if let Ok(udp) = std::fs::read_to_string("/proc/net/udp") {
            flows.extend(parse_linux_proc_net(&udp, FlowProtocol::Udp, &proc_map));
        }
        flows
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
    fn test_parse_linux_proc_net_tcp() {
        let sample_tcp = r#"  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345 1 0000000000000000 100 0 0 10 0
   1: 0100007F:1F90 0100007F:C001 01 00000000:00000000 00:00000000 00000000  1000        0 12346 1 0000000000000000 100 0 0 10 0
"#;

        let proc_map = HashMap::new();
        let flows = parse_linux_proc_net(sample_tcp, FlowProtocol::Tcp, &proc_map);

        assert_eq!(flows.len(), 2);

        // Flow 0: Listen socket on port 8080 (0x1F90)
        assert_eq!(flows[0].protocol, FlowProtocol::Tcp);
        assert_eq!(flows[0].local_address, "127.0.0.1");
        assert_eq!(flows[0].local_port, 8080);
        assert_eq!(flows[0].remote_address, None);
        assert_eq!(flows[0].state, FlowState::Listen);

        // Flow 1: Established connection to 127.0.0.1:49153 (0xC001)
        assert_eq!(flows[1].protocol, FlowProtocol::Tcp);
        assert_eq!(flows[1].local_port, 8080);
        assert_eq!(flows[1].remote_address, Some("127.0.0.1".into()));
        assert_eq!(flows[1].remote_port, Some(49153));
        assert_eq!(flows[1].state, FlowState::Established);
    }

    #[test]
    fn test_parse_linux_proc_net_udp() {
        let sample_udp = r#"  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:1388 00000000:0000 07 00000000:00000000 00:00000000 00000000  1000        0 54321 1 0000000000000000 100 0 0 10 0
"#;

        let proc_map = HashMap::new();
        let flows = parse_linux_proc_net(sample_udp, FlowProtocol::Udp, &proc_map);

        assert_eq!(flows.len(), 1);
        assert_eq!(flows[0].protocol, FlowProtocol::Udp);
        assert_eq!(flows[0].local_port, 5000); // 0x1388 = 5000
        assert_eq!(flows[0].remote_address, None);
    }

    #[test]
    fn test_get_active_flows_live_system() {
        let flows = get_active_flows();
        // On a live system, there are typically active TCP/UDP listening or established sockets
        assert!(!flows.is_empty(), "Live system should return active network flows");
        for flow in &flows {
            assert!(flow.local_port > 0);
            assert!(!flow.local_address.is_empty());
        }
    }
}
