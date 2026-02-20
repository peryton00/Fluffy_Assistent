use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
// use std::process::Command;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use uuid::Uuid;

use crate::ipc::command::Command as IpcCommand;
use crate::permissions::decision::PermissionDecision;
use crate::permissions::policy::evaluate;

static PENDING: Lazy<Mutex<HashMap<String, IpcCommand>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn start_command_server(port: u16) {
    let listener = TcpListener::bind(("127.0.0.1", port)).expect("Failed to bind command port");
    println!("[Fluffy Core] Command server listening on port {}", port);

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let reader = BufReader::new(stream);
                for line in reader.lines().flatten() {
                    println!("[Fluffy Core] Received command line: {}", line);
                    match serde_json::from_str::<IpcCommand>(&line) {
                        Ok(cmd) => handle_command(cmd),
                        Err(e) => eprintln!("[Fluffy Core] Failed to parse command: {}", e),
                    }
                }
            }
        }
    });
}

static KILL_HISTORY: Lazy<Mutex<Vec<std::time::Instant>>> = Lazy::new(|| Mutex::new(Vec::new()));
const PROTECTED_PROCESSES: &[&str] = &["csrss.exe", "wininit.exe", "lsass.exe", "services.exe", "smss.exe", "winlogon.exe"];

fn handle_command(cmd: IpcCommand) {
    match cmd {
        IpcCommand::Confirm { command_id } => {
            if let Some(original) = PENDING.lock().unwrap().remove(&command_id) {
                execute(original);
            }
        }

        IpcCommand::Cancel { command_id } => {
            PENDING.lock().unwrap().remove(&command_id);
        }

        IpcCommand::SetUiActive { active } => {
            println!("[Fluffy Core] Setting UI Active status to: {}", active);
            crate::IS_UI_ACTIVE.store(active, std::sync::atomic::Ordering::SeqCst);
        }

        other => match evaluate(&other) {
            PermissionDecision::Allow => execute(other),

            PermissionDecision::RequireConfirmation { reason } => {
                let id = Uuid::new_v4().to_string();
                PENDING.lock().unwrap().insert(id.clone(), other.clone());

                // Broadcast confirmation request as JSON over IPC
                let payload = serde_json::json!({
                    "type": "confirm_required",
                    "command_id": id,
                    "command_name": format!("{:?}", other),
                    "details": reason
                });

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload,
                });
            }

            PermissionDecision::Deny { reason } => {
                println!("[DENIED] {}", reason);
            }
        },
    }
}

