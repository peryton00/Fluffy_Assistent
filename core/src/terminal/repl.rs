use crate::terminal::app_state::{SharedState, TerminalMode, ClientServiceStatus};
use crate::terminal::client_agent::run_client_agent;
use crate::terminal::client_manager;
use crate::terminal::local_executor;
use crate::terminal::parser::parse_command;
use std::sync::Arc;

pub async fn process_input(state: &SharedState, raw_input: &str) {
    let input = raw_input.trim();
    if input.is_empty() {
        return;
    }

    // Add to history (avoid duplicates)
    {
        let mut st = state.lock().await;
        if st.command_history.last() != Some(&input.to_string()) {
            st.command_history.push(input.to_string());
        }
    }

    // to --client / to --admin
    if input == "to --client" {
        let mut st = state.lock().await;
        st.mode = TerminalMode::Client;
        st.add_output("system", "Switched to Client View.", "success");
        return;
    }
    if input == "to --admin" {
        let mut st = state.lock().await;
        st.mode = TerminalMode::Admin;
        st.add_output("system", "Switched to Admin View.", "success");
        return;
    }

    // client --start <ip> --port <port>
    if input.starts_with("client --start") {
        let rest = input.strip_prefix("client --start").unwrap().trim();
        let parts: Vec<&str> = rest.split_whitespace().collect();

        let (ip, port) = if parts.is_empty() {
            let mut st = state.lock().await;
            st.add_output("system", "Usage: client --start <ip> --port <port>", "error");
            st.add_output("system", "Example: client --start 192.168.1.5 --port 9000", "dim");
            return;
        } else if parts.len() == 1 {
            let mut st = state.lock().await;
            st.add_output("system", "Missing --port flag. Usage: client --start <ip> --port <port>", "error");
            st.add_output("system", &format!("Example: client --start {} --port 9000", parts[0]), "dim");
            return;
        } else if parts.len() >= 3 && parts[1] == "--port" {
            match parts[2].parse::<u16>() {
                Ok(p) => (parts[0].to_string(), p),
                Err(_) => {
                    let mut st = state.lock().await;
                    st.add_output("system", &format!("Invalid port '{}'. Must be a number (e.g. 9000).", parts[2]), "error");
                    return;
                }
            }
        } else {
            let mut st = state.lock().await;
            st.add_output("system", "Usage: client --start <ip> --port <port>", "error");
            return;
        };

        let target_addr = format!("{}:{}", ip, port);

        let mut st = state.lock().await;
        match st.client_service_status {
            ClientServiceStatus::Stopped | ClientServiceStatus::Error(_) => {
                st.add_output("system", &format!("Connecting to admin at {}...", target_addr), "dim");
                let state_clone = Arc::clone(state);
                tokio::spawn(async move {
                    run_client_agent(state_clone, target_addr).await;
                });
            }
            _ => {
                st.add_output("system", "Client agent is already running or connecting.", "warning");
            }
        }
        return;
    }

    // client --stop
    if input == "client --stop" {
        let mut st = state.lock().await;
        st.client_service_status = ClientServiceStatus::Stopped;
        st.add_output("system", "Stopping client agent...", "dim");
        return;
    }

    // Exit/quit
    if input == "exit" || input == "quit" {
        // In the WS integration, quit commands can just send a status log
        let mut st = state.lock().await;
        st.add_output("system", "Exiting terminal session...", "warning");
        return;
    }

    // !! — re-run last command
    if input == "!!" {
        let last_cmd = {
            let st = state.lock().await;
            if st.command_history.len() < 2 {
                None
            } else {
                Some(st.command_history[st.command_history.len() - 2].clone())
            }
        };

        match last_cmd {
            Some(cmd) => {
                let mut st = state.lock().await;
                st.add_output("system", &format!("Re-running: {}", cmd), "dim");
                drop(st);
                Box::pin(process_input(state, &cmd)).await;
            }
            None => {
                let mut st = state.lock().await;
                st.add_output("system", "No commands in history.", "warning");
            }
        }
        return;
    }

    // Clean — clear output
    if input == "clean" || input == "clear" {
        let mut st = state.lock().await;
        st.output_lines.clear();
        st.add_output("system", "Output cleared.", "dim");
        return;
    }

    // History
    if input == "history" {
        let st = state.lock().await;
        if st.command_history.is_empty() {
            drop(st);
            let mut st = state.lock().await;
            st.add_output("system", "No commands in history.", "dim");
        } else {
            let lines: Vec<String> = st
                .command_history
                .iter()
                .enumerate()
                .map(|(i, cmd)| format!("  {}. {}", i + 1, cmd))
                .collect();
            let output = lines.join("\n");
            drop(st);
            let mut st = state.lock().await;
            st.add_output("system", &output, "text");
        }
        return;
    }

    // Rolecall
    if input == "rolecall" {
        let output = client_manager::rolecall(state).await;
        let mut st = state.lock().await;
        st.add_output("system", &output, "text");
        return;
    }

    // fluffy --help
    if input == "fluffy --help" || input == "help" || input == "--help" {
        let mut st = state.lock().await;
        let mut help_msg = String::from("  ── Fluffy Terminal Help ──\n\n");
        
        help_msg.push_str("  [ Admin & Routing Commands ]\n");
        for cmd in get_admin_commands() {
            help_msg.push_str(&format!("  {:<30} - {}\n", cmd.usage, cmd.description));
        }
        
        help_msg.push_str("\n  [ Local & Remote Agent Commands ]\n");
        for cmd in crate::terminal::commands::get_client_commands() {
            help_msg.push_str(&format!("  {:<30} - {}\n", cmd.usage, cmd.description));
        }
        st.add_output("system", &help_msg, "brand");
        return;
    }

    // f alter
    if input.starts_with("f alter ") {
        let target = input.strip_prefix("f alter ").unwrap().trim();
        let mut st = state.lock().await;

        if target == "local" || target == "off" {
            st.alter_target = None;
            st.add_output(
                "system",
                "Alter mode cleared. Commands will run locally.",
                "success",
            );
        } else {
            let client_exists = st.clients.values().any(|c| c.tag == target);
            if client_exists {
                st.alter_target = Some(target.to_string());
                st.add_output(
                    "system",
                    &format!("Alter mode set to [{}]. All commands will target this client.", target),
                    "success",
                );
            } else {
                st.add_output(
                    "system",
                    &format!(
                        "Client [{}] not found. Use 'rolecall' to see connected clients.",
                        target
                    ),
                    "error",
                );
            }
        }
        return;
    }

    // Broadcast
    if input.starts_with("broadcast ") {
        let msg = input
            .strip_prefix("broadcast ")
            .unwrap()
            .trim()
            .trim_matches('"')
            .trim_matches('\'');
        if msg.is_empty() {
            let mut st = state.lock().await;
            st.add_output(
                "system",
                "Usage: broadcast \"message\"",
                "warning",
            );
        } else {
            client_manager::broadcast_notify(state, msg).await;
        }
        return;
    }

    // Check for client tag prefix (f1, f2, ...)
    let parts: Vec<&str> = input.splitn(2, char::is_whitespace).collect();
    let first_word = parts[0];

    if first_word.starts_with('f') && first_word[1..].chars().all(|c| c.is_ascii_digit()) && parts.len() > 1 {
        let tag = first_word;
        let cmd_str = parts[1].trim();

        let client_exists = {
            let st = state.lock().await;
            st.clients.values().any(|c| c.tag == tag)
        };

        if !client_exists {
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Client [{}] not found.", tag),
                "error",
            );
            return;
        }

        {
            let mut st = state.lock().await;
            st.add_output(tag, &format!("[{}] {}", tag, cmd_str), "brand");
        }

        if let Some(command) = parse_command(cmd_str) {
            let _ = client_manager::send_command_to_client(state, tag, command).await;
        } else {
            let mut st = state.lock().await;
            st.add_output(
                tag,
                &format!(
                    "Unknown command: '{}'. Type 'fluffy --help' to see all commands.",
                    cmd_str
                ),
                "error",
            );
        }
        return;
    }

    // Alter mode: send to the active target
    let alter_target = {
        let st = state.lock().await;
        st.alter_target.clone()
    };

    if let Some(target) = alter_target {
        {
            let mut st = state.lock().await;
            st.add_output(
                &target,
                &format!("[{}] {}", target, input),
                "brand",
            );
        }

        if let Some(command) = parse_command(input) {
            let _ = client_manager::send_command_to_client(state, &target, command).await;
        } else {
            let mut st = state.lock().await;
            st.add_output(
                &target,
                &format!(
                    "Unknown command: '{}'. Type 'fluffy --help' to see all commands.",
                    input
                ),
                "error",
            );
        }
        return;
    }

    // Local execution (no target, no alter mode)
    {
        let mut st = state.lock().await;
        st.add_output("local", &format!("[local] {}", input), "brand");
    }

    let output = local_executor::execute_local(input);
    let mut st = state.lock().await;
    st.add_output("local", &output, "text");
}

