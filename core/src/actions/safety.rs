use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SafetyLevel {
    Safe,              // Allowed without confirmation
    NeedsConfirmation, // Requires user approval
    Blocked,           // Never allowed
}

pub struct SafetyValidator {
    protected_paths: Vec<PathBuf>,
    allowed_paths: Vec<PathBuf>,
    system_extensions: Vec<String>,
}

impl SafetyValidator {
    pub fn new() -> Self {
        let protected_paths = Self::get_protected_paths();
        let allowed_paths = Self::get_allowed_paths();
        let system_extensions = vec![
            "sys".to_string(),
            "dll".to_string(),
            "exe".to_string(), // Only in system dirs
        ];

        Self {
            protected_paths,
            allowed_paths,
            system_extensions,
        }
    }

    /// Get protected paths based on OS
    fn get_protected_paths() -> Vec<PathBuf> {
        if cfg!(windows) {
            vec![
                PathBuf::from("C:\\Windows"),
                PathBuf::from("C:\\Program Files"),
                PathBuf::from("C:\\Program Files (x86)"),
                PathBuf::from("C:\\ProgramData"),
            ]
        } else {
            vec![
                PathBuf::from("/bin"),
                PathBuf::from("/sbin"),
                PathBuf::from("/usr/bin"),
                PathBuf::from("/usr/sbin"),
                PathBuf::from("/etc"),
                PathBuf::from("/boot"),
                PathBuf::from("/sys"),
                PathBuf::from("/proc"),
                PathBuf::from("/lib"),
                PathBuf::from("/lib64"),
            ]
        }
    }

    /// Get allowed user paths
    fn get_allowed_paths() -> Vec<PathBuf> {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        
        if cfg!(windows) {
            vec![
                home.join("Documents"),
                home.join("Desktop"),
                home.join("Downloads"),
                home.join("Pictures"),
                home.join("Videos"),
                home.join("Music"),
            ]
        } else {
            vec![
                home.join("Documents"),
                home.join("Desktop"),
                home.join("Downloads"),
                home.join("Pictures"),
                home.join("Videos"),
                home.join("Music"),
            ]
        }
    }

    /// Check if a path is safe to operate on
    pub fn check_path(&self, path: &PathBuf) -> SafetyLevel {
        // Normalize path
        let canonical = match path.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                // Path doesn't exist yet (e.g., creating new file)
                // Check parent directory
                if let Some(parent) = path.parent() {
                    match parent.canonicalize() {
                        Ok(p) => p,
                        Err(_) => return SafetyLevel::Blocked,
                    }
                } else {
                    return SafetyLevel::Blocked;
                }
            }
        };

        // Check if in protected paths
        if self.is_protected(&canonical) {
            return SafetyLevel::Blocked;
        }

        // Check if in allowed paths (safe)
        if self.is_allowed(&canonical) {
            // Check for system file extensions
            if self.is_system_file(&canonical) {
                return SafetyLevel::NeedsConfirmation;
            }
            return SafetyLevel::Safe;
        }

        // Not in allowed or protected - needs confirmation
        SafetyLevel::NeedsConfirmation
    }

    /// Check if path is in protected directories
    fn is_protected(&self, path: &PathBuf) -> bool {
        for protected in &self.protected_paths {
            if path.starts_with(protected) {
                return true;
            }
        }
        false
    }

    /// Check if path is in allowed directories
    fn is_allowed(&self, path: &PathBuf) -> bool {
        for allowed in &self.allowed_paths {
            if path.starts_with(allowed) {
                return true;
            }
        }
        false
    }

    /// Check if file is a system file
    fn is_system_file(&self, path: &PathBuf) -> bool {
        if let Some(ext) = path.extension() {
            if let Some(ext_str) = ext.to_str() {
                return self.system_extensions.contains(&ext_str.to_lowercase());
            }
        }
        false
    }

    /// Check if path is system critical
    pub fn is_system_critical(&self, path: &PathBuf) -> bool {
        matches!(self.check_path(path), SafetyLevel::Blocked)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protected_paths() {
        let validator = SafetyValidator::new();
        
        if cfg!(windows) {
            let windows_path = PathBuf::from("C:\\Windows\\System32\\test.dll");
            assert!(matches!(validator.check_path(&windows_path), SafetyLevel::Blocked));
        }
    }

    #[test]
    fn test_allowed_paths() {
        let validator = SafetyValidator::new();
        let home = dirs::home_dir().unwrap();
        let doc_path = home.join("Documents").join("test.txt");
        
        // Should be safe (if path exists) or needs confirmation (if doesn't exist)
        let result = validator.check_path(&doc_path);
        assert!(!matches!(result, SafetyLevel::Blocked));
    }
}
