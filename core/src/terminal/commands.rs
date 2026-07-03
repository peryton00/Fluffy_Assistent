use serde::{Deserialize, Serialize};

/// All commands that can be executed on a client or locally.
/// Each variant carries its own arguments if needed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Command {
    /// List files at path (default: cwd)
    Ls { path: Option<String> },
    /// Print working directory
    Pwd,
    /// Change directory
    Cd { path: String },
    /// Print file contents
    Cat { path: String },
    /// Show device name + logged-in user
    Whoami,
    /// Full system information
    Sysinfo,
    /// List all running processes
    Processes,
    /// Kill a process by PID
    Kill { pid: u32 },
    /// Disk and RAM info
    DiskInfo,
    /// Lock the screen
    Lock,
    /// Shutdown the machine
    Shutdown,
    /// Restart the machine
    Restart,
    /// Show a desktop notification
    Notify { message: String },
    /// Play an alert sound
    Alert,
    /// Network-based geolocation
    Locate,
    /// Network information
    NetInfo,
    /// List user accounts
    Users,
    /// Capture screenshot
    Screenshot,
    /// Read clipboard text
    Clipboard,
    /// Battery status
    Battery,
    /// Upload file from admin to client
    Upload {
        filename: String,
        data: Vec<u8>,
    },
    /// Download file from client to admin
    Download { path: String },
    /// Ping/pong latency check
    Ping,
    /// Execute a raw shell command
    Shell { command: String },
}

pub struct CommandMetadata {
    pub name: &'static str,
    pub usage: &'static str,
    pub description: &'static str,
}

pub fn get_client_commands() -> Vec<CommandMetadata> {
    vec![
        CommandMetadata { name: "ls", usage: "ls [path]", description: "List files and folders" },
        CommandMetadata { name: "pwd", usage: "pwd", description: "Print working directory" },
        CommandMetadata { name: "cd", usage: "cd <path>", description: "Change directory" },
        CommandMetadata { name: "cat", usage: "cat <file>", description: "Print file contents" },
        CommandMetadata { name: "whoami", usage: "whoami", description: "Device name + username + role" },
        CommandMetadata { name: "sysinfo", usage: "sysinfo", description: "Full system information" },
        CommandMetadata { name: "processes", usage: "processes", description: "List all processes (by CPU%)" },
        CommandMetadata { name: "kill", usage: "kill <pid>", description: "Kill a process by PID" },
        CommandMetadata { name: "disk", usage: "disk --info", description: "RAM + disk usage info" },
        CommandMetadata { name: "lock", usage: "lock", description: "Lock the target's screen" },
        CommandMetadata { name: "shutdown", usage: "shutdown", description: "Shutdown the target" },
        CommandMetadata { name: "restart", usage: "restart", description: "Restart the target" },
        CommandMetadata { name: "notify", usage: "notify \"msg\"", description: "Desktop notification on target" },
        CommandMetadata { name: "alert", usage: "alert", description: "Play alert sound on target" },
        CommandMetadata { name: "locate", usage: "locate", description: "Network geolocation (IP-based)" },
        CommandMetadata { name: "netinfo", usage: "netinfo", description: "Network information" },
        CommandMetadata { name: "users", usage: "users", description: "List user accounts" },
        CommandMetadata { name: "screenshot", usage: "screenshot", description: "Capture screen (save as PNG)" },
        CommandMetadata { name: "clipboard", usage: "clipboard", description: "Read clipboard text content" },
        CommandMetadata { name: "battery", usage: "battery", description: "Battery status" },
        CommandMetadata { name: "upload", usage: "upload <file>", description: "Transfer file TO target" },
        CommandMetadata { name: "download", usage: "download <file>", description: "Transfer file FROM target" },
        CommandMetadata { name: "ping", usage: "ping", description: "Latency check (returns PONG)" },
        CommandMetadata { name: "sh", usage: "sh <command>", description: "Run raw shell command" },
    ]
}
