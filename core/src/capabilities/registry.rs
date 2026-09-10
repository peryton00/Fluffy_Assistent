use std::collections::HashMap;

use crate::capabilities::handlers::application::*;
use crate::capabilities::handlers::filesystem::*;
use crate::capabilities::handlers::network::*;
use crate::capabilities::handlers::process::*;
use crate::capabilities::handlers::system::*;
use crate::capabilities::handlers::CapabilityHandler;
use crate::capabilities::types::{
    CapabilityError, CapabilityMetadata, CapabilityRequest, CapabilityResponse, SecurityTier,
};

pub struct CapabilityRegistry {
    entries: HashMap<String, (CapabilityMetadata, Box<dyn CapabilityHandler>)>,
}

impl Default for CapabilityRegistry {
    fn default() -> Self {
        let mut registry = Self::new();
        registry.register_builtin_capabilities();
        registry
    }
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Register a capability metadata and its execution handler
    pub fn register(&mut self, metadata: CapabilityMetadata, handler: Box<dyn CapabilityHandler>) {
        self.entries.insert(metadata.id.clone(), (metadata, handler));
    }

    /// Retrieve metadata for a capability by ID
    pub fn get_metadata(&self, id: &str) -> Option<&CapabilityMetadata> {
        self.entries.get(id).map(|(meta, _)| meta)
    }

    /// List metadata for all registered capabilities
    pub fn list_metadata(&self) -> Vec<&CapabilityMetadata> {
        self.entries.values().map(|(meta, _)| meta).collect()
    }

    /// Dispatch a structured capability request to its handler with Rust-side safety checks
    pub fn dispatch(&self, request: &CapabilityRequest) -> CapabilityResponse {
        let req_id = request.request_id.clone();

        // 1. Look up capability in registry
        let (metadata, handler) = match self.entries.get(&request.id) {
            Some(entry) => entry,
            None => {
                return CapabilityResponse::err(
                    req_id,
                    CapabilityError::new(
                        "unknown_capability",
                        format!("Capability '{}' is not registered.", request.id),
                    ),
                );
            }
        };

        // 2. Check if implemented
        if !metadata.is_implemented {
            return CapabilityResponse::err(
                req_id,
                CapabilityError::new(
                    "not_implemented",
                    format!("Capability '{}' is declared but not implemented.", request.id),
                ),
            );
        }

        // 3. Platform support validation
        let current_platform = std::env::consts::OS;
        if !metadata.supported_platforms.iter().any(|p| p == current_platform || p == "all") {
            return CapabilityResponse::err(
                req_id,
                CapabilityError::new(
                    "unsupported_platform",
                    format!(
                        "Capability '{}' is not supported on platform '{}'. Supported: {:?}",
                        request.id, current_platform, metadata.supported_platforms
                    ),
                ),
            );
        }

        // 4. Security tier validation: Blocked operations are never executed
        if metadata.security_tier == SecurityTier::Blocked {
            return CapabilityResponse::err(
                req_id,
                CapabilityError::new(
                    "security_tier_blocked",
                    format!("Capability '{}' is permanently blocked by security policy.", request.id),
                ),
            );
        }

        // 5. Execute handler
        match handler.execute(&request.parameters) {
            Ok(data) => CapabilityResponse::ok(req_id, data),
            Err(err) => CapabilityResponse::err(req_id, err),
        }
    }

    /// Populate all built-in capability handlers
    fn register_builtin_capabilities(&mut self) {
        let all_platforms = vec!["windows".into(), "linux".into(), "macos".into()];

        // 1. Process
        self.register(
            CapabilityMetadata {
                id: "Process.List".into(),
                description: "List active system processes and resource consumption".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(ProcessListHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Process.Terminate".into(),
                description: "Terminate process by PID with system process protection".into(),
                security_tier: SecurityTier::ConfirmationRequired,
                requires_confirmation: true,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(ProcessTerminateHandler),
        );

        // 2. Filesystem
        self.register(
            CapabilityMetadata {
                id: "Filesystem.SafePathCheck".into(),
                description: "Verify path against protected directories and traversal".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(SafePathCheckHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Filesystem.Create".into(),
                description: "Create file within allowed directories".into(),
                security_tier: SecurityTier::Safe,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(FileCreateHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Filesystem.Delete".into(),
                description: "Delete file within allowed directories".into(),
                security_tier: SecurityTier::ConfirmationRequired,
                requires_confirmation: true,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(FileDeleteHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Filesystem.ReadMetadata".into(),
                description: "Read file size, modification date, and permissions".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(FileReadMetadataHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Filesystem.List".into(),
                description: "List contents of a directory".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(FileListHandler),
        );

        // 3. System
        self.register(
            CapabilityMetadata {
                id: "System.GetHardware".into(),
                description: "Query normalized CPU, memory, OS, and hostname info".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(SystemGetHardwareHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "System.GetPower".into(),
                description: "Query battery percentage and AC charging state".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(SystemGetPowerHandler),
        );

        // 4. Application
        self.register(
            CapabilityMetadata {
                id: "Application.Launch".into(),
                description: "Launch registered desktop application by name or path".into(),
                security_tier: SecurityTier::Safe,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(ApplicationLaunchHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Application.Startup.List".into(),
                description: "List startup applications from Windows Registry".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: vec!["windows".into()],
                is_implemented: true,
            },
            Box::new(ApplicationStartupListHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Application.Startup.Set".into(),
                description: "Add or remove startup application in Windows Registry".into(),
                security_tier: SecurityTier::ConfirmationRequired,
                requires_confirmation: true,
                supported_platforms: vec!["windows".into()],
                is_implemented: true,
            },
            Box::new(ApplicationStartupSetHandler),
        );

        // 5. Network
        self.register(
            CapabilityMetadata {
                id: "Network.ListInterfaces".into(),
                description: "List network interface addresses, MACs, and packet statistics".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkListInterfacesHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.GetInterfaces".into(),
                description: "Get detailed local network interfaces with classification, MAC, IP, and byte statistics".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkGetInterfacesHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.GetLocalDevices".into(),
                description: "Passive local network neighbor device discovery from OS ARP/neighbor cache".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkGetLocalDevicesHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.GetActiveFlows".into(),
                description: "Enumerate active TCP and UDP sockets mapped to process ownership".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkGetActiveFlowsHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.ListWifiProfiles".into(),
                description: "Enumerate known Wi-Fi network profiles and non-secret security metadata".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkListWifiProfilesHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.StartPacketCapture".into(),
                description: "Start a controlled, bounded, metadata-only packet monitoring session (N8/SIH26117)".into(),
                security_tier: SecurityTier::Safe,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkStartPacketCaptureHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.StopPacketCapture".into(),
                description: "Stop an active packet monitoring session".into(),
                security_tier: SecurityTier::Safe,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkStopPacketCaptureHandler),
        );

        self.register(
            CapabilityMetadata {
                id: "Network.GetPacketCaptureStatus".into(),
                description: "Get active packet monitoring session status and bounded metadata observations".into(),
                security_tier: SecurityTier::ReadOnly,
                requires_confirmation: false,
                supported_platforms: all_platforms.clone(),
                is_implemented: true,
            },
            Box::new(NetworkGetPacketCaptureStatusHandler),
        );
    }
}

