use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDef {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginResponse {
    pub success: bool,
    pub output: String,
}

pub trait FluffyPlugin {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn commands(&self) -> Vec<CommandDef>;
    fn execute(&self, cmd: &str, args: &[&str]) -> PluginResponse;
}
