use std::process::Command;

/// Lock screen on Windows
pub fn lock() -> Result<String, String> {
    let output = Command::new("rundll32.exe")
        .args(["user32.dll,LockWorkStation"])
        .output()
        .map_err(|e| format!("Failed to lock screen: {}", e))?;
    if output.status.success() {
        Ok("Screen locked successfully.".to_string())
    } else {
        Err("Failed to lock screen.".to_string())
    }
}

/// Shutdown on Windows
pub fn shutdown() -> Result<String, String> {
    let output = Command::new("shutdown")
        .args(["/s", "/t", "0"])
        .output()
        .map_err(|e| format!("Failed to shutdown: {}", e))?;
    if output.status.success() {
        Ok("Shutdown initiated.".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Shutdown failed: {}", stderr.trim()))
    }
}

/// Restart on Windows
pub fn restart() -> Result<String, String> {
    let output = Command::new("shutdown")
        .args(["/r", "/t", "0"])
        .output()
        .map_err(|e| format!("Failed to restart: {}", e))?;
    if output.status.success() {
        Ok("Restart initiated.".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Restart failed: {}", stderr.trim()))
    }
}

/// Show desktop notification on Windows using PowerShell
pub fn notify(msg: &str) -> Result<String, String> {
    let script = format!(
        r#"
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $template = @"
        <toast>
            <visual>
                <binding template="ToastGeneric">
                    <text>Fluffy Terminal</text>
                    <text>{}</text>
                </binding>
            </visual>
        </toast>
"@
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Fluffy").Show($toast)
        "#,
        msg.replace('"', "'")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to show notification: {}", e))?;

    if output.status.success() {
        Ok(format!("Notification sent: {}", msg))
    } else {
        // Fallback: simple msg via PowerShell
        let fallback = format!(
            r#"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('{}', 'Fluffy Terminal')"#,
            msg.replace('\'', "''")
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &fallback])
            .output();
        Ok(format!("Notification sent (fallback): {}", msg))
    }
}

/// Play alert sound on Windows
pub fn alert() -> Result<String, String> {
    let script = r#"[console]::beep(1000,500); [console]::beep(1500,500); [console]::beep(1000,500)"#;
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| format!("Failed to play alert: {}", e))?;
    if output.status.success() {
        Ok("Alert sound played.".to_string())
    } else {
        Ok("Alert: terminal bell sent.".to_string())
    }
}

/// Take screenshot on Windows using PowerShell
pub fn screenshot() -> Result<String, String> {
    let path = std::env::temp_dir()
        .join("fluffy_screenshot.png")
        .to_string_lossy()
        .to_string();

    let script = format!(
        r#"
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
        $bitmap.Save('{}')
        $graphics.Dispose()
        $bitmap.Dispose()
        "#,
        path.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Screenshot failed: {}", e))?;

    if output.status.success() {
        Ok(format!("Screenshot saved to {}", path))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Screenshot failed: {}", stderr.trim()))
    }
}

/// Read clipboard on Windows
pub fn clipboard_read() -> Result<String, String> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-Clipboard"])
        .output()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err("Failed to read clipboard.".to_string())
    }
}

/// Get GPU info on Windows
pub fn get_gpu_info() -> String {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | Format-List",
        ])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if text.is_empty() {
                "GPU info not available".to_string()
            } else {
                text
            }
        }
        _ => "GPU info not available".to_string(),
    }
}

/// OS details struct
pub struct OsDetails {
    pub name: String,
    pub version: String,
    pub build: String,
    pub edition: String,
}

/// Get OS details on Windows
pub fn get_os_details() -> OsDetails {
    let mut name = String::from("Windows");
    let mut version = String::new();
    let mut build = String::new();
    let mut edition = String::new();

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture | Format-List",
        ])
        .output();

    if let Ok(o) = output {
        let text = String::from_utf8_lossy(&o.stdout);
        for line in text.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("Caption") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                name = val.to_string();
            } else if let Some(val) = line.strip_prefix("Version") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                version = val.to_string();
            } else if let Some(val) = line.strip_prefix("BuildNumber") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                build = val.to_string();
            } else if let Some(val) = line.strip_prefix("OSArchitecture") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                edition = val.to_string();
            }
        }
    }

    OsDetails {
        name,
        version,
        build,
        edition,
    }
}

