use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::capabilities::registry::CapabilityRegistry;
use crate::capabilities::types::CapabilityMetadata;

#[cfg(test)]
use crate::capabilities::types::SecurityTier;

/// Manifest of all native capabilities exposed by the Rust Core, dynamically generated from registry
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct CapabilityManifest {
    pub platform: String,
    pub core_version: String,
    pub capabilities: HashMap<String, CapabilityMetadata>,
}

impl CapabilityManifest {
    /// Generate the capability manifest dynamically from the default capability registry
    pub fn current() -> Self {
        let registry = CapabilityRegistry::default();
        Self::from_registry(&registry)
    }

    /// Generate manifest from a specific registry instance
    pub fn from_registry(registry: &CapabilityRegistry) -> Self {
        let current_platform = std::env::consts::OS.to_string();
        let mut caps = HashMap::new();

        for meta in registry.list_metadata() {
            caps.insert(meta.id.clone(), (*meta).clone());
        }

        Self {
            platform: current_platform,
            core_version: env!("CARGO_PKG_VERSION").to_string(),
            capabilities: caps,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capability_manifest_from_registry() {
        let manifest = CapabilityManifest::current();
        assert!(!manifest.platform.is_empty());
        assert_eq!(manifest.core_version, "0.1.0");

        // Verify Process.List is registered and read_only
        let proc_list = manifest.capabilities.get("Process.List").expect("Process.List missing");
        assert!(proc_list.is_implemented);
        assert_eq!(proc_list.security_tier, SecurityTier::ReadOnly);
        assert!(!proc_list.requires_confirmation);

        // Verify Process.Terminate requires confirmation
        let proc_term = manifest.capabilities.get("Process.Terminate").expect("Process.Terminate missing");
        assert!(proc_term.is_implemented);
        assert_eq!(proc_term.security_tier, SecurityTier::ConfirmationRequired);
        assert!(proc_term.requires_confirmation);

        // Verify Filesystem.SafePathCheck is present
        assert!(manifest.capabilities.contains_key("Filesystem.SafePathCheck"));
    }
}
