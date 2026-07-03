use std::path::PathBuf;
use sysinfo::{Disks, Networks, System};

/// Execute a command locally on the admin's machine.
/// Returns the output string.
pub fn execute_local(input: &str) -> String {
    let parts: Vec<&str> = input.splitn(2, char::is_whitespace).collect();
    let cmd = parts[0].to_lowercase();
    let args_str = if parts.len() > 1 { parts[1].trim() } else { "" };

    match cmd.as_str() {
        "ls" => {
            let path = if args_str.is_empty() {
                std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
            } else {
                PathBuf::from(args_str)
            };
            match list_dir(&path) {
                Ok(s) => s,
                Err(e) => e,
            }
        }
        "pwd" => std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        "cd" => {
            if args_str.is_empty() {
                "Usage: cd <path>".to_string()
            } else {
                match std::env::set_current_dir(args_str) {
                    Ok(_) => std::env::current_dir()
                        .map(|p| p.display().to_string())
                        .unwrap_or_else(|_| args_str.to_string()),
                    Err(e) => format!("cd: {}", e),
                }
            }
        }
        "cat" => {
            if args_str.is_empty() {
                "Usage: cat <file>".to_string()
            } else {
                match std::fs::read_to_string(args_str) {
                    Ok(content) => content,
                    Err(_) => "Binary file, cannot display.".to_string(),
                }
            }
        }
        "whoami" => {
            let hostname = hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "Unknown".to_string());
            #[cfg(target_os = "windows")]
            let username = std::env::var("USERNAME").unwrap_or_else(|_| "Unknown".to_string());
            #[cfg(not(target_os = "windows"))]
            let username = std::env::var("USER").unwrap_or_else(|_| "Unknown".to_string());
            format!("Device   : {}\nUsername : {}", hostname, username)
        }
        "sysinfo" => local_sysinfo(),
        "processes" => local_processes(),
        "kill" => {
            if args_str.is_empty() {
                "Usage: kill <pid>".to_string()
            } else {
                match args_str.parse::<u32>() {
                    Ok(pid) => local_kill(pid),
                    Err(_) => format!("Invalid PID: {}", args_str),
                }
            }
        }
        "disk" => local_disk_info(),
        "netinfo" => local_netinfo(),
        "battery" => "Run on target client for battery info. Admin machine uses 'sysinfo' for details.".to_string(),
        "users" => local_users(),
        "clipboard" => {
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("powershell")
                    .args(["-NoProfile", "-Command", "Get-Clipboard"])
                    .output()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .unwrap_or_else(|e| format!("Clipboard error: {}", e))
            }
            #[cfg(target_os = "macos")]
            {
                std::process::Command::new("pbpaste")
                    .output()
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                    .unwrap_or_else(|e| format!("Clipboard error: {}", e))
            }
            #[cfg(target_os = "linux")]
            {
                std::process::Command::new("xclip")
                    .args(["-selection", "clipboard", "-o"])
                    .output()
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                    .unwrap_or_else(|e| format!("Clipboard error: {}", e))
            }
            #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
            {
                "Clipboard not supported on this OS.".to_string()
            }
        }
        "ping" => "PONG (local)".to_string(),
        "sh" => {
            if args_str.is_empty() {
                "Usage: sh <command>".to_string()
            } else {
                local_shell(args_str)
            }
        }
        "locate" | "screenshot" | "alert" | "notify" | "lock" | "shutdown" | "restart"
        | "upload" | "download" => {
            format!(
                "Command '{}' is available but should be targeted to a client.\nUse: f1 {} or set alter mode with: f alter f1",
                cmd, input
            )
        }
        _ => format!(
            "Unknown command: '{}'. Type 'fluffy --help' to see all commands.",
            input
        ),
    }
}

fn list_dir(path: &PathBuf) -> Result<String, String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }
    let entries =
        std::fs::read_dir(path).map_err(|e| format!("Cannot read directory: {}", e))?;

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let name = entry.file_name().to_string_lossy().to_string();
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let line = if is_dir {
            format!("  DIR  {:>10}  {}", "-", name)
        } else {
            format!("  FILE {:>10}  {}", format_size(size), name)
        };
        if is_dir {
            dirs.push(line);
        } else {
            files.push(line);
        }
    }

    dirs.sort();
    files.sort();
    let mut out = format!("Directory: {}\n\n", path.display());
    for d in &dirs {
        out.push_str(d);
        out.push('\n');
    }
    for f in &files {
        out.push_str(f);
        out.push('\n');
    }
    if dirs.is_empty() && files.is_empty() {
        out.push_str("  (empty directory)\n");
    }
    out.push_str(&format!("\n  {} directories, {} files", dirs.len(), files.len()));
    Ok(out)
}