pub fn get_admin_commands() -> Vec<crate::terminal::commands::CommandMetadata> {
    use crate::terminal::commands::CommandMetadata;
    vec![
        CommandMetadata { name: "rolecall", usage: "rolecall", description: "List all connected clients" },
        CommandMetadata { name: "fluffy --help", usage: "fluffy --help", description: "Show this help overlay" },
        CommandMetadata { name: "to --client", usage: "to --client", description: "Switch to Client View" },
        CommandMetadata { name: "to --admin", usage: "to --admin", description: "Switch back to Admin View" },
        CommandMetadata { name: "client --start", usage: "client --start <ip> --port <port>", description: "Connect to an admin" },
        CommandMetadata { name: "client --stop", usage: "client --stop", description: "Stop background agent" },
        CommandMetadata { name: "f alter", usage: "f alter <tag>", description: "Set target (e.g., f alter f1)" },
        CommandMetadata { name: "f alter off", usage: "f alter off", description: "Clear alter mode (run locally)" },
        CommandMetadata { name: "clean", usage: "clean", description: "Clear the output panel" },
        CommandMetadata { name: "history", usage: "history", description: "Show command history" },
        CommandMetadata { name: "!!", usage: "!!", description: "Re-run the last command" },
        CommandMetadata { name: "broadcast", usage: "broadcast \"msg\"", description: "Send notification to ALL clients" },
        CommandMetadata { name: "exit", usage: "exit / quit", description: "Exit Fluffy Terminal" },
    ]
}
