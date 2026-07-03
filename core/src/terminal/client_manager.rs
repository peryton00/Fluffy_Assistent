use crate::terminal::app_state::SharedState;
use crate::terminal::commands::Command;
use crate::terminal::protocol::AdminCommand;

/// Send a command to a specific client by tag.
/// Returns an error message if the client is not found or disconnected.
pub async fn send_command_to_client(
    state: &SharedState,
    tag: &str,
    command: Command,
) -> Result<(), String> {
    let mut st = state.lock().await;
    let cmd_id = st.next_command_id();

    let admin_cmd = AdminCommand {
        id: cmd_id,
        command,
    };

    let json = serde_json::to_string(&admin_cmd)
        .map_err(|e| format!("Failed to serialize command: {}", e))?;

    // Find the client by tag
    let sender = st
        .clients
        .values()
        .find(|c| c.tag == tag)
        .map(|c| c.sender.clone());

    match sender {
        Some(tx) => {
            if tx.send(json).is_err() {
                let msg = format!("Client [{}] disconnected before command could be sent.", tag);
                st.add_output(tag, &msg, "error");
                Err(msg)
            } else {
                Ok(())
            }
        }
        None => {
            let msg = format!("Client [{}] not found. Use 'rolecall' to see connected clients.", tag);
            st.add_output("system", &msg, "error");
            Err(msg)
        }
    }
}

/// Broadcast a notify command to ALL connected clients.
pub async fn broadcast_notify(state: &SharedState, message: &str) {
    let st = state.lock().await;
    let tags: Vec<(String, tokio::sync::mpsc::UnboundedSender<String>)> = st
        .clients
        .values()
        .map(|c| (c.tag.clone(), c.sender.clone()))
        .collect();
    let cmd_id_base = st.command_id_counter;
    drop(st);

    let mut sent_count = 0;
    for (i, (tag, sender)) in tags.iter().enumerate() {
        let admin_cmd = AdminCommand {
            id: cmd_id_base + i as u64 + 1,
            command: Command::Notify {
                message: message.to_string(),
            },
        };

        if let Ok(json) = serde_json::to_string(&admin_cmd) {
            if sender.send(json).is_ok() {
                sent_count += 1;
            } else {
                let mut st = state.lock().await;
                st.add_output(
                    &tag,
                    &format!("Failed to send broadcast to [{}]", tag),
                    "error",
                );
            }
        }
    }

    let mut st = state.lock().await;
    st.command_id_counter = cmd_id_base + tags.len() as u64 + 1;
    st.add_output(
        "system",
        &format!("Broadcast sent to {} clients: \"{}\"", sent_count, message),
        "success",
    );
}

/// Generate the rolecall table output.
pub async fn rolecall(state: &SharedState) -> String {
    let st = state.lock().await;

    if st.clients.is_empty() {
        return "No clients connected.".to_string();
    }

    let mut output = String::new();
    output.push_str(&format!(
        "  {:<6} {:<20} {:<16} {:<12} {:<10} {}\n",
        "TAG", "HOSTNAME", "IP", "OS", "ARCH", "CONNECTED"
    ));
    output.push_str(&format!("  {}\n", "─".repeat(75)));

    let mut clients: Vec<_> = st.clients.values().collect();
    clients.sort_by(|a, b| a.tag.cmp(&b.tag));

    for client in &clients {
        output.push_str(&format!(
            "  {:<6} {:<20} {:<16} {:<12} {:<10} {}\n",
            client.tag,
            truncate(&client.hostname, 18),
            client.ip,
            truncate(&format!("{} {}", client.os, client.os_version), 10),
            client.arch,
            client.connected_at,
        ));
    }

    output.push_str(&format!("\n  Total: {} client(s) connected", clients.len()));
    output
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}…", &s[..max_len - 1])
    } else {
        s.to_string()
    }
}
