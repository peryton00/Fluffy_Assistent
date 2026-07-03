use crate::terminal::client_agent::platform;

/// Handle battery command.
pub fn handle_battery() -> Result<String, String> {
    let info = platform::get_battery();

    match info.percentage {
        Some(pct) => {
            let mut output = String::new();
            output.push_str("  ── Battery ─────────────────────────────\n");
            output.push_str(&format!("  Percentage : {}%\n", pct));
            output.push_str(&format!("  Status     : {}\n", info.status));
            if let Some(time) = &info.time_remaining {
                output.push_str(&format!("  Remaining  : {}\n", time));
            }
            Ok(output)
        }
        None => Ok(info.status),
    }
}
