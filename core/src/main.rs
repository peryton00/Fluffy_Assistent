mod etw;
mod ipc;
mod permissions;
mod actions;

use etw::NetworkMonitor;

use ipc::protocol::IpcMessage;
use ipc::receiver::start_command_server;
use ipc::server::IpcServer;

use serde::Serialize;
use std::collections::HashMap;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Networks, ProcessesToUpdate, System};
pub static IS_UI_ACTIVE: AtomicBool = AtomicBool::new(false);

type CpuHistory = HashMap<u32, f32>;

#[derive(Serialize, Clone)]
struct ProcessInfo {
    pid: u32,
    parent_pid: Option<u32>,
    name: String,
    exe_path: String,
    ram_mb: u64,
    cpu_percent: f32,
    disk_read_kb: u64,
    disk_written_kb: u64,
    net_received: f32,
    net_sent: f32,
}

#[derive(Serialize)]
struct ProcessStats {
    top_ram: Vec<ProcessInfo>,
}

#[derive(Serialize)]
struct RamStats {
    total_mb: u64,
    used_mb: u64,
    free_mb: u64,
}

#[derive(Serialize)]
struct CpuStats {
    usage_percent: f32,
}

#[derive(Serialize)]
struct NetworkStats {
    received_kb: u64,
    transmitted_kb: u64,
    total_rx_kbps: f32,
    total_tx_kbps: f32,
    status: String, // "wifi", "ethernet", "offline"
}

#[derive(Serialize)]
struct SystemStats {
    ram: RamStats,
    cpu: CpuStats,
    network: NetworkStats,
    processes: ProcessStats,
}

#[derive(Serialize)]
struct FluffyMessage {
    schema_version: &'static str,
    timestamp: u64,
    system: SystemStats,
    persistence: Vec<StartupApp>,
    active_sessions: u32,
}

#[derive(Serialize)]
struct StartupApp {
    name: String,
    command: String,
    enabled: bool,
}

fn kib_to_mb(kib: u64) -> u64 {
    kib / 1024 / 1024
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[cfg(target_os = "windows")]
fn get_startup_entries() -> Vec<StartupApp> {
    use std::ptr;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ,
    };

    let mut entries = Vec::new();
    let run_path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    let approved_path =
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";

    // 1. Read from HKCU and HKLM
    for &hive in &[HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let hive_name = if hive == HKEY_CURRENT_USER {
            "HKCU"
        } else {
            "HKLM"
        };

        // Collect "Disabled" states first
        let mut disabled_map = std::collections::HashMap::new();
        let approved_subkey = encode_wide(approved_path);
        let mut h_approved: windows_sys::Win32::System::Registry::HKEY = 0;
        unsafe {
            if RegOpenKeyExW(hive, approved_subkey.as_ptr(), 0, KEY_READ, &mut h_approved) == 0 {
                let mut index = 0;
                loop {
                    let mut name = [0u16; 1024];
                    let mut name_len = name.len() as u32;
                    let mut data = [0u8; 1024];
                    let mut data_len = data.len() as u32;
                    let mut type_code: u32 = 0;

                    if RegEnumValueW(
                        h_approved,
                        index,
                        name.as_mut_ptr(),
                        &mut name_len,
                        ptr::null_mut(),
                        &mut type_code,
                        data.as_mut_ptr(),
                        &mut data_len,
                    ) != 0
                    {
                        break;
                    }
                    let name_str = String::from_utf16_lossy(&name[..name_len as usize])
                        .trim_matches(char::from(0))
                        .to_string();
                    // Task Manager: bit 0 of first byte. 0x02 is enabled, 0x03 (octal 03?) or similar is disabled.
                    // Actually, if the first byte is even (0x02, 0x06, etc), it's enabled. If odd (0x03, 0x07), it's disabled.
                    if data_len > 0 {
                        let is_disabled = (data[0] & 1) == 1;
                        disabled_map.insert(name_str, is_disabled);
                    }
                    index += 1;
                }
                RegCloseKey(h_approved);
            }
        }

        let run_subkey = encode_wide(run_path);
        let mut h_run: windows_sys::Win32::System::Registry::HKEY = 0;
        unsafe {
            if RegOpenKeyExW(hive, run_subkey.as_ptr(), 0, KEY_READ, &mut h_run) == 0 {
                let mut index = 0;
                loop {
                    let mut name = [0u16; 16384];
                    let mut name_len = name.len() as u32;
                    let mut data = [0u8; 16384];
                    let mut data_len = data.len() as u32;
                    let mut type_code: u32 = 0;

                    if RegEnumValueW(
                        h_run,
                        index,
                        name.as_mut_ptr(),
                        &mut name_len,
                        ptr::null_mut(),
                        &mut type_code,
                        data.as_mut_ptr(),
                        &mut data_len,
                    ) != 0
                    {
                        break;
                    }

                    let name_str = String::from_utf16_lossy(&name[..name_len as usize])
                        .trim_matches(char::from(0))
                        .to_string();
                    let val_str = if type_code == 1 || type_code == 2 {
                        String::from_utf16_lossy(
                            &data
                                .chunks_exact(2)
                                .map(|c| u16::from_ne_bytes([c[0], c[1]]))
                                .collect::<Vec<u16>>()[..(data_len as usize / 2)],
                        )
                        .trim_matches(char::from(0))
                        .to_string()
                    } else {
                        format!("<binary data type={}>", type_code)
                    };

                    let is_disabled = *disabled_map.get(&name_str).unwrap_or(&false);

                    entries.push(StartupApp {
                        name: format!("{} ({})", name_str, hive_name),
                        command: val_str,
                        enabled: !is_disabled,
                    });
                    index += 1;
                }
                RegCloseKey(h_run);
            }
        }
    }

    // 2. Scan Startup Folders
    let folders = vec![
        std::env::var("APPDATA")
            .map(|s| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup", s)),
        std::env::var("ProgramData")
            .map(|s| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup", s)),
    ];

    for folder in folders.into_iter().flatten() {
        if let Ok(dir) = std::fs::read_dir(&folder) {
            for entry in dir.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        let path = entry.path().to_string_lossy().into_owned();
                        entries.push(StartupApp {
                            name: format!("{} (Folder)", name),
                            command: path,
                            enabled: true, // Folder items are generally enabled unless moved/renamed
                        });
                    }
                }
            }
        }
    }

    entries
}

