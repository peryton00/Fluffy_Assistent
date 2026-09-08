use serde::{Deserialize, Serialize};

/// Security tier classifying capability risk level
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SecurityTier {
    /// Read-only observation with no side effects
    ReadOnly,
    /// Safe mutation within user-controlled boundaries
    Safe,
    /// Potentially impactful mutation requiring user confirmation
    ConfirmationRequired,
    /// High-risk administrative system operation
    HighRisk,
    /// Explicitly blocked/forbidden operation
    Blocked,
}

/// Metadata descriptor for a registered native capability
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct CapabilityMetadata {
    pub id: String,
    pub description: String,
    pub security_tier: SecurityTier,
    pub requires_confirmation: bool,
    pub supported_platforms: Vec<String>,
    pub is_implemented: bool,
}

/// Structured request to invoke a native capability
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapabilityRequest {
    pub id: String,
    #[serde(default)]
    pub parameters: serde_json::Value,
    #[serde(default)]
    pub request_id: Option<String>,
}

/// Error returned when a capability invocation fails
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct CapabilityError {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub details: Option<serde_json::Value>,
}

impl CapabilityError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(code: impl Into<String>, message: impl Into<String>, details: serde_json::Value) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: Some(details),
        }
    }
}

/// Structured response returned from a capability invocation
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapabilityResponse {
    pub request_id: Option<String>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CapabilityError>,
}

impl CapabilityResponse {
    pub fn ok(request_id: Option<String>, data: serde_json::Value) -> Self {
        Self {
            request_id,
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(request_id: Option<String>, error: CapabilityError) -> Self {
        Self {
            request_id,
            success: false,
            data: None,
            error: Some(error),
        }
    }
}
