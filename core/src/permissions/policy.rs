use crate::ipc::command::Command;
use crate::permissions::decision::PermissionDecision;

pub fn evaluate(cmd: &Command) -> PermissionDecision {
    match cmd {
        // Meta commands are never evaluated here
        &Command::Confirm { .. } | &Command::Cancel { .. } => {
            PermissionDecision::Deny {
                reason: "Confirmation commands are not executable actions".into(),
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
        &Command::StartupAdd { .. } | &Command::StartupRemove { .. } => {
            PermissionDecision::RequireConfirmation {
                reason: "Modifying startup applications affects system boot".into(),
            }
        }

        // UI state sync is always allowed
        &Command::SetUiActive { .. } => PermissionDecision::Allow,
    }
}
