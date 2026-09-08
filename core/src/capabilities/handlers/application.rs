use serde_json::json;

use crate::actions::launcher::AppLauncher;
use crate::capabilities::handlers::CapabilityHandler;
use crate::capabilities::types::CapabilityError;

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

pub struct ApplicationLaunchHandler;

impl CapabilityHandler for ApplicationLaunchHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let name_or_path = params
            .get("name")
            .or_else(|| params.get("path"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'name' or 'path' parameter."))?;

        let launcher = AppLauncher::new();
        launcher.launch(name_or_path).map_err(|e| {
            CapabilityError::new("launch_failed", format!("Failed to launch application '{}': {}", name_or_path, e))
        })?;

        Ok(json!({
            "target": name_or_path,
            "status": "launched",
            "success": true,
        }))
    }
}

pub struct ApplicationStartupListHandler;

impl CapabilityHandler for ApplicationStartupListHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        #[cfg(windows)]
        {
            let mut startup_items = Vec::new();
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            if let Ok(run_key) = hkcu.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run") {
                for (name, val) in run_key.enum_values().filter_map(Result::ok) {
                    startup_items.push(json!({
                        "name": name,
                        "command": val.to_string(),
                        "scope": "user",
                        "enabled": true,
                    }));
                }
            }

            return Ok(json!({
                "platform": "windows",
                "count": startup_items.len(),
                "items": startup_items,
            }));
        }

        #[cfg(not(windows))]
        {
            Ok(json!({
                "platform": std::env::consts::OS,
                "count": 0,
                "items": [],
                "supported": false,
                "notice": "Startup application enumeration is not supported on this platform",
            }))
        }
    }
}

pub struct ApplicationStartupSetHandler;

impl CapabilityHandler for ApplicationStartupSetHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        #[cfg(windows)]
        {
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing 'name' parameter."))?;

            let action = params
                .get("action")
                .and_then(|v| v.as_str())
                .unwrap_or("add"); // "add" or "remove"

            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let run_key = hkcu
                .open_subkey_with_flags(
                    r"Software\Microsoft\Windows\CurrentVersion\Run",
                    KEY_READ | KEY_WRITE,
                )
                .map_err(|e| CapabilityError::new("registry_error", format!("Failed to open Run registry key: {}", e)))?;

            if action == "remove" {
                run_key.delete_value(name).map_err(|e| {
                    CapabilityError::new("registry_error", format!("Failed to delete startup entry '{}': {}", name, e))
                })?;
                return Ok(json!({
                    "name": name,
                    "action": "removed",
                    "success": true,
                }));
            } else {
                let path = params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing 'path' parameter for startup add."))?;

                run_key.set_value(name, &path).map_err(|e| {
                    CapabilityError::new("registry_error", format!("Failed to set startup entry '{}': {}", name, e))
                })?;

                return Ok(json!({
                    "name": name,
                    "path": path,
                    "action": "added",
                    "success": true,
                }));
            }
        }

        #[cfg(not(windows))]
        {
            Err(CapabilityError::new(
                "unsupported_platform",
                format!("Startup management is not implemented for platform '{}'.", std::env::consts::OS),
            ))
        }
    }
}
