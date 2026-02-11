use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum Command {
    KillProcess { pid: u32 },
    RequestCleanup,
    OpenPath { path: String },
    NormalizeSystem,

    // Startup Apps
    StartupAdd { name: String, path: String },
    StartupRemove { name: String },
    StartupToggle { name: String, enabled: bool },

    // Confirmation flow
    Confirm { command_id: String },
    Cancel { command_id: String },

    // UI state sync
    SetUiActive { active: bool },
}
