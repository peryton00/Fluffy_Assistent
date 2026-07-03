use sysinfo::System;
use crate::terminal::client_agent::platform;

/// Handle the sysinfo command — full system information.
pub fn handle_sysinfo() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    let os_details = platform::get_os_details();
    let gpu_info = platform::get_gpu_info();
    let install_date = platform::get_install_date();

    // CPU info
    let cpus = sys.cpus();
    let cpu_brand = cpus.first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown".to_string());
    let cpu_count = cpus.len();
    let physical_cores = sys.physical_core_count().unwrap_or(0);
    let cpu_freq = cpus.first().map(|c| c.frequency()).unwrap_or(0);
    let cpu_usage: f32 = if cpus.is_empty() {
        0.0
    } else {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
    };

    // RAM info
    let total_ram = sys.total_memory();
    let used_ram = sys.used_memory();
    let available_ram = sys.available_memory();
    let ram_pct = if total_ram > 0 {
        (used_ram as f64 / total_ram as f64) * 100.0
    } else {
        0.0
    };

    // Uptime
    let uptime_secs = System::uptime();
    let days = uptime_secs / 86400;
    let hours = (uptime_secs % 86400) / 3600;
    let mins = (uptime_secs % 3600) / 60;

    let arch = std::env::consts::ARCH;

    let mut output = String::new();
    output.push_str("╔══════════════════════════════════════════╗\n");
    output.push_str("║          SYSTEM INFORMATION              ║\n");
    output.push_str("╚══════════════════════════════════════════╝\n\n");

    output.push_str(&format!("  Device Name  : {}\n", hostname));
    output.push_str(&format!("  System Type  : {}\n\n", arch));

    output.push_str("  ── OS ──────────────────────────────────\n");
    output.push_str(&format!("  OS           : {}\n", os_details.name));
    if !os_details.edition.is_empty() {
        output.push_str(&format!("  Edition      : {}\n", os_details.edition));
    }
    if !os_details.version.is_empty() {
        output.push_str(&format!("  Version      : {}\n", os_details.version));
    }
    if !os_details.build.is_empty() {
        output.push_str(&format!("  Build        : {}\n", os_details.build));
    }
    output.push_str(&format!("  Install Date : {}\n\n", install_date));

    output.push_str("  ── CPU ─────────────────────────────────\n");
    output.push_str(&format!("  Brand        : {}\n", cpu_brand));
    output.push_str(&format!("  Cores        : {} physical, {} logical\n", physical_cores, cpu_count));
    output.push_str(&format!("  Clock        : {} MHz\n", cpu_freq));
    output.push_str(&format!("  Usage        : {:.1}%\n\n", cpu_usage));

    output.push_str("  ── RAM ─────────────────────────────────\n");
    output.push_str(&format!("  Total        : {}\n", format_bytes(total_ram)));
    output.push_str(&format!("  Used         : {}\n", format_bytes(used_ram)));
    output.push_str(&format!("  Available    : {}\n", format_bytes(available_ram)));
    output.push_str(&format!("  Usage        : {:.1}%\n\n", ram_pct));

    output.push_str("  ── GPU ─────────────────────────────────\n");
    output.push_str(&format!("  {}\n\n", gpu_info));

    output.push_str("  ── Uptime ──────────────────────────────\n");
    output.push_str(&format!("  {}d {}h {}m\n", days, hours, mins));

    Ok(output)
}

/// Handle whoami command.
pub fn handle_whoami() -> Result<String, String> {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());

    let username = get_current_username();
    let role = get_current_role();

    Ok(format!(
        "Device   : {}\nUsername : {}\nRole     : {}",
        hostname, username, role
    ))
}

fn get_current_username() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERNAME").unwrap_or_else(|_| "Unknown".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("USER").unwrap_or_else(|_| "Unknown".to_string())
    }
}

fn get_current_role() -> String {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)"])
            .output();
        match output {
            Ok(o) => {
                let text = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if text.to_lowercase() == "true" { "admin".to_string() } else { "standard".to_string() }
            }
            Err(_) => "standard".to_string(),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let uid = unsafe { libc_geteuid() };
        if uid == 0 { "admin (root)".to_string() } else { "standard".to_string() }
    }
}

#[cfg(not(target_os = "windows"))]
fn libc_geteuid() -> u32 {
    std::process::Command::new("id")
        .arg("-u")
        .output()
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok())
        .unwrap_or(1000)
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
