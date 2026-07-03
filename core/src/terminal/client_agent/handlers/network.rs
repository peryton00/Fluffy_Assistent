use std::net::UdpSocket;
use sysinfo::Networks;

/// Handle netinfo command — network information.
pub fn handle_netinfo() -> Result<String, String> {
    let mut output = String::new();
    output.push_str("  ── Network Information ──────────────────\n\n");

    // Local IP
    let local_ip = get_local_ip();
    output.push_str(&format!("  Local IP      : {}\n", local_ip));

    // Public IP (try to get it)
    let public_ip = get_public_ip_sync();
    output.push_str(&format!("  Public IP     : {}\n", public_ip));

    // MAC address and interfaces
    let networks = Networks::new_with_refreshed_list();
    output.push_str("\n  ── Interfaces ──────────────────────────\n");
    for (name, data) in &networks {
        let mac = data.mac_address();
        output.push_str(&format!("  {:<16} MAC: {}\n", name, mac));
        output.push_str(&format!("    Received  : {} bytes\n", data.total_received()));
        output.push_str(&format!("    Sent      : {} bytes\n", data.total_transmitted()));
    }

    // Default gateway and DNS
    let (gateway, dns) = get_gateway_and_dns();
    output.push_str(&format!("\n  Gateway       : {}\n", gateway));
    output.push_str(&format!("  DNS Servers   : {}\n", dns));

    Ok(output)
}

fn get_local_ip() -> String {
    let socket = UdpSocket::bind("0.0.0.0:0");
    match socket {
        Ok(s) => {
            if s.connect("8.8.8.8:80").is_ok() {
                if let Ok(addr) = s.local_addr() {
                    return addr.ip().to_string();
                }
            }
            "Unknown".to_string()
        }
        Err(_) => "Unknown".to_string(),
    }
}

fn get_public_ip_sync() -> String {
    let output = std::process::Command::new("curl")
        .args(["-s", "--max-time", "3", "https://api.ipify.org"])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => {
            #[cfg(target_os = "windows")]
            {
                let output = std::process::Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-Command",
                        "(Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 3).Content",
                    ])
                    .output();
                match output {
                    Ok(o) if o.status.success() => {
                        String::from_utf8_lossy(&o.stdout).trim().to_string()
                    }
                    _ => "Unable to determine (no internet or service unavailable)".to_string(),
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                "Unable to determine (no internet or service unavailable)".to_string()
            }
        }
    }
}

fn get_gateway_and_dns() -> (String, String) {
    #[cfg(target_os = "windows")]
    {
        let gw = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Select-Object -First 1).NextHop",
            ])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        let dns = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-DnsClientServerAddress | Select-Object -ExpandProperty ServerAddresses) -join ', '",
            ])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        (gw, dns)
    }
    #[cfg(target_os = "linux")]
    {
        let gw = std::process::Command::new("ip")
            .args(["route", "show", "default"])
            .output()
            .ok()
            .map(|o| {
                let text = String::from_utf8_lossy(&o.stdout);
                text.split_whitespace()
                    .nth(2)
                    .unwrap_or("Unknown")
                    .to_string()
            })
            .unwrap_or_else(|| "Unknown".to_string());

        let dns = std::fs::read_to_string("/etc/resolv.conf")
            .ok()
            .map(|content| {
                content
                    .lines()
                    .filter(|l| l.starts_with("nameserver"))
                    .filter_map(|l| l.split_whitespace().nth(1))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "Unknown".to_string());

        (gw, dns)
    }
    #[cfg(target_os = "macos")]
    {
        let gw = std::process::Command::new("route")
            .args(["-n", "get", "default"])
            .output()
            .ok()
            .map(|o| {
                let text = String::from_utf8_lossy(&o.stdout);
                text.lines()
                    .find(|l| l.contains("gateway"))
                    .and_then(|l| l.split(':').nth(1))
                    .map(|s| s.trim().to_string())
                    .unwrap_or_else(|| "Unknown".to_string())
            })
            .unwrap_or_else(|| "Unknown".to_string());

        let dns = std::process::Command::new("scutil")
            .args(["--dns"])
            .output()
            .ok()
            .map(|o| {
                let text = String::from_utf8_lossy(&o.stdout);
                text.lines()
                    .filter(|l| l.contains("nameserver"))
                    .filter_map(|l| l.split(':').nth(1))
                    .map(|s| s.trim().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "Unknown".to_string());

        (gw, dns)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        ("Unknown".to_string(), "Unknown".to_string())
    }
}
