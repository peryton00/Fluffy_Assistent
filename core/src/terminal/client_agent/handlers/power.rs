use crate::terminal::client_agent::platform;

/// Handle lock command
pub fn handle_lock() -> Result<String, String> {
    platform::lock()
}

/// Handle shutdown command
pub fn handle_shutdown() -> Result<String, String> {
    platform::shutdown()
}

/// Handle restart command
pub fn handle_restart() -> Result<String, String> {
    platform::restart()
}