fn encode_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(not(target_os = "windows"))]
fn get_startup_entries() -> Vec<StartupApp> {
    Vec::new()
}

fn collect_processes(system: &System, cpu_history: &mut CpuHistory) -> Vec<ProcessInfo> {
    system
        .processes()
        .iter()
        .map(|(pid, p)| {
            let pid_u32 = pid.as_u32();
            let cpu = p.cpu_usage();

            // Explicit smoothing: 70% new, 30% old
            let old_cpu = cpu_history.get(&pid_u32).cloned().unwrap_or(cpu);
            let smoothed = (cpu * 0.7) + (old_cpu * 0.3);
            cpu_history.insert(pid_u32, smoothed);

            let disk = p.disk_usage();

            // 🌐 Live ETW Network Stats
            let mut rx_kbps = 0.0;
            let mut tx_kbps = 0.0;

            // We use the global map to pull deltas for this PID
            if let Some(entry) = etw::NETWORK_DELTAS.get(&pid_u32) {
                // Calculation: (Bytes / 1024) / Interval (2s)
                tx_kbps = (entry.0 as f32 / 1024.0) / 2.0;
                rx_kbps = (entry.1 as f32 / 1024.0) / 2.0;
            }
            // Note: We don't remove here, pull_stats or a periodic clear should handle it if needed
            // However, to keep it simple, we can just consume it here if we want strictly 1-reader
            // But let's stay with the global map and periodic flush in pull_stats instead.
            // Wait, collect_processes is called every loop. If we don't clear, it will be cumulative.
            // Let's consume (reset to 0) the entry after reading.
            if let Some(mut entry) = etw::NETWORK_DELTAS.get_mut(&pid_u32) {
                *entry = (0, 0);
            }

            ProcessInfo {
                pid: pid_u32,
                parent_pid: p.parent().map(|pp| pp.as_u32()),
                name: p.name().to_string_lossy().into_owned(),
                exe_path: p
                    .exe()
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                ram_mb: kib_to_mb(p.memory()),
                cpu_percent: smoothed,
                disk_read_kb: disk.read_bytes / 1024,
                disk_written_kb: disk.written_bytes / 1024,
                net_received: rx_kbps,
                net_sent: tx_kbps,
            }
        })
        .collect()
}

fn spawn_listener() {
    println!("[Fluffy Core] Spawning Brain...");

    let ui_dir = "../brain";

    #[cfg(target_os = "windows")]
    let res = std::process::Command::new("cmd")
        .args(["/C", "python listener.py"])
        .current_dir(ui_dir)
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let res = std::process::Command::new("python")
        .args(["listener.py"])
        .current_dir(ui_dir)
        .spawn();

    if let Err(e) = res {
        eprintln!(
            "[Fluffy Core] Failed to spawn brain: {}. Make sure you are running core from its directory and python is installed.",
            e
        );
    }
}

