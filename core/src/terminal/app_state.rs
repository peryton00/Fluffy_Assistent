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
    pub command_id_counter: u64,
    pub mode: TerminalMode,
    pub client_service_status: ClientServiceStatus,
    pub client_output: Vec<OutputLine>,
    pub admin_port: u16,
    pub server_active: bool,
    pub tx_output: broadcast::Sender<OutputLine>,
}

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
            self.client_output.push(line.clone());
            let _ = self.tx_output.send(line);
        }
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
}

pub type SharedState = Arc<Mutex<AppState>>;

pub fn new_shared_state() -> SharedState {
    Arc::new(Mutex::new(AppState::new()))
}
