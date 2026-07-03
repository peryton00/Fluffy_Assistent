// Platform-specific implementations
// Route to correct OS module at compile time

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

// Re-export OS details and battery/user info structs
// We define common structs here and populate them from platform code

/// OS details gathered from the platform
pub struct OsDetails {
    pub name: String,
    pub version: String,
    pub build: String,
    pub edition: String,
}

/// Battery information
pub struct BatteryInfo {
    pub percentage: Option<u8>,
    pub status: String,
    pub time_remaining: Option<String>,
}

/// User account information
pub struct UserInfo {
    pub username: String,
    pub role: String,
    pub last_login: String,
}

pub fn lock() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::lock()
    }
    #[cfg(target_os = "windows")]
    {
        windows::lock()
    }
    #[cfg(target_os = "macos")]
    {
        macos::lock()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err(format!(
            "Command 'lock' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn shutdown() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::shutdown()
    }
    #[cfg(target_os = "windows")]
    {
        windows::shutdown()
    }
    #[cfg(target_os = "macos")]
    {
        macos::shutdown()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err(format!(
            "Command 'shutdown' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn restart() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::restart()
    }
    #[cfg(target_os = "windows")]
    {
        windows::restart()
    }
    #[cfg(target_os = "macos")]
    {
        macos::restart()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err(format!(
            "Command 'restart' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn notify(msg: &str) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::notify(msg)
    }
    #[cfg(target_os = "windows")]
    {
        windows::notify(msg)
    }
    #[cfg(target_os = "macos")]
    {
        macos::notify(msg)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = msg;
        Err(format!(
            "Command 'notify' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn alert() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::alert()
    }
    #[cfg(target_os = "windows")]
    {
        windows::alert()
    }
    #[cfg(target_os = "macos")]
    {
        macos::alert()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err(format!(
            "Command 'alert' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn screenshot() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::screenshot()
    }
    #[cfg(target_os = "windows")]
    {
        windows::screenshot()
    }
    #[cfg(target_os = "macos")]
    {
        macos::screenshot()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err(format!(
            "Command 'screenshot' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn clipboard_read() -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        linux::clipboard_read()
    }
    #[cfg(target_os = "windows")]
    {
        windows::clipboard_read()
    }
    #[cfg(target_os = "macos")]
    {
        macos::clipboard_read()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Err(format!(
            "Command 'clipboard' is not supported on {}.",
            std::env::consts::OS
        ))
    }
}

pub fn get_gpu_info() -> String {
    #[cfg(target_os = "linux")]
    {
        linux::get_gpu_info()
    }
    #[cfg(target_os = "windows")]
    {
        windows::get_gpu_info()
    }
    #[cfg(target_os = "macos")]
    {
        macos::get_gpu_info()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        "GPU info not available".to_string()
    }
}

pub fn get_os_details() -> OsDetails {
    #[cfg(target_os = "linux")]
    {
        let d = linux::get_os_details();
        OsDetails {
            name: d.name,
            version: d.version,
            build: d.build,
            edition: d.edition,
        }
    }
    #[cfg(target_os = "windows")]
    {
        let d = windows::get_os_details();
        OsDetails {
            name: d.name,
            version: d.version,
            build: d.build,
            edition: d.edition,
        }
    }
    #[cfg(target_os = "macos")]
    {
        let d = macos::get_os_details();
        OsDetails {
            name: d.name,
            version: d.version,
            build: d.build,
            edition: d.edition,
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        OsDetails {
            name: std::env::consts::OS.to_string(),
            version: String::new(),
            build: String::new(),
            edition: String::new(),
        }
    }
}

pub fn get_battery() -> BatteryInfo {
    #[cfg(target_os = "linux")]
    {
        let b = linux::get_battery();
        BatteryInfo {
            percentage: b.percentage,
            status: b.status,
            time_remaining: b.time_remaining,
        }
    }
    #[cfg(target_os = "windows")]
    {
        let b = windows::get_battery();
        BatteryInfo {
            percentage: b.percentage,
            status: b.status,
            time_remaining: b.time_remaining,
        }
    }
    #[cfg(target_os = "macos")]
    {
        let b = macos::get_battery();
        BatteryInfo {
            percentage: b.percentage,
            status: b.status,
            time_remaining: b.time_remaining,
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        BatteryInfo {
            percentage: None,
            status: "No battery detected.".to_string(),
            time_remaining: None,
        }
    }
}

pub fn get_users() -> Vec<UserInfo> {
    #[cfg(target_os = "linux")]
    {
        linux::get_users()
            .into_iter()
            .map(|u| UserInfo {
                username: u.username,
                role: u.role,
                last_login: u.last_login,
            })
            .collect()
    }
    #[cfg(target_os = "windows")]
    {
        windows::get_users()
            .into_iter()
            .map(|u| UserInfo {
                username: u.username,
                role: u.role,
                last_login: u.last_login,
            })
            .collect()
    }
    #[cfg(target_os = "macos")]
    {
        macos::get_users()
            .into_iter()
            .map(|u| UserInfo {
                username: u.username,
                role: u.role,
                last_login: u.last_login,
            })
            .collect()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        Vec::new()
    }
}

pub fn get_install_date() -> String {
    #[cfg(target_os = "linux")]
    {
        linux::get_install_date()
    }
    #[cfg(target_os = "windows")]
    {
        windows::get_install_date()
    }
    #[cfg(target_os = "macos")]
    {
        macos::get_install_date()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        "Unknown".to_string()
    }
}
