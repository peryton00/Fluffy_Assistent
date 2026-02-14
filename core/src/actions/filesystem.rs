use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use super::safety::{SafetyValidator, SafetyLevel};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    CreateFile,
    CreateFolder,
    DeleteFile,
    DeleteFolder,
    MoveFile,
    CopyFile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSystemAction {
    pub action_type: ActionType,
    pub target_path: PathBuf,
    pub destination_path: Option<PathBuf>, // For move/copy operations
    pub content: Option<String>,           // For file creation
}

impl FileSystemAction {
    pub fn new(action_type: ActionType, target_path: PathBuf) -> Self {
        Self {
            action_type,
            target_path,
            destination_path: None,
            content: None,
        }
    }

    pub fn with_destination(mut self, dest: PathBuf) -> Self {
        self.destination_path = Some(dest);
        self
    }

    pub fn with_content(mut self, content: String) -> Self {
        self.content = Some(content);
        self
    }

    /// Validate action against safety rules
    pub fn validate(&self, validator: &SafetyValidator) -> Result<SafetyLevel, String> {
        // Check target path
        let target_safety = validator.check_path(&self.target_path);
        
        if matches!(target_safety, SafetyLevel::Blocked) {
            return Err(format!(
                "Operation blocked: {} is a protected system path",
                self.target_path.display()
            ));
        }

        // Check destination path if applicable
        if let Some(dest) = &self.destination_path {
            let dest_safety = validator.check_path(dest);
            if matches!(dest_safety, SafetyLevel::Blocked) {
                return Err(format!(
                    "Operation blocked: {} is a protected system path",
                    dest.display()
                ));
            }
        }

        Ok(target_safety)
    }

    /// Execute the filesystem action
    pub fn execute(&self) -> Result<String, String> {
        match self.action_type {
            ActionType::CreateFile => self.create_file(),
            ActionType::CreateFolder => self.create_folder(),
            ActionType::DeleteFile => self.delete_file(),
            ActionType::DeleteFolder => self.delete_folder(),
            ActionType::MoveFile => self.move_file(),
            ActionType::CopyFile => self.copy_file(),
        }
    }

    fn create_file(&self) -> Result<String, String> {
        // Ensure parent directory exists
        if let Some(parent) = self.target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        // Create file with optional content
        let content = self.content.as_deref().unwrap_or("");
        fs::write(&self.target_path, content)
            .map_err(|e| format!("Failed to create file: {}", e))?;

        Ok(format!("Created file: {}", self.target_path.display()))
    }

    fn create_folder(&self) -> Result<String, String> {
        fs::create_dir_all(&self.target_path)
            .map_err(|e| format!("Failed to create folder: {}", e))?;

        Ok(format!("Created folder: {}", self.target_path.display()))
    }

    fn delete_file(&self) -> Result<String, String> {
        if !self.target_path.exists() {
            return Err(format!("File not found: {}", self.target_path.display()));
        }

        if !self.target_path.is_file() {
            return Err(format!("Not a file: {}", self.target_path.display()));
        }

        fs::remove_file(&self.target_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;

        Ok(format!("Deleted file: {}", self.target_path.display()))
    }

    fn delete_folder(&self) -> Result<String, String> {
        if !self.target_path.exists() {
            return Err(format!("Folder not found: {}", self.target_path.display()));
        }

        if !self.target_path.is_dir() {
            return Err(format!("Not a folder: {}", self.target_path.display()));
        }

        fs::remove_dir_all(&self.target_path)
            .map_err(|e| format!("Failed to delete folder: {}", e))?;

        Ok(format!("Deleted folder: {}", self.target_path.display()))
    }

    fn move_file(&self) -> Result<String, String> {
        let dest = self.destination_path.as_ref()
            .ok_or("Destination path required for move operation")?;

        if !self.target_path.exists() {
            return Err(format!("Source file not found: {}", self.target_path.display()));
        }

        fs::rename(&self.target_path, dest)
            .map_err(|e| format!("Failed to move file: {}", e))?;

        Ok(format!(
            "Moved {} to {}",
            self.target_path.display(),
            dest.display()
        ))
    }

    fn copy_file(&self) -> Result<String, String> {
        let dest = self.destination_path.as_ref()
            .ok_or("Destination path required for copy operation")?;

        if !self.target_path.exists() {
            return Err(format!("Source file not found: {}", self.target_path.display()));
        }

        fs::copy(&self.target_path, dest)
            .map_err(|e| format!("Failed to copy file: {}", e))?;

        Ok(format!(
            "Copied {} to {}",
            self.target_path.display(),
            dest.display()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_create_and_delete_file() {
        let temp_dir = env::temp_dir();
        let test_file = temp_dir.join("fluffy_test.txt");

        // Create
        let create_action = FileSystemAction::new(
            ActionType::CreateFile,
            test_file.clone()
        ).with_content("Test content".to_string());

        assert!(create_action.execute().is_ok());
        assert!(test_file.exists());

        // Delete
        let delete_action = FileSystemAction::new(
            ActionType::DeleteFile,
            test_file.clone()
        );

        assert!(delete_action.execute().is_ok());
        assert!(!test_file.exists());
    }
}
