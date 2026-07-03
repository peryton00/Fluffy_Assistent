use crate::terminal::client_agent::platform;

/// Handle users command — list all user accounts.
pub fn handle_users() -> Result<String, String> {
    let users = platform::get_users();

    if users.is_empty() {
        return Ok("No user accounts found.".to_string());
    }

    let mut output = String::new();
    output.push_str(&format!(
        "  {:<20} {:<10} {}\n",
        "USERNAME", "ROLE", "LAST LOGIN"
    ));
    output.push_str(&format!("  {}\n", "─".repeat(60)));

    for user in &users {
        let last_login_display = if user.last_login.len() > 30 {
            format!("{}…", &user.last_login[..29])
        } else {
            user.last_login.clone()
        };

        output.push_str(&format!(
            "  {:<20} {:<10} {}\n",
            user.username, user.role, last_login_display
        ));
    }

    output.push_str(&format!("\n  Total users: {}", users.len()));
    Ok(output)
}
