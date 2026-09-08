use std::fs;
use std::path::{Path, PathBuf};
use serde_json::json;

use crate::actions::safety::{SafetyLevel, SafetyValidator};
use crate::capabilities::handlers::CapabilityHandler;
use crate::capabilities::types::CapabilityError;

pub struct SafePathCheckHandler;

impl CapabilityHandler for SafePathCheckHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let path_str = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'path' parameter."))?;

        let validator = SafetyValidator::new();
        let path = PathBuf::from(path_str);
        let safety_level = validator.check_path(&path);

        let is_safe = match safety_level {
            SafetyLevel::Safe | SafetyLevel::NeedsConfirmation => true,
            SafetyLevel::Blocked => false,
        };

        Ok(json!({
            "path": path_str,
            "is_safe": is_safe,
            "safety_level": format!("{:?}", safety_level),
            "blocked": !is_safe,
        }))
    }
}

pub struct FileCreateHandler;

impl CapabilityHandler for FileCreateHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let path_str = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'path' parameter."))?;

        let content = params.get("content").and_then(|v| v.as_str()).unwrap_or("");
        let create_dirs = params.get("create_dirs").and_then(|v| v.as_bool()).unwrap_or(true);

        let validator = SafetyValidator::new();
        let path = PathBuf::from(path_str);
        let safety = validator.check_path(&path);

        if matches!(safety, SafetyLevel::Blocked) {
            return Err(CapabilityError::new(
                "protected_path_blocked",
                format!("Creation blocked: '{}' is a protected system directory.", path_str),
            ));
        }

        if create_dirs {
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() {
                    fs::create_dir_all(parent).map_err(|e| {
                        CapabilityError::new("io_error", format!("Failed to create parent directories: {}", e))
                    })?;
                }
            }
        }

        fs::write(&path, content).map_err(|e| {
            CapabilityError::new("io_error", format!("Failed to write file '{}': {}", path_str, e))
        })?;

        Ok(json!({
            "path": path_str,
            "bytes_written": content.len(),
            "status": "created",
            "success": true,
        }))
    }
}

pub struct FileDeleteHandler;

impl CapabilityHandler for FileDeleteHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let path_str = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'path' parameter."))?;

        let validator = SafetyValidator::new();
        let path = PathBuf::from(path_str);
        let safety = validator.check_path(&path);

        if matches!(safety, SafetyLevel::Blocked) {
            return Err(CapabilityError::new(
                "protected_path_blocked",
                format!("Deletion blocked: '{}' is a protected system directory.", path_str),
            ));
        }

        if !path.exists() {
            return Err(CapabilityError::new(
                "not_found",
                format!("File '{}' does not exist.", path_str),
            ));
        }

        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| {
                CapabilityError::new("io_error", format!("Failed to remove directory '{}': {}", path_str, e))
            })?;
        } else {
            fs::remove_file(&path).map_err(|e| {
                CapabilityError::new("io_error", format!("Failed to remove file '{}': {}", path_str, e))
            })?;
        }

        Ok(json!({
            "path": path_str,
            "status": "deleted",
            "success": true,
        }))
    }
}

pub struct FileReadMetadataHandler;

impl CapabilityHandler for FileReadMetadataHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let path_str = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'path' parameter."))?;

        let path = Path::new(path_str);
        if !path.exists() {
            return Err(CapabilityError::new("not_found", format!("Path '{}' does not exist.", path_str)));
        }

        let meta = fs::metadata(path).map_err(|e| {
            CapabilityError::new("io_error", format!("Failed to read metadata for '{}': {}", path_str, e))
        })?;

        let modified_epoch = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        Ok(json!({
            "path": path_str,
            "size_bytes": meta.len(),
            "is_file": meta.is_file(),
            "is_dir": meta.is_dir(),
            "is_symlink": meta.is_symlink(),
            "readonly": meta.permissions().readonly(),
            "modified_epoch": modified_epoch,
        }))
    }
}

pub struct FileListHandler;

impl CapabilityHandler for FileListHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let path_str = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'path' parameter."))?;

        let path = Path::new(path_str);
        if !path.exists() {
            return Err(CapabilityError::new("not_found", format!("Directory '{}' does not exist.", path_str)));
        }
        if !path.is_dir() {
            return Err(CapabilityError::new("not_a_directory", format!("Path '{}' is not a directory.", path_str)));
        }

        let entries = fs::read_dir(path).map_err(|e| {
            CapabilityError::new("io_error", format!("Failed to read directory '{}': {}", path_str, e))
        })?;

        let mut items = Vec::new();
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

            items.push(json!({
                "name": file_name,
                "is_dir": is_dir,
                "size_bytes": size,
            }));
        }

        Ok(json!({
            "directory": path_str,
            "count": items.len(),
            "entries": items,
        }))
    }
}