fn local_sysinfo() -> String {
    let mut sys = System::new_all();
    sys.refresh_all();

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or("Unknown".to_string());

    let cpus = sys.cpus();
    let cpu_brand = cpus.first().map(|c| c.brand().to_string()).unwrap_or("Unknown".to_string());
    let cpu_count = cpus.len();
    let physical_cores = sys.physical_core_count().unwrap_or(0);
    let total_ram = sys.total_memory();
    let used_ram = sys.used_memory();
    let uptime = System::uptime();

    format!(
        "Device   : {}\nCPU      : {} ({} cores, {} threads)\nRAM      : {} / {} used\nUptime   : {}h {}m\nArch     : {}",
        hostname,
        cpu_brand,
        physical_cores,
        cpu_count,
        format_size(used_ram),
        format_size(total_ram),
        uptime / 3600,
        (uptime % 3600) / 60,
        std::env::consts::ARCH,
    )
}

fn local_processes() -> String {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_all();

    let mut procs: Vec<_> = sys
        .processes()
        .iter()
        .map(|(pid, p)| (pid.as_u32(), p.name().to_string_lossy().into_owned(), p.cpu_usage(), p.memory() / 1024))
        .collect();

    procs.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut out = format!("  {:<8} {:<30} {:>6} {:>10}\n", "PID", "NAME", "CPU%", "MEM(KB)");
    out.push_str(&format!("  {}\n", "─".repeat(58)));
    for (pid, name, cpu, mem) in procs.iter().take(50) {
        out.push_str(&format!("  {:<8} {:<30} {:>5.1}% {:>10}\n", pid, name, cpu, mem));
    }
    out.push_str(&format!("\n  Showing top 50 of {} processes", procs.len()));
    out
}

fn local_kill(pid: u32) -> String {
    let sys = System::new_all();
    let pid_obj = sysinfo::Pid::from_u32(pid);
    match sys.process(pid_obj) {
        Some(p) => {
            if p.kill() {
                format!("Process {} killed.", pid)
            } else {
                format!("Failed to kill process {}.", pid)
            }
        }
        None => format!("Process {} not found.", pid),
    }
}

fn local_disk_info() -> String {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram = sys.total_memory();
    let used_ram = sys.used_memory();
    let available_ram = sys.available_memory();

    let mut out = String::new();
    out.push_str(&format!("  RAM: {} used / {} total ({} available)\n\n", format_size(used_ram), format_size(total_ram), format_size(available_ram)));

    let disks = Disks::new_with_refreshed_list();
    out.push_str(&format!("  {:<15} {:>10} {:>10} {:>10} {}\n", "MOUNT", "TOTAL", "USED", "FREE", "FS"));
    out.push_str(&format!("  {}\n", "─".repeat(55)));
    for d in disks.list() {
        let total = d.total_space();
        let avail = d.available_space();
        let used = total.saturating_sub(avail);
        let mount = d.mount_point().to_string_lossy();
        let fs = d.file_system().to_string_lossy().to_string();
        out.push_str(&format!("  {:<15} {:>10} {:>10} {:>10} {}\n", mount, format_size(total), format_size(used), format_size(avail), fs));
    }
    out
}

fn local_netinfo() -> String {
    let networks = Networks::new_with_refreshed_list();
    let mut out = String::from("  ── Network Interfaces ──\n");
    for (name, data) in &networks {
        out.push_str(&format!("  {}: MAC={} RX={} TX={}\n", name, data.mac_address(), data.total_received(), data.total_transmitted()));
    }
    out
}

fn local_users() -> String {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-LocalUser | Format-Table Name, Enabled, LastLogon"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_else(|e| format!("Error: {}", e))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("who")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_else(|e| format!("Error: {}", e))
    }
}

fn local_shell(cmd: &str) -> String {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(["/C", cmd])
        .output();
    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(["-c", cmd])
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            let mut result = stdout;
            if !stderr.is_empty() {
                result.push_str("\n[stderr] ");
                result.push_str(&stderr);
            }
            if result.trim().is_empty() {
                "(no output)".to_string()
            } else {
                result
            }
        }
        Err(e) => format!("Shell error: {}", e),
    }
}

fn format_size(bytes: u64) -> String {
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
