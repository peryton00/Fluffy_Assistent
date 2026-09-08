pub mod dispatch;
pub mod handlers;
pub mod manifest;
pub mod registry;
pub mod types;

pub use dispatch::{dispatch_capability, discover_capabilities};
pub use manifest::CapabilityManifest;
pub use registry::CapabilityRegistry;
pub use types::{
    CapabilityError, CapabilityMetadata, CapabilityRequest, CapabilityResponse, SecurityTier,
};
