use crate::terminal::commands::Command;

/// Parse a raw input string into a Command enum.
/// Returns None if the input doesn't match any known command.
pub fn parse_command(input: &str) -> Option<Command> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }

    // Split into command and arguments
    let parts: Vec<&str> = input.splitn(2, char::is_whitespace).collect();
    let cmd = parts[0].to_lowercase();
    let args_str = if parts.len() > 1 {
        parts[1].trim()
    } else {
        ""
    };

    match cmd.as_str() {
        "ls" => {
            let path = if args_str.is_empty() {
                None
            } else {
                Some(args_str.to_string())
            };
            Some(Command::Ls { path })
        }
        "pwd" => Some(Command::Pwd),
        "cd" => {
            if args_str.is_empty() {
                None // cd requires a path
            } else {
                Some(Command::Cd {
                    path: args_str.to_string(),
                })
            }
        }
        "cat" => {
            if args_str.is_empty() {
                None
            } else {
                Some(Command::Cat {
                    path: args_str.to_string(),
                })
            }
        }
        "whoami" => Some(Command::Whoami),
        "sysinfo" => Some(Command::Sysinfo),
        "processes" => Some(Command::Processes),
        "kill" => {
            if args_str.is_empty() {
                None
            } else {
                match args_str.parse::<u32>() {
                    Ok(pid) => Some(Command::Kill { pid }),
                    Err(_) => None,
                }
            }
        }
        "disk" => {
            // Accept "disk --info" or just "disk"
            Some(Command::DiskInfo)
        }
        "lock" => Some(Command::Lock),
        "shutdown" => Some(Command::Shutdown),
        "restart" => Some(Command::Restart),
        "notify" => {
            if args_str.is_empty() {
                None
            } else {
                // Strip surrounding quotes if present
                let msg = args_str.trim_matches('"').trim_matches('\'').to_string();
                Some(Command::Notify { message: msg })
            }
        }
        "alert" => Some(Command::Alert),
        "locate" => Some(Command::Locate),
        "netinfo" => Some(Command::NetInfo),
        "users" => Some(Command::Users),
        "screenshot" => Some(Command::Screenshot),
        "clipboard" => Some(Command::Clipboard),
        "battery" => Some(Command::Battery),
        "upload" => {
            if args_str.is_empty() {
                None
            } else {
                Some(Command::Upload {
                    filename: args_str.to_string(),
                    data: Vec::new(), // Data is filled in by the admin before sending
                })
            }
        }
        "download" => {
            if args_str.is_empty() {
                None
            } else {
                Some(Command::Download {
                    path: args_str.to_string(),
                })
            }
        }
        "ping" => Some(Command::Ping),
        "sh" => {
            if args_str.is_empty() {
                None
            } else {
                Some(Command::Shell {
                    command: args_str.to_string(),
                })
            }
        }
        _ => None,
    }
}
