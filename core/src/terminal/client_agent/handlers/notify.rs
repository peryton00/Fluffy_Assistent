use crate::terminal::client_agent::platform;

/// Handle notify command — show desktop notification.
pub fn handle_notify(message: &str) -> Result<String, String> {
    platform::notify(message)
}

/// Handle alert command — play alert sound.
pub fn handle_alert() -> Result<String, String> {
    platform::alert()
}