fn spawn_ui() {
    println!("[Fluffy Core] Spawning UI Dashboard...");
    println!(
        "[Fluffy Core] NOTE: First boot or changes will trigger UI compilation (approx. 1-2 minutes)."
    );
    println!(
        "[Fluffy Core] Please do not close the terminal until the dashboard window appearing."
    );
    let ui_dir = "../ui/tauri";

    #[cfg(target_os = "windows")]
    let res = std::process::Command::new("cmd")
        .args(["/C", "npm run tauri dev"])
        .current_dir(ui_dir)
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let res = std::process::Command::new("npm")
        .args(["run", "tauri", "dev"])
        .current_dir(ui_dir)
        .spawn();

    if let Err(e) = res {
        eprintln!(
            "[Fluffy Core] Failed to spawn UI: {}. Make sure you are running core from its directory and npm is installed.",
            e
        );
    }
}

fn main() {
    let ipc = IpcServer::start(9001);
    start_command_server(9002);

    // 🌐 Start ETW Network Monitor (Requires Admin)
    NetworkMonitor::start();
    
    // 👂 Start Brain Listener
    spawn_listener();
    // 🚀 Launch UI Dashboard automatically
    spawn_ui();

    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    ctrlc::set_handler(move || {
        eprintln!("\n[Fluffy Core] Shutdown signal received");
        r.store(false, Ordering::SeqCst);
    })
    .expect("Failed to set Ctrl+C handler");

    let mut system = System::new_all();
    let mut networks = Networks::new_with_refreshed_list();
    let mut cpu_history = CpuHistory::new();

    while running.load(Ordering::SeqCst) {
        if IS_UI_ACTIVE.load(Ordering::SeqCst) {
            system.refresh_memory();
            system.refresh_cpu_all();
            system.refresh_processes(ProcessesToUpdate::All, true);
            networks.refresh(true);

            let mut processes = collect_processes(&system, &mut cpu_history);
            processes.sort_by(|a, b| b.ram_mb.cmp(&a.ram_mb));

            let total_mb = kib_to_mb(system.total_memory());
            let free_mb = kib_to_mb(system.available_memory());
            let used_mb = total_mb - free_mb;

            let mut total_received = 0;
            let mut total_transmitted = 0;
            let mut total_rx_kbps = 0.0;
            let mut total_tx_kbps = 0.0;
            let mut connection_type = "offline";

            for (name, data) in &networks {
                let rx = data.received();
                let tx = data.transmitted();
                total_received += rx;
                total_transmitted += tx;

                // KB/s calculation based on 2s interval
                total_rx_kbps += (rx as f32 / 1024.0) / 2.0;
                total_tx_kbps += (tx as f32 / 1024.0) / 2.0;

                // Basic heuristic for connection type
                if rx > 0 || tx > 0 {
                    let name_lower = name.to_lowercase();
                    if name_lower.contains("wi-fi")
                        || name_lower.contains("wlan")
                        || name_lower.contains("wireless")
                    {
                        connection_type = "wifi";
                    } else if name_lower.contains("ethernet")
                        || name_lower.contains("eth")
                        || name_lower.contains("en0")
                    {
                        // If we haven't found wifi, or this is a strong indicator
                        if connection_type != "wifi" {
                            connection_type = "ethernet";
                        }
                    } else if connection_type == "offline" {
                        connection_type = "ethernet"; // Default active to ethernet
                    }
                }
            }

            println!(
                "[Fluffy Core] Broadcasting telemetry ({} processes)...",
                processes.len()
            );
            let message = FluffyMessage {
                schema_version: "1.0",
                timestamp: unix_timestamp(),
                system: SystemStats {
                    ram: RamStats {
                        total_mb,
                        used_mb,
                        free_mb,
                    },
                    cpu: CpuStats {
                        usage_percent: system.global_cpu_usage(),
                    },
                    network: NetworkStats {
                        received_kb: total_received / 1024,
                        transmitted_kb: total_transmitted / 1024,
                        total_rx_kbps,
                        total_tx_kbps,
                        status: connection_type.to_string(),
                    },
                    processes: ProcessStats { top_ram: processes },
                },
                persistence: get_startup_entries(),
                active_sessions: 1, // Hardcoded: UI is active if we are here
            };

            let payload = serde_json::to_value(&message).unwrap();

            ipc.broadcast(&IpcMessage {
                schema_version: "1.0".to_string(),
                payload,
            });
        }

        // 👇 IMPORTANT: sleep in small chunks so shutdown is responsive
        for _ in 0..20 {
            if !running.load(Ordering::SeqCst) {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    // Broadcast shutdown signal
    let shutdown_payload = serde_json::json!({
        "type": "shutdown",
        "timestamp": unix_timestamp()
    });

    ipc.broadcast(&IpcMessage {
        schema_version: "1.0".to_string(),
        payload: shutdown_payload,
    });

    // Give clients time to receive the message
    thread::sleep(Duration::from_millis(500));

    // 👇 clean exit point
    eprintln!("[Fluffy Core] Clean shutdown complete");
}
