use std::fs;
use std::path::{Path, PathBuf};

/// Handle upload command — receive file data from admin and save to cwd.
pub fn handle_upload(filename: &str, data: &[u8], cwd: &Path) -> Result<String, String> {
    let target_path = cwd.join(filename);

    fs::write(&target_path, data).map_err(|e| {
        format!(
            "Failed to save uploaded file '{}': {}",
            target_path.display(),
            e
        )
    })?;

    Ok(format!(
        "File '{}' uploaded successfully ({} bytes) to {}",
        filename,
        data.len(),
        target_path.display()
    ))
}

/// Handle download command — read file and return its data.
pub fn handle_download(path: &str, cwd: &Path) -> Result<(String, Vec<u8>), String> {
    let target = {
        let p = PathBuf::from(path);
        if p.is_absolute() {
            p
        } else {
            cwd.join(p)
        }
    };

    if !target.exists() {
        return Err(format!("File not found: {}", target.display()));
    }

    if target.is_dir() {
        return Err(format!("'{}' is a directory, cannot download.", target.display()));
    }

    let data = fs::read(&target).map_err(|e| {
        format!("Failed to read file '{}': {}", target.display(), e)
    })?;

    let filename = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());

    Ok((filename, data))
}
