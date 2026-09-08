use crate::ipc::command::Command;
use crate::permissions::decision::PermissionDecision;
use crate::capabilities::registry::CapabilityRegistry;
use crate::capabilities::types::SecurityTier;

pub fn evaluate(cmd: &Command) -> PermissionDecision {
    match cmd {
        // Meta commands are never evaluated here
        &Command::Confirm { .. } | &Command::Cancel { .. } => {
            PermissionDecision::Deny {
                reason: "Confirmation commands are not executable actions".into(),
            }
        }

        // Capability discovery is always read-only / allowed
        &Command::DiscoverCapabilities => PermissionDecision::Allow,

        // Native capability evaluation
        Command::Capability { request } => {
            let registry = CapabilityRegistry::default();
            if let Some(meta) = registry.get_metadata(&request.id) {
                if meta.security_tier == SecurityTier::Blocked {
                    return PermissionDecision::Deny {
                        reason: format!("Capability '{}' is blocked by security policy", request.id),
                    };
                }
                if meta.requires_confirmation {
                    return PermissionDecision::RequireConfirmation {
                        reason: format!("Native capability '{}' modifies system state and requires confirmation", request.id),
                    };
                }
                PermissionDecision::Allow
            } else {
                PermissionDecision::Allow // Will be rejected as unknown_capability during dispatch
            }
        }

        // Killing processes is dangerous
        &Command::KillProcess { pid } => {
            if pid < 100 {
                PermissionDecision::Deny {
                    reason: "System process protection".into(),
                }
            } else {
                PermissionDecision::RequireConfirmation {
                    reason: "Killing a process may cause data loss".into(),
                }
            }
        }

        // Cleanup is impactful
        &Command::RequestCleanup => {
            PermissionDecision::RequireConfirmation {
                reason: "Cleanup may close background applications".into(),
            }
        }

        // Safe operation
        &Command::OpenPath { .. } => PermissionDecision::Allow,

        // System actions - Direct allow for the dashboard experience
        &Command::NormalizeSystem => {
            PermissionDecision::Allow
        }

        // Startup App Management
        &Command::StartupAdd { .. } | &Command::StartupRemove { .. } | &Command::StartupToggle { .. } => {
            PermissionDecision::RequireConfirmation {
                reason: "Modifying startup applications affects system boot".into(),
            }
        }

        // UI state sync is always allowed
        &Command::SetUiActive { .. } => PermissionDecision::Allow,
    }
}
