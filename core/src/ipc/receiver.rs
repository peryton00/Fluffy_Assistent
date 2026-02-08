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
                let result = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .output();

                let status = match result {
                    Ok(out) if out.status.success() => "success",
                    Ok(out) => {
                        eprintln!("{:?}", out.stderr);
                        "failed"
                    }
                    Err(_) => "failed",
                };

                crate::ipc::server::IpcServer::broadcast_global(&crate::ipc::protocol::IpcMessage {
                    schema_version: "1.0".to_string(),
                    payload: serde_json::json!({
                        "type": "execution_result",
                        "command": "KillProcess",
                        "pid": pid,
                        "status": status
                    }),
                });
            }
        }
        IpcCommand::NormalizeSystem => {
            #[cfg(target_os = "windows")]
            {
                let mut status = "success";
                let mut details = "Volume reset (50%), Brightness optimized (70%), Temp files purged".to_string();

                // 1. Volume (50%) - Simpler Wscript.Shell method
                let vol_script = "$obj = new-object -com wscript.shell; for($i=0;$i-lt 50;$i++){$obj.SendKeys([char]174)}; for($i=0;$i-lt 25;$i++){$obj.SendKeys([char]175)}";
                
                let vol_res = std::process::Command::new("powershell")
                    .args(["-Command", vol_script])
                    .output();

                if let Err(e) = vol_res {
                    eprintln!("[Fluffy Core] Volume reset error: {}", e);
                    status = "partial_failure";
                    details = format!("Volume error: {}", e);
                }

                // 2. Brightness (70%) - WMI Method (Robust Pipeline)
                // Use Invoke-CimMethod to handle arrays (multiple monitors) and single instances correctly
                let bright_script = "
                    $target = 70;
                    $m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue;
                    if($m){ 
                        $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 0; Brightness = $target } 
                    } else {
                        $w = Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue;
                        if($w){ $w.WmiSetBrightness(1, $target) }
                    }
                ";
                let _ = std::process::Command::new("powershell")
                    .args(["-Command", bright_script])
                    .output();

                // 3. Temp Cleanup
                let temp_res = std::process::Command::new("powershell")
                    .args(["-Command", "Remove-Item -Path $env:TEMP\\* -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path C:\\Windows\\Temp\\* -Recurse -Force -ErrorAction SilentlyContinue"])
                    .output();
                if let Err(e) = temp_res {
                    eprintln!("[Fluffy Core] Temp cleanup error: {}", e);
                    status = "partial_failure";
                    details.push_str(&format!("; Temp error: {}", e));
                }

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

