pub mod application;
pub mod filesystem;
pub mod network;
pub mod process;
pub mod system;

use crate::capabilities::types::CapabilityError;

/// Trait implemented by every native capability execution handler
pub trait CapabilityHandler: Send + Sync {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError>;
}
