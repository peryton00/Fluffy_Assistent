use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use winreg::RegKey;
#[cfg(windows)]
use winreg::enums::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub path: PathBuf,
    pub display_name: String,
}

pub struct AppLauncher {
    installed_apps: HashMap<String, AppInfo>,
}

impl AppLauncher {
    pub fn new() -> Self {
        let installed_apps = Self::scan_installed_apps();
        Self { installed_apps }
    }

    /// Scan for installed applications
    fn scan_installed_apps() -> HashMap<String, AppInfo> {
        let mut apps = HashMap::new();

        #[cfg(windows)]
        {
            // Scan Windows Registry for installed applications
            Self::scan_windows_registry(&mut apps);
            
            // Add common applications manually
            Self::add_common_windows_apps(&mut apps);
        }

        #[cfg(not(windows))]
        {
            // For Linux/Mac, scan common application directories
            Self::scan_unix_apps(&mut apps);
        }

        apps
    }

    #[cfg(windows)]
    fn scan_windows_registry(apps: &mut HashMap<String, AppInfo>) {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let paths = vec![
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ];

        for path in paths {
            if let Ok(uninstall_key) = hklm.open_subkey(path) {
                for subkey_name in uninstall_key.enum_keys().filter_map(Result::ok) {
                    if let Ok(subkey) = uninstall_key.open_subkey(&subkey_name) {
                        if let (Ok(display_name), Ok(install_location)) = (
                            subkey.get_value::<String, _>("DisplayName"),
                            subkey.get_value::<String, _>("InstallLocation"),
                        ) {
                            let name_lower = display_name.to_lowercase();
                            let path = PathBuf::from(install_location);
                            
                            apps.insert(
                                name_lower.clone(),
                                AppInfo {
                                    name: name_lower,
                                    path,
                                    display_name,
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    fn add_common_windows_apps(apps: &mut HashMap<String, AppInfo>) {
        let common_apps = vec![
            ("chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "Google Chrome"),
            ("firefox", "C:\\Program Files\\Mozilla Firefox\\firefox.exe", "Mozilla Firefox"),
            ("edge", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "Microsoft Edge"),
            ("vscode", "C:\\Program Files\\Microsoft VS Code\\Code.exe", "Visual Studio Code"),
            ("notepad", "C:\\Windows\\System32\\notepad.exe", "Notepad"),
            ("calculator", "C:\\Windows\\System32\\calc.exe", "Calculator"),
            ("explorer", "C:\\Windows\\explorer.exe", "File Explorer"),
        ];

        for (name, path_str, display_name) in common_apps {
            let path = PathBuf::from(path_str);
            if path.exists() {
                apps.insert(
                    name.to_string(),
                    AppInfo {
                        name: name.to_string(),
                        path,
                        display_name: display_name.to_string(),
                    },
                );
            }
        }
    }

    #[cfg(not(windows))]
    fn scan_unix_apps(apps: &mut HashMap<String, AppInfo>) {
        // Scan /usr/bin and /usr/local/bin for executables
        let search_paths = vec![
            PathBuf::from("/usr/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/snap/bin"),
        ];

        for search_path in search_paths {
            if let Ok(entries) = std::fs::read_dir(search_path) {
                for entry in entries.filter_map(Result::ok) {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            let name_lower = name.to_lowercase();
                            apps.insert(
                                name_lower.clone(),
                                AppInfo {
                                    name: name_lower.clone(),
                                    path: path.clone(),
                                    display_name: name.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    /// Find an application by name (fuzzy matching)
    pub fn find_app(&self, query: &str) -> Option<&AppInfo> {
        let query_lower = query.to_lowercase();

        // Exact match first
        if let Some(app) = self.installed_apps.get(&query_lower) {
            return Some(app);
        }

        // Fuzzy match - find apps containing the query
        self.installed_apps
            .values()
            .find(|app| app.name.contains(&query_lower) || app.display_name.to_lowercase().contains(&query_lower))
    }

    /// Launch an application
    pub fn launch(&self, app_name: &str) -> Result<String, String> {
        let app = self.find_app(app_name)
            .ok_or_else(|| format!("Application '{}' not found", app_name))?;

        self.launch_path(&app.path, &app.display_name)
    }

    /// Launch application by path
    pub fn launch_path(&self, path: &PathBuf, display_name: &str) -> Result<String, String> {
        if !path.exists() {
            return Err(format!("Application path not found: {}", path.display()));
        }

        #[cfg(windows)]
        {
            Command::new("cmd")
                .args(&["/C", "start", "", path.to_str().unwrap()])
                .spawn()
                .map_err(|e| format!("Failed to launch {}: {}", display_name, e))?;
        }

        #[cfg(not(windows))]
        {
            Command::new(path)
                .spawn()
                .map_err(|e| format!("Failed to launch {}: {}", display_name, e))?;
        }

        Ok(format!("Launched {}", display_name))
    }

    /// Get list of all installed apps
    pub fn list_apps(&self) -> Vec<&AppInfo> {
        self.installed_apps.values().collect()
    }

    /// Refresh the app list
    pub fn refresh(&mut self) {
        self.installed_apps = Self::scan_installed_apps();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_launcher_creation() {
        let launcher = AppLauncher::new();
        assert!(!launcher.installed_apps.is_empty());
    }

    #[test]
    #[cfg(windows)]
    fn test_find_notepad() {
        let launcher = AppLauncher::new();
        assert!(launcher.find_app("notepad").is_some());
    }
}
