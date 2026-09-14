use serde::{Deserialize, Serialize};
use std::fmt;

/// Stable protocol version descriptor for the Fluffy Network API.
///
/// Enables future API consumers (Tauri/UI, Python Brain, Guardian) to negotiate
/// compatibility and safely detect schema evolutions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NetworkProtocolVersion {
    pub major: u32,
    pub minor: u32,
}

impl NetworkProtocolVersion {
    /// Canonical current protocol version (1.0).
    pub const CURRENT: Self = Self { major: 1, minor: 0 };

    /// Create a new protocol version with the specified major and minor numbers.
    pub const fn new(major: u32, minor: u32) -> Self {
        Self { major, minor }
    }

    /// Retrieve the canonical current protocol version.
    pub fn current() -> Self {
        Self::CURRENT
    }

    /// Determine if the requested protocol version is compatible with this server.
    ///
    /// Semantics:
    /// - Major version MUST match exactly (breaking schema/semantic changes).
    /// - Minor version of the request MUST be <= the supported minor version (backward-compatible extensions).
    pub fn is_compatible(&self) -> bool {
        self.major == Self::CURRENT.major && self.minor <= Self::CURRENT.minor
    }
}

impl Default for NetworkProtocolVersion {
    fn default() -> Self {
        Self::CURRENT
    }
}

impl fmt::Display for NetworkProtocolVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}", self.major, self.minor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_current_and_compatibility() {
        let current = NetworkProtocolVersion::current();
        assert_eq!(current.major, 1);
        assert_eq!(current.minor, 0);
        assert_eq!(current.to_string(), "1.0");
        assert!(current.is_compatible());

        // Compatible version (same major, same or lower minor)
        let v1_0 = NetworkProtocolVersion::new(1, 0);
        assert!(v1_0.is_compatible());

        // Incompatible major versions
        let v0_9 = NetworkProtocolVersion::new(0, 9);
        assert!(!v0_9.is_compatible());

        let v2_0 = NetworkProtocolVersion::new(2, 0);
        assert!(!v2_0.is_compatible());

        // Incompatible higher minor version for current server
        let v1_1 = NetworkProtocolVersion::new(1, 1);
        assert!(!v1_1.is_compatible());
    }

    #[test]
    fn test_version_serialization() {
        let ver = NetworkProtocolVersion::new(1, 0);
        let json = serde_json::to_string(&ver).unwrap();
        assert_eq!(json, "{\"major\":1,\"minor\":0}");

        let deserialized: NetworkProtocolVersion = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, ver);
    }
}
