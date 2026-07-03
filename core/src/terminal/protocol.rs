use serde::{Deserialize, Serialize};
use crate::terminal::commands::Command;

/// Sent by the client immediately after TCP connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientHandshake {
    pub hostname: String,
    pub os: String,
    pub os_version: String,
    pub ip: String,
    pub arch: String,
}

/// Sent from admin to client over TCP (newline-delimited JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminCommand {
    pub id: u64,
    pub command: Command,
}

/// Sent from client back to admin over TCP (newline-delimited JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientResponse {
    pub id: u64,
    pub client_id: String,
    pub tag: String,
    pub output: String,
    pub success: bool,
}

/// File transfer response carrying binary data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransferData {
    pub filename: String,
    pub data: Vec<u8>,
    pub size: u64,
}