/// Battery info struct
pub struct BatteryInfo {
    pub percentage: Option<u8>,
    pub status: String,
    pub time_remaining: Option<String>,
}

/// Get battery info on Windows
pub fn get_battery() -> BatteryInfo {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"
            $battery = Get-CimInstance Win32_Battery
            if ($battery) {
                $battery | Select-Object EstimatedChargeRemaining, BatteryStatus, EstimatedRunTime | Format-List
            } else {
                Write-Output "NoBattery"
            }
            "#,
        ])
        .output();

    if let Ok(o) = output {
        let text = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if text.contains("NoBattery") || text.is_empty() {
            return BatteryInfo {
                percentage: None,
                status: "No battery detected.".to_string(),
                time_remaining: None,
            };
        }

        let mut percentage = None;
        let mut status = String::from("Unknown");
        let mut time_remaining = None;

        for line in text.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("EstimatedChargeRemaining") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                percentage = val.parse().ok();
            } else if let Some(val) = line.strip_prefix("BatteryStatus") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                status = match val.trim() {
                    "1" => "Discharging".to_string(),
                    "2" => "Charging".to_string(),
                    "3" => "Full".to_string(),
                    other => format!("Status code: {}", other),
                };
            } else if let Some(val) = line.strip_prefix("EstimatedRunTime") {
                let val = val.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
                if val.trim() != "71582788" {
                    time_remaining = Some(format!("{} minutes", val.trim()));
                }
            }
        }

        BatteryInfo {
            percentage,
            status,
            time_remaining,
        }
    } else {
        BatteryInfo {
            percentage: None,
            status: "No battery detected.".to_string(),
            time_remaining: None,
        }
    }
}

/// User info struct
pub struct UserInfo {
    pub username: String,
    pub role: String,
    pub last_login: String,
}

/// Get user accounts on Windows
pub fn get_users() -> Vec<UserInfo> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"Get-LocalUser | Select-Object Name, Enabled, LastLogon, PrincipalSource | Format-Table -AutoSize | Out-String -Width 4096"#,
        ])
        .output();

    let mut users = Vec::new();

    if let Ok(o) = output {
        let text = String::from_utf8_lossy(&o.stdout);
        let lines: Vec<&str> = text.lines().collect();

        for line in lines.iter().skip(3) {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let username = parts[0].to_string();
                let enabled = parts.get(1).unwrap_or(&"").to_string();
                let last_login = if parts.len() > 2 {
                    parts[2..].join(" ")
                } else {
                    "Never".to_string()
                };

                let role = check_admin_role(&username);

                if enabled.to_lowercase() == "true" {
                    users.push(UserInfo {
                        username,
                        role,
                        last_login,
                    });
                }
            }
        }
    }

    if users.is_empty() {
        if let Ok(output) = Command::new("whoami").output() {
            let username = String::from_utf8_lossy(&output.stdout).trim().to_string();
            users.push(UserInfo {
                username,
                role: "standard".to_string(),
                last_login: "Current session".to_string(),
            });
        }
    }

    users
}

fn check_admin_role(username: &str) -> String {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Get-LocalGroupMember -Group 'Administrators' | Where-Object {{ $_.Name -like '*{}*' }}",
                username
            ),
        ])
        .output();

    match output {
        Ok(o) if !String::from_utf8_lossy(&o.stdout).trim().is_empty() => "admin".to_string(),
        _ => "standard".to_string(),
    }
}

/// Get install date on Windows
pub fn get_install_date() -> String {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"(Get-CimInstance Win32_OperatingSystem).InstallDate.ToString('yyyy-MM-dd HH:mm:ss')"#,
        ])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }
        _ => "Unknown".to_string(),
    }
}