fn execute(cmd: IpcCommand) {
    match cmd {
        IpcCommand::KillProcess { pid } => {
            #[cfg(target_os = "windows")]
            {
                use sysinfo::{Pid, System, ProcessesToUpdate};
                use std::time::{Duration, Instant};

                let mut status = "success";
                let mut error_msg = String::new();

                // 1. Rate Limiting Check
                let now = Instant::now();
                let mut history = KILL_HISTORY.lock().unwrap();
                // Remove entries older than 10 seconds
                history.retain(|&t| now.duration_since(t) < Duration::from_secs(10));
                
                if history.len() >= 3 {
                    status = "error";
                    error_msg = "Rate limit exceeded: >3 kills in 10s".to_string();
                } else {
                    // 2. Protected Process Check
                    let mut sys = System::new();
                    let target_pid = Pid::from_u32(pid);
                    // Refresh only the specific process
                    sys.refresh_processes(ProcessesToUpdate::Some(&[target_pid]), true);

                    if let Some(process) = sys.process(target_pid) {
                        let name = process.name().to_string_lossy().to_lowercase(); // sysinfo might return OsStr
                            if PROTECTED_PROCESSES.contains(&name.as_str()) {
                            status = "error";
                            error_msg = format!("Protected system process: {}", name);
                        }
                    }
                    // If process not found, we let taskkill handle it (it might error "process not found")
                }

                if status == "success" {
                     // Record this attempt for rate limiting (only if we are actually proceeding)
                     history.push(now);
                     
                    let result = std::process::Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .output();

                    status = match result {
                        Ok(out) if out.status.success() => "success",
                        Ok(out) => {
                            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                            error_msg = stderr.trim().to_string();
                            "error"
                        }
                        Err(e) => {
                            error_msg = e.to_string();
                            "error"
                        }
                    };
                }

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "KillProcess",
                        "pid": pid,
                        "status": status,
                        "error": if error_msg.is_empty() { None } else { Some(error_msg) }
                    }),
                });
            }
        }
        IpcCommand::StartupAdd { name, path } => {
            #[cfg(target_os = "windows")]
            {
                // PowerShell is robust for registry operations
                let script = format!(
                    "New-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '{}' -Value '{}' -PropertyType String -Force",
                    name.replace("'", "''"), 
                    path.replace("'", "''")
                );

                let output = std::process::Command::new("powershell")
                    .args(["-Command", &script])
                    .output();

                let (status, error) = match output {
                    Ok(out) if out.status.success() => ("success", None),
                    Ok(out) => ("error", Some(String::from_utf8_lossy(&out.stderr).trim().to_string())),
                    Err(e) => ("error", Some(e.to_string())),
                };

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "StartupAdd",
                        "status": status,
                        "error": error
                    }),
                });
            }
        }

        IpcCommand::StartupRemove { name } => {
            #[cfg(target_os = "windows")]
            {
                let mut status = "success";
                let mut error = None;

                // Parse source from name e.g. "My App (HKCU)" or "script.bat (Folder)"
                if name.ends_with("(HKCU)") {
                    let real_name = name.strip_suffix(" (HKCU)").unwrap();
                    let script = format!(
                        "Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '{}' -Force",
                        real_name.replace("'", "''")
                    );
                    let output = std::process::Command::new("powershell").args(["-Command", &script]).output();
                    if let Ok(out) = output {
                        if !out.status.success() {
                            status = "error";
                            error = Some(String::from_utf8_lossy(&out.stderr).trim().to_string());
                        }
                    } else if let Err(e) = output {
                        status = "error";
                        error = Some(e.to_string());
                    }
                } else if name.ends_with("(HKLM)") {
                    let real_name = name.strip_suffix(" (HKLM)").unwrap();
                    let script = format!(
                        "Remove-ItemProperty -Path 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '{}' -Force",
                        real_name.replace("'", "''")
                    );
                    let output = std::process::Command::new("powershell").args(["-Command", &script]).output();
                    if let Ok(out) = output {
                        if !out.status.success() {
                            status = "error";
                            error = Some("Failed to remove HKLM entry. Ensure Fluffy is running as Administrator.".to_string());
                        }
                    } else if let Err(e) = output {
                        status = "error";
                        error = Some(e.to_string());
                    }
                } else if name.ends_with("(Folder)") {
                    let real_name = name.strip_suffix(" (Folder)").unwrap();
                    // We need the full path to delete from folder. 
                    // Since we only have the name here, we'd have to scan both folders to find it.
                    let folders = vec![
                        std::env::var("APPDATA").map(|s| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup", s)),
                        std::env::var("ProgramData").map(|s| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup", s)),
                    ];
                    let mut found = false;
                    for folder in folders.into_iter().flatten() {
                        let path = std::path::Path::new(&folder).join(real_name);
                        if path.exists() {
                            if let Err(e) = std::fs::remove_file(path) {
                                status = "error";
                                error = Some(format!("Failed to delete file: {}", e));
                            }
                            found = true;
                            break;
                        }
                    }
                    if !found {
                        status = "error";
                        error = Some("Startup file not found.".to_string());
                    }
                } else {
                    // Fallback for legacy items or items without suffix (defaults to HKCU)
                    let script = format!(
                        "Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '{}' -Force",
                        name.replace("'", "''")
                    );
                    let _ = std::process::Command::new("powershell").args(["-Command", &script]).output();
                }

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "StartupRemove",
                        "status": status,
                        "error": error
                    }),
                });
            }
        }

        IpcCommand::StartupToggle { name, enabled } => {
            #[cfg(target_os = "windows")]
            {
                let mut status = "success";
                let mut error = None;

                // Handle registry entries only for now. Folder entries are complex to toggle.
                if name.ends_with("(HKCU)") || name.ends_with("(HKLM)") {
                    let (_hive_path, approved_path) = if name.ends_with("(HKCU)") {
                        ("HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", 
                         "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
                    } else {
                        ("HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                         "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
                    };

                    let real_name = if name.ends_with("(HKCU)") {
                        name.strip_suffix(" (HKCU)").unwrap()
                    } else {
                        name.strip_suffix(" (HKLM)").unwrap()
                    };

                    // Value 0x02 enabled, 0x03 disabled (binary byte array)
                    let hex_val = if enabled { "02,00,00,00,00,00,00,00,00,00,00,00" } else { "03,00,00,00,00,00,00,00,00,00,00,00" };
                    
                    let script = format!(
                        "Set-ItemProperty -Path '{}' -Name '{}' -Value ([byte[]]({})) -Type Binary -Force",
                        approved_path,
                        real_name.replace("'", "''"),
                        hex_val
                    );

                    let output = std::process::Command::new("powershell").args(["-Command", &script]).output();
                    if let Ok(out) = output {
                        if !out.status.success() {
                            status = "error";
                            error = Some(String::from_utf8_lossy(&out.stderr).trim().to_string());
                        }
                    } else if let Err(e) = output {
                        status = "error";
                        error = Some(e.to_string());
                    }
                } else {
                    status = "error";
                    error = Some("Only registry startup items can be toggled currently.".to_string());
                }

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "StartupToggle",
                        "status": status,
                        "error": error
                    }),
                });
            }
        }

        IpcCommand::NormalizeSystem => {
            #[cfg(target_os = "windows")]
            {
                let mut status = "success";
                let mut details = "System normalization and optimization pulse complete.".to_string();

                // 1. A/V Normalization (Volume 50%, Brightness 70%)
                let av_script = "
                    $obj = new-object -com wscript.shell; for($i=0;$i-lt 50;$i++){$obj.SendKeys([char]174)}; for($i=0;$i-lt 25;$i++){$obj.SendKeys([char]175)};
                    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue;
                    if($m){ $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = 70 } }
                ";
                let _ = std::process::Command::new("powershell").args(["-Command", av_script]).output();

                // 2. Comprehensive Cleanup (Temp, Prefetch, SoftwareDistribution, Recycle Bin)
                let cleanup_script = "
                    $paths = @(\"$env:TEMP\\*\", \"C:\\Windows\\Temp\\*\", \"C:\\Windows\\Prefetch\\*\", \"C:\\Windows\\SoftwareDistribution\\Download\\*\");
                    foreach($p in $paths){ Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue }
                    Clear-RecycleBin -Confirm:$false -ErrorAction SilentlyContinue;
                ";
                let _ = std::process::Command::new("powershell").args(["-Command", cleanup_script]).output();

                // 3. Cache & Network (DNS Flush)
                let _ = std::process::Command::new("ipconfig").arg("/flushdns").output();

                // 4. Memory & Performance (Trim working sets, SSD Re-trim)
                let opt_script = "
                    Get-Process | ForEach-Object { try { $_.Trim(); } catch {} };
                    Optimize-Volume -DriveLetter C -ReTrim -ErrorAction SilentlyContinue;
                ";
                let _ = std::process::Command::new("powershell").args(["-Command", opt_script]).output();

                // 5. Browser Cache Patterns (Chrome & Edge)
                let browser_script = "
                    $local = $env:LOCALAPPDATA;
                    $bPaths = @(
                        \"$local\\Google\\Chrome\\User Data\\Default\\Cache\\*\",
                        \"$local\\Google\\Chrome\\User Data\\Default\\Code Cache\\*\",
                        \"$local\\Microsoft\\Edge\\User Data\\Default\\Cache\\*\",
                        \"$local\\Microsoft\\Edge\\User Data\\Default\\Code Cache\\*\"
                    );
                    foreach($p in $bPaths){ Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue }
                ";
                let _ = std::process::Command::new("powershell").args(["-Command", browser_script]).output();

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "NormalizeSystem",
                        "status": status,
                        "details": details
                    }),
                });
            }

            #[cfg(not(target_os = "windows"))]
            {
                let mut status = "success";
                let mut details = "Linux system normalization initialized (Temp, Cache, and RAM pulse).".to_string();

                // 1. Temp & Cache Cleanup
                let cleanup_cmd = "rm -rf /tmp/* /var/tmp/* ~/.cache/* 2>/dev/null";
                let _ = std::process::Command::new("sh").args(["-c", cleanup_cmd]).output();

                // 2. Memory Optimization (Drop caches if root, sync disks)
                let mem_cmd = "sync; if [ \"$(id -u)\" -eq 0 ]; then echo 3 > /proc/sys/vm/drop_caches; fi";
                let _ = std::process::Command::new("sh").args(["-c", mem_cmd]).output();

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "NormalizeSystem",
                        "status": status,
                        "details": details
                    }),
                });
            }
        }

        _ => {}
    }
}

