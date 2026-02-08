use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum Command {
    KillProcess { pid: u32 },
    RequestCleanup,
    OpenPath { path: String },
    NormalizeSystem,

    // Confirmation flow
    Confirm { command_id: String },
    Cancel { command_id: String },
}
