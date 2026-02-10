mod ipc;
mod permissions;

use ipc::protocol::IpcMessage;
use ipc::receiver::start_command_server;
use ipc::server::IpcServer;

use serde::Serialize;
use std::collections::HashMap;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
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
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumValueW, RegOpenKeyExW, HKEY_CURRENT_USER, KEY_READ,
    };
    use std::ptr;

    let mut entries = Vec::new();
    let subkey = encode_wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let mut hkey: windows_sys::Win32::System::Registry::HKEY = 0;

    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
            let mut index = 0;
            loop {
                // Large buffers for name and data
                let mut name = [0u16; 16384];
                let mut name_len = name.len() as u32;
                let mut data = [0u8; 16384];
                let mut data_len = data.len() as u32;
                let mut type_code: u32 = 0;

                let res = RegEnumValueW(
                    hkey,
                    index,
                    name.as_mut_ptr(),
                    &mut name_len,
                    ptr::null_mut(),
                    &mut type_code,
                    data.as_mut_ptr(),
                    &mut data_len,
                );

                if res != 0 {
                    break;
                }

                let name_str = String::from_utf16_lossy(&name[..name_len as usize]);
                let name_str = name_str.trim_matches(char::from(0)).to_string();

                // Handle REG_SZ (1) and REG_EXPAND_SZ (2)
                let val_str = if type_code == 1 || type_code == 2 {
                    String::from_utf16_lossy(
                        &data.chunks_exact(2)
                            .map(|c| u16::from_ne_bytes([c[0], c[1]]))
                            .collect::<Vec<u16>>()[..(data_len as usize / 2)],
                    ).trim_matches(char::from(0)).to_string()
                } else {
                    format!("<binary data type={}>", type_code)
                };
                
                entries.push(StartupApp {
                    name: name_str,
                    command: val_str,
                    enabled: true, // simplified for now
                });
                index += 1;
            }
            RegCloseKey(hkey);
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

            ProcessInfo {
                pid: pid_u32,
                parent_pid: p.parent().map(|pp| pp.as_u32()),
                name: p.name().to_string_lossy().into_owned(),
                exe_path: p.exe().map(|path| path.to_string_lossy().into_owned()).unwrap_or_default(),
                ram_mb: kib_to_mb(p.memory()),
                cpu_percent: smoothed,
                disk_read_kb: disk.read_bytes / 1024,
                disk_written_kb: disk.written_bytes / 1024,
            }
        })
        .collect()
}

fn spawn_ui() {
    println!("[Fluffy Core] Spawning UI Dashboard...");
    println!("[Fluffy Core] NOTE: First boot or changes will trigger UI compilation (approx. 1-2 minutes).");
    println!("[Fluffy Core] Please do not close the terminal until the dashboard window appearing.");
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
        eprintln!("[Fluffy Core] Failed to spawn UI: {}. Make sure you are running core from its directory and npm is installed.", e);
    }
}

fn main() {
    let ipc = IpcServer::start(9001);
    start_command_server(9002);

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
            for (_, data) in &networks {
                total_received += data.received();
                total_transmitted += data.transmitted();
            }

            println!("[Fluffy Core] Broadcasting telemetry ({} processes)...", processes.len());
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
                    },
                    processes: ProcessStats { top_ram: processes },
                },
                persistence: get_startup_entries(),
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
