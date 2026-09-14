use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, broadcast};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum TerminalMode {
    Standalone,
    Admin,
    Client,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ClientServiceStatus {
    Stopped,
    Connecting(String),
    Running(String),
    Error(String),
}

/// Represents a connected client.
#[derive(Clone, serde::Serialize)]
pub struct ClientInfo {
    pub tag: String,
    pub hostname: String,
    pub os: String,
    pub os_version: String,
    pub ip: String,
    pub arch: String,
    #[serde(skip)]
    pub sender: mpsc::UnboundedSender<String>,
    pub connected_at: String, // Stringified for serialization
    pub is_secure: bool,
    pub peer_public_key: Option<String>,
    pub session_id: u64,
    pub node_id: Option<String>,
    pub is_authoritative: bool,
}

/// An output line shown in the output panel.
#[derive(Clone, serde::Serialize)]
pub struct OutputLine {
    pub tag: String,
    pub text: String,
    pub color_tag: String, // E.g., "success", "error", "brand", "dim", "text"
    pub timestamp: String,
}

/// Full application state.
pub struct AppState {
    pub clients: HashMap<String, ClientInfo>,
    pub output_lines: Vec<OutputLine>,
    pub command_history: Vec<String>,
    pub alter_target: Option<String>,
    pub input_buffer: String,
    pub cursor_pos: usize,
    pub history_index: Option<usize>,
    pub saved_input: String,
    pub client_counter: usize,
    pub session_counter: u64,
    pub command_id_counter: u64,
    pub mode: TerminalMode,
    pub client_service_status: ClientServiceStatus,
    pub client_output: Vec<OutputLine>,
    pub admin_port: u16,
    pub server_active: bool,
    pub tx_output: broadcast::Sender<OutputLine>,
}

pub const MAX_TERMINAL_OUTPUT_LINES: usize = 2000;
pub const MAX_COMMAND_HISTORY_ENTRIES: usize = 500;

impl AppState {
    pub fn new() -> Self {
        let (tx_output, _) = broadcast::channel(100);
        Self {
            clients: HashMap::new(),
            output_lines: Vec::new(),
            command_history: Vec::new(),
            alter_target: None,
            input_buffer: String::new(),
            cursor_pos: 0,
            history_index: None,
            saved_input: String::new(),
            client_counter: 0,
            session_counter: 0,
            command_id_counter: 0,
            mode: TerminalMode::Standalone,
            client_service_status: ClientServiceStatus::Stopped,
            client_output: Vec::new(),
            admin_port: 9000,
            server_active: false,
            tx_output,
        }
    }

    pub fn next_command_id(&mut self) -> u64 {
        self.command_id_counter += 1;
        self.command_id_counter
    }

    pub fn next_session_id(&mut self) -> u64 {
        self.session_counter += 1;
        self.session_counter
    }

    pub fn next_client_tag(&mut self) -> String {
        self.client_counter += 1;
        format!("f{}", self.client_counter)
    }

    pub fn add_output(&mut self, tag: &str, text: &str, color_tag: &str) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        for line_text in text.lines() {
            let line = OutputLine {
                tag: tag.to_string(),
                text: line_text.to_string(),
                color_tag: color_tag.to_string(),
                timestamp: timestamp.clone(),
            };
            if self.output_lines.len() >= MAX_TERMINAL_OUTPUT_LINES {
                let overflow = (self.output_lines.len() + 1).saturating_sub(MAX_TERMINAL_OUTPUT_LINES);
                self.output_lines.drain(0..overflow);
            }
            self.output_lines.push(line.clone());
            let _ = self.tx_output.send(line);
        }
    }

    pub fn add_client_output(&mut self, tag: &str, text: &str, color_tag: &str) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        for line_text in text.lines() {
            let line = OutputLine {
                tag: tag.to_string(),
                text: line_text.to_string(),
                color_tag: color_tag.to_string(),
                timestamp: timestamp.clone(),
            };
            if self.client_output.len() >= MAX_TERMINAL_OUTPUT_LINES {
                let overflow = (self.client_output.len() + 1).saturating_sub(MAX_TERMINAL_OUTPUT_LINES);
                self.client_output.drain(0..overflow);
            }
            self.client_output.push(line.clone());
            let _ = self.tx_output.send(line);
        }
    }

    pub fn add_history(&mut self, cmd: String) {
        if self.command_history.len() >= MAX_COMMAND_HISTORY_ENTRIES {
            self.command_history.remove(0);
        }
        self.command_history.push(cmd);
    }

    pub fn prompt(&self) -> String {
        match &self.alter_target {
            Some(tag) => format!("fluffy [{}]> ", tag),
            None => "fluffy> ".to_string(),
        }
    }

    pub fn find_client_by_tag(&self, tag: &str) -> Option<(&String, &ClientInfo)> {
        self.clients.iter().find(|(_, c)| c.tag == tag)
    }

    pub fn find_client_by_node_id(&self, node_id: &str) -> Option<(&String, &ClientInfo)> {
        self.clients.iter().find(|(_, c)| c.node_id.as_deref() == Some(node_id) && c.is_authoritative)
    }

    /// Register a new client session.
    /// If an older session exists for the same logical node_id, it is superseded and returned.
    pub fn register_session(&mut self, addr: String, client_info: ClientInfo) -> Option<ClientInfo> {
        let mut superseded = None;
        if let Some(ref nid) = client_info.node_id {
            // Find existing authoritative session for this node_id
            let old_addr = self.clients.iter()
                .find(|(a, c)| *a != &addr && c.node_id.as_deref() == Some(nid.as_str()) && c.is_authoritative)
                .map(|(a, _)| a.clone());

            if let Some(old_a) = old_addr {
                if let Some(mut old_client) = self.clients.remove(&old_a) {
                    old_client.is_authoritative = false;
                    superseded = Some(old_client);
                }
            }
        }

        self.clients.insert(addr, client_info);
        superseded
    }

    /// Remove a client by address unconditionally
    pub fn remove_client(&mut self, addr: &str) -> Option<String> {
        if let Some(client) = self.clients.remove(addr) {
            if self.alter_target.as_ref() == Some(&client.tag) {
                self.alter_target = None;
            }
            Some(client.tag)
        } else {
            None
        }
    }

    /// Remove a client only if session_id matches, preventing stale callbacks from overwriting newer sessions
    pub fn remove_client_session(&mut self, addr: &str, session_id: u64) -> Option<ClientInfo> {
        if let Some(client) = self.clients.get(addr) {
            if client.session_id == session_id {
                let removed = self.clients.remove(addr);
                if let Some(ref c) = removed {
                    if self.alter_target.as_ref() == Some(&c.tag) {
                        self.alter_target = None;
                    }
                }
                return removed;
            }
        }
        None
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn new_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::new()))
}

