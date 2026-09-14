use serde::{Deserialize, Serialize};
use crate::network::error::{NetworkError, NetworkResult};

/// Central configuration abstraction for Fluffy Network subsystem transport endpoints.
/// 
/// Captures all standard network endpoints and addresses without modifying current runtime behavior.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkTransportConfig {
    /// Port for inter-machine cluster peer mesh connections (TCP)
    pub cluster_mesh_port: u16,
    /// Bind address for cluster peer mesh listener
    pub cluster_mesh_bind_addr: String,
    /// Port for native Rust Core telemetry broadcast stream (TCP)
    pub ipc_telemetry_port: u16,
    /// Bind address for telemetry broadcaster
    pub ipc_telemetry_bind_addr: String,
    /// Port for native Rust Core structured command IPC listener (TCP)
    pub ipc_command_port: u16,
    /// Bind address for command receiver
    pub ipc_command_bind_addr: String,
    /// Port for desktop UI WebSocket real-time event bridge
    pub ws_bridge_port: u16,
    /// Bind address for WebSocket bridge
    pub ws_bridge_bind_addr: String,
    /// Port for Python Brain REST API (web_api.py)
    pub brain_rest_port: u16,
    /// Bind address for Python Brain REST API
    pub brain_rest_bind_addr: String,
    /// Port for local network file sharing (FTP)
    pub ftp_port: u16,
}

impl Default for NetworkTransportConfig {
    fn default() -> Self {
        Self {
            cluster_mesh_port: 9000,
            cluster_mesh_bind_addr: "0.0.0.0".to_string(),
            ipc_telemetry_port: 9001,
            ipc_telemetry_bind_addr: "127.0.0.1".to_string(),
            ipc_command_port: 9002,
            ipc_command_bind_addr: "127.0.0.1".to_string(),
            ws_bridge_port: 9003,
            ws_bridge_bind_addr: "127.0.0.1".to_string(),
            brain_rest_port: 5123,
            brain_rest_bind_addr: "127.0.0.1".to_string(),
            ftp_port: 2121,
        }
    }
}

impl NetworkTransportConfig {
    /// Create a standard default configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate configuration integrity
    pub fn validate(&self) -> NetworkResult<()> {
        if self.cluster_mesh_port == 0 {
            return Err(NetworkError::InvalidConfig("cluster_mesh_port cannot be 0".into()));
        }
        if self.ipc_telemetry_port == 0 {
            return Err(NetworkError::InvalidConfig("ipc_telemetry_port cannot be 0".into()));
        }
        if self.ipc_command_port == 0 {
            return Err(NetworkError::InvalidConfig("ipc_command_port cannot be 0".into()));
        }
        if self.ws_bridge_port == 0 {
            return Err(NetworkError::InvalidConfig("ws_bridge_port cannot be 0".into()));
        }
        if self.brain_rest_port == 0 {
            return Err(NetworkError::InvalidConfig("brain_rest_port cannot be 0".into()));
        }
        if self.ftp_port == 0 {
            return Err(NetworkError::InvalidConfig("ftp_port cannot be 0".into()));
        }
        Ok(())
    }

    /// Formatted socket address string for cluster mesh listener
    pub fn cluster_mesh_addr(&self) -> String {
        format!("{}:{}", self.cluster_mesh_bind_addr, self.cluster_mesh_port)
    }

    /// Formatted socket address string for telemetry broadcaster
    pub fn ipc_telemetry_addr(&self) -> String {
        format!("{}:{}", self.ipc_telemetry_bind_addr, self.ipc_telemetry_port)
    }

    /// Formatted socket address string for command IPC receiver
    pub fn ipc_command_addr(&self) -> String {
        format!("{}:{}", self.ipc_command_bind_addr, self.ipc_command_port)
    }

    /// Formatted socket address string for WebSocket bridge
    pub fn ws_bridge_addr(&self) -> String {
        format!("{}:{}", self.ws_bridge_bind_addr, self.ws_bridge_port)
    }
}

/// Resolve the canonical platform-specific data directory for Fluffy Desktop.
/// On Windows: %LOCALAPPDATA%\Fluffy
/// On Unix: ~/.local/share/Fluffy or ~/.fluffy
pub fn default_data_dir() -> std::path::PathBuf {
    dirs::data_local_dir()
        .map(|p| p.join("Fluffy"))
        .or_else(|| dirs::home_dir().map(|p| p.join(".fluffy")))
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

/// Resolve the canonical platform-anchored path for the administrative audit log
pub fn default_audit_log_path() -> std::path::PathBuf {
    default_data_dir().join("audit").join("admin_actions.jsonl")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_transport_config() {
        let config = NetworkTransportConfig::default();
        assert_eq!(config.cluster_mesh_port, 9000);
        assert_eq!(config.ipc_telemetry_port, 9001);
        assert_eq!(config.ipc_command_port, 9002);
        assert_eq!(config.ws_bridge_port, 9003);
        assert_eq!(config.brain_rest_port, 5123);
        assert_eq!(config.ftp_port, 2121);
        assert!(config.validate().is_ok());

        assert_eq!(config.cluster_mesh_addr(), "0.0.0.0:9000");
        assert_eq!(config.ipc_telemetry_addr(), "127.0.0.1:9001");
        assert_eq!(config.ipc_command_addr(), "127.0.0.1:9002");
        assert_eq!(config.ws_bridge_addr(), "127.0.0.1:9003");
    }

    #[test]
    fn test_validate_invalid_port() {
        let mut config = NetworkTransportConfig::default();
        config.cluster_mesh_port = 0;
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_transport_config_serialization() {
        let config = NetworkTransportConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"cluster_mesh_port\":9000"));
        assert!(json.contains("\"ws_bridge_port\":9003"));

        let deserialized: NetworkTransportConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, config);
    }
}
