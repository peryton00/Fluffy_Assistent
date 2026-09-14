use serde::{Deserialize, Serialize};
use std::fmt;

/// Strongly typed errors across the Fluffy Network subsystem.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "error_type", content = "message")]
pub enum NetworkError {
    /// Underlying I/O or OS communication failure
    Io(String),
    /// The specified network interface identifier or name was not found
    InterfaceNotFound(String),
    /// The specified subnet neighbor or remote device was not found
    DeviceNotFound(String),
    /// Failed to query OS transport socket or flow tables
    FlowQueryFailed(String),
    /// Packet monitoring or capture operation error
    CaptureError(String),
    /// Anomaly or calculation failure during bandwidth rate computation
    RateCalculationError(String),
    /// Invalid or conflicting network transport configuration
    InvalidConfig(String),
    /// Invalid state or invalid lifecycle state transition
    InvalidState(String),
    /// Network subsystem lifecycle or state error
    SubsystemError(String),
    /// General or unclassified network error
    Other(String),
}

impl NetworkError {
    /// Return a stable error kind code useful for IPC and capability envelopes
    pub fn kind(&self) -> &'static str {
        match self {
            NetworkError::Io(_) => "network_io_error",
            NetworkError::InterfaceNotFound(_) => "interface_not_found",
            NetworkError::DeviceNotFound(_) => "device_not_found",
            NetworkError::FlowQueryFailed(_) => "flow_query_failed",
            NetworkError::CaptureError(_) => "capture_error",
            NetworkError::RateCalculationError(_) => "rate_calculation_error",
            NetworkError::InvalidConfig(_) => "invalid_network_config",
            NetworkError::InvalidState(_) => "invalid_network_state",
            NetworkError::SubsystemError(_) => "subsystem_error",
            NetworkError::Other(_) => "network_error",
        }
    }

    /// Return the inner descriptive error message
    pub fn message(&self) -> &str {
        match self {
            NetworkError::Io(msg)
            | NetworkError::InterfaceNotFound(msg)
            | NetworkError::DeviceNotFound(msg)
            | NetworkError::FlowQueryFailed(msg)
            | NetworkError::CaptureError(msg)
            | NetworkError::RateCalculationError(msg)
            | NetworkError::InvalidConfig(msg)
            | NetworkError::InvalidState(msg)
            | NetworkError::SubsystemError(msg)
            | NetworkError::Other(msg) => msg.as_str(),
        }
    }
}

impl fmt::Display for NetworkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}]: {}", self.kind(), self.message())
    }
}

impl std::error::Error for NetworkError {}

impl From<std::io::Error> for NetworkError {
    fn from(err: std::io::Error) -> Self {
        NetworkError::Io(err.to_string())
    }
}

impl From<&str> for NetworkError {
    fn from(s: &str) -> Self {
        NetworkError::Other(s.to_string())
    }
}

impl From<String> for NetworkError {
    fn from(s: String) -> Self {
        NetworkError::Other(s)
    }
}

/// Standard Result alias for Fluffy Network subsystem operations.
pub type NetworkResult<T> = Result<T, NetworkError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_error_kinds_and_display() {
        let err = NetworkError::InterfaceNotFound("eth0".into());
        assert_eq!(err.kind(), "interface_not_found");
        assert_eq!(err.message(), "eth0");
        assert!(err.to_string().contains("[interface_not_found]: eth0"));

        let io_err = NetworkError::Io("Permission denied".into());
        assert_eq!(io_err.kind(), "network_io_error");
    }

    #[test]
    fn test_network_error_serialization() {
        let err = NetworkError::InvalidConfig("Port 9000 conflict".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("invalid_network_config") || json.contains("InvalidConfig"));

        let deserialized: NetworkError = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, err);
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::AddrInUse, "Address in use");
        let net_err = NetworkError::from(io_err);
        assert_eq!(net_err.kind(), "network_io_error");
        assert!(net_err.message().contains("Address in use"));
    }
}