/// Helper to create a RemoteCommandSender closure bridging AdminCommandController to AppState terminal client channels
pub fn create_terminal_remote_sender(state: SharedState) -> crate::network::admin::RemoteCommandSender {
    Arc::new(move |tag: &str, payload: &str| {
        let tag_str = tag.to_string();
        let payload_str = payload.to_string();
        let state_clone = Arc::clone(&state);

        let (tx, found): (Option<mpsc::UnboundedSender<String>>, bool) = {
            if let Ok(st) = state_clone.try_lock() {
                if let Some((_, client)) = st.find_client_by_tag(&tag_str) {
                    (Some(client.sender.clone()), true)
                } else {
                    (None, false)
                }
            } else {
                (None, false)
            }
        };

        if let Some(sender) = tx {
            sender.send(payload_str).map_err(|e| {
                crate::network::error::NetworkError::Io(format!(
                    "Failed to deliver payload to client channel [{}]: {}",
                    tag_str, e
                ))
            })
        } else if !found {
            Err(crate::network::error::NetworkError::DeviceNotFound(format!(
                "Terminal client [{}] not found",
                tag_str
            )))
        } else {
            Err(crate::network::error::NetworkError::Other(
                "Unable to acquire terminal state lock".into(),
            ))
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bounded_output_lines_eviction() {
        let mut state = AppState::new();
        assert_eq!(state.output_lines.len(), 0);

        // Add 2500 lines (exceeding MAX_TERMINAL_OUTPUT_LINES of 2000)
        for i in 0..2500 {
            state.add_output("test", &format!("line {}", i), "text");
        }

        assert_eq!(state.output_lines.len(), MAX_TERMINAL_OUTPUT_LINES);
        // Oldest entries evicted, newest retained
        assert_eq!(state.output_lines[0].text, "line 500");
        assert_eq!(state.output_lines[MAX_TERMINAL_OUTPUT_LINES - 1].text, "line 2499");
    }

    #[test]
    fn test_bounded_client_output_eviction() {
        let mut state = AppState::new();
        for i in 0..2100 {
            state.add_client_output("f1", &format!("client line {}", i), "success");
        }

        assert_eq!(state.client_output.len(), MAX_TERMINAL_OUTPUT_LINES);
        assert_eq!(state.client_output[0].text, "client line 100");
        assert_eq!(state.client_output[MAX_TERMINAL_OUTPUT_LINES - 1].text, "client line 2099");
    }

    #[test]
    fn test_bounded_command_history() {
        let mut state = AppState::new();
        for i in 0..600 {
            state.add_history(format!("cmd {}", i));
        }

        assert_eq!(state.command_history.len(), MAX_COMMAND_HISTORY_ENTRIES);
        assert_eq!(state.command_history[0], "cmd 100");
        assert_eq!(state.command_history[MAX_COMMAND_HISTORY_ENTRIES - 1], "cmd 599");
    }
}

