use crate::terminal::client_agent::platform;

/// Handle screenshot command.
pub fn handle_screenshot() -> Result<String, String> {
    platform::screenshot()
}
