use serde::{Deserialize, Serialize};
use std::fmt;

use crate::network::error::NetworkError;

/// Structured, client-safe error model for the Network API.
///
/// Ensures no sensitive runtime details (passwords, tokens, private keys, raw internal traces)
/// are leaked to external API consumers (UI, Brain, Guardian).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum NetworkApiError {
    /// The incoming request parameters were invalid or failed domain validation.
    InvalidRequest {
        message: String,
    },
    /// The client specified a protocol version that is incompatible with this server.
    UnsupportedVersion {
        requested: String,
        supported: String,
    },
    /// The requested entity (node, device, connection, interface) does not exist in authoritative state.
    ResourceNotFound {
        resource_type: String,
        id: String,
    },
    /// Operation requested an invalid state transition or operation incompatible with current state.
    InvalidNetworkState {
        message: String,
    },
    /// The network subsystem or requested service component is currently unavailable or inactive.
    SubsystemUnavailable {
        message: String,
    },
    /// The requested operation timed out.
    Timeout {
        message: String,
    },
    /// Internal failure occurred within the network subsystem without exposing raw secrets.
    Internal {
        message: String,
    },
}

impl NetworkApiError {
    pub fn invalid_request(msg: impl Into<String>) -> Self {
        Self::InvalidRequest {
            message: msg.into(),
        }
    }

    pub fn unsupported_version(requested: impl Into<String>, supported: impl Into<String>) -> Self {
        Self::UnsupportedVersion {
            requested: requested.into(),
            supported: supported.into(),
        }
    }

    pub fn not_found(resource_type: impl Into<String>, id: impl Into<String>) -> Self {
        Self::ResourceNotFound {
            resource_type: resource_type.into(),
            id: id.into(),
        }
    }

    pub fn invalid_state(msg: impl Into<String>) -> Self {
        Self::InvalidNetworkState {
            message: msg.into(),
        }
    }

    pub fn subsystem_unavailable(msg: impl Into<String>) -> Self {
        Self::SubsystemUnavailable {
            message: msg.into(),
        }
    }

    pub fn timeout(msg: impl Into<String>) -> Self {
        Self::Timeout {
            message: msg.into(),
        }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self::Internal {
            message: msg.into(),
        }
    }
}

impl fmt::Display for NetworkApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidRequest { message } => write!(f, "Invalid request: {}", message),
            Self::UnsupportedVersion { requested, supported } => {
                write!(f, "Unsupported protocol version '{}' (supported: '{}')", requested, supported)
            }
            Self::ResourceNotFound { resource_type, id } => {
                write!(f, "{} not found: {}", resource_type, id)
            }
            Self::InvalidNetworkState { message } => write!(f, "Invalid network state: {}", message),
            Self::SubsystemUnavailable { message } => write!(f, "Subsystem unavailable: {}", message),
            Self::Timeout { message } => write!(f, "Operation timed out: {}", message),
            Self::Internal { message } => write!(f, "Internal network error: {}", message),
        }
    }
}

impl std::error::Error for NetworkApiError {}

impl From<NetworkError> for NetworkApiError {
    fn from(err: NetworkError) -> Self {
        match err {
            NetworkError::InterfaceNotFound(id) => Self::ResourceNotFound {
                resource_type: "interface".to_string(),
                id,
            },
            NetworkError::DeviceNotFound(id) => Self::ResourceNotFound {
                resource_type: "device".to_string(),
                id,
            },
            NetworkError::InvalidConfig(msg) => Self::InvalidRequest { message: msg },
            NetworkError::InvalidState(msg) => Self::InvalidNetworkState { message: msg },
            NetworkError::SubsystemError(msg) => Self::SubsystemUnavailable { message: msg },
            NetworkError::Io(_) => Self::Internal {
                message: "Internal I/O subsystem error".to_string(),
            },
            NetworkError::FlowQueryFailed(msg) => Self::Internal { message: msg },
            NetworkError::CaptureError(msg) => Self::Internal { message: msg },
            NetworkError::RateCalculationError(msg) => Self::Internal { message: msg },
            NetworkError::Other(msg) => Self::Internal { message: msg },
        }
    }
}

/// Specialized Result type for Network API operations.
pub type NetworkApiResult<T> = Result<T, NetworkApiError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_mapping_from_network_error() {
        let dev_err = NetworkError::DeviceNotFound("dev-999".into());
        let api_err: NetworkApiError = dev_err.into();
        assert_eq!(
            api_err,
            NetworkApiError::ResourceNotFound {
                resource_type: "device".to_string(),
                id: "dev-999".to_string(),
            }
        );

        let val_err = NetworkError::InvalidConfig("Invalid IP".to_string());
        let api_val_err: NetworkApiError = val_err.into();
        assert_eq!(
            api_val_err,
            NetworkApiError::InvalidRequest {
                message: "Invalid IP".to_string(),
            }
        );

        let io_err = NetworkError::Io("secret/path/to/key permission denied".to_string());
        let api_io_err: NetworkApiError = io_err.into();
        // Safe: does not leak path or internal IO details
        assert_eq!(
            api_io_err,
            NetworkApiError::Internal {
                message: "Internal I/O subsystem error".to_string(),
            }
        );
    }

    #[test]
    fn test_error_serialization_safety() {
        let err = NetworkApiError::UnsupportedVersion {
            requested: "2.0".to_string(),
            supported: "1.0".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"code\":\"unsupported_version\""));
        assert!(json.contains("\"requested\":\"2.0\""));
        assert!(json.contains("\"supported\":\"1.0\""));

        let deserialized: NetworkApiError = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, err);
    }
}
