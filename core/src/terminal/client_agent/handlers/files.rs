use std::fs;
use std::path::{Path, PathBuf};

/// List files at the given path (or current directory if None).
pub fn handle_ls(path: Option<&str>, cwd: &Path) -> Result<String, String> {
    let target = match path {
        Some(p) => {
            let p = PathBuf::from(p);
            if p.is_absolute() { p } else { cwd.join(p) }
        }
        None => cwd.to_path_buf(),
    };

    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }

    if !target.is_dir() {
        return Err(format!("Not a directory: {}", target.display()));
    }

    let entries = fs::read_dir(&target).map_err(|e| format!("Cannot read directory: {}", e))?;

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                files.push(format!("  [ERROR] {}", e));
                continue;
            }
        };

        let meta = entry.metadata();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        let (type_str, size_str, modified_str) = match meta {
            Ok(m) => {
                let size = if is_dir {
                    "-".to_string()
                } else {
                    format_size(m.len())
                };
                let modified = m
                    .modified()
                    .ok()
                    .map(|t| {
                        let dt: chrono::DateTime<chrono::Local> = t.into();
                        dt.format("%Y-%m-%d %H:%M").to_string()
                    })
                    .unwrap_or_else(|| "-".to_string());
                let t = if is_dir { "DIR " } else { "FILE" };
                (t.to_string(), size, modified)
            }
            Err(_) => ("????".to_string(), "-".to_string(), "-".to_string()),
        };

        let line = format!("  {} {:>10}  {}  {}", type_str, size_str, modified_str, name);

        if is_dir {
            dirs.push(line);
        } else {
            files.push(line);
        }
    }

    dirs.sort();
    files.sort();

    let mut output = format!("Directory: {}\n\n", target.display());
    output.push_str("  Type      Size  Modified          Name\n");
    output.push_str("  ─────────────────────────────────────────\n");

    for d in &dirs {
        output.push_str(d);
        output.push('\n');
    }
    for f in &files {
        output.push_str(f);
        output.push('\n');
    }

    if dirs.is_empty() && files.is_empty() {
        output.push_str("  (empty directory)\n");
    }

    output.push_str(&format!("\n  {} directories, {} files", dirs.len(), files.len()));
    Ok(output)
}

/// Print current working directory.
pub fn handle_pwd(cwd: &Path) -> Result<String, String> {
    Ok(cwd.display().to_string())
}

/// Change working directory. Returns the new path if successful.
pub fn handle_cd(path: &str, cwd: &Path) -> Result<PathBuf, String> {
    let target = if path == ".." {
        cwd.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| cwd.to_path_buf())
    } else if path == "~" {
        dirs_home().unwrap_or_else(|| cwd.to_path_buf())
    } else {
        let p = PathBuf::from(path);
        if p.is_absolute() { p } else { cwd.join(p) }
    };

    let canonical = target
        .canonicalize()
        .map_err(|e| format!("Cannot change to '{}': {}", path, e))?;

    if !canonical.is_dir() {
        return Err(format!("Not a directory: {}", canonical.display()));
    }

    Ok(canonical)
}

/// Print file contents.
pub fn handle_cat(path: &str, cwd: &Path) -> Result<String, String> {
    let target = {
        let p = PathBuf::from(path);
        if p.is_absolute() { p } else { cwd.join(p) }
    };

    if !target.exists() {
        return Err(format!("File not found: {}", target.display()));
    }

    if target.is_dir() {
        return Err(format!("'{}' is a directory, not a file.", target.display()));
    }

    // Try reading as text
    match fs::read_to_string(&target) {
        Ok(content) => {
            if content.len() > 100_000 {
                Ok(format!(
                    "{}\n\n... (file truncated, showing first 100KB of {} total bytes)",
                    &content[..100_000],
                    content.len()
                ))
            } else {
                Ok(content)
            }
        }
        Err(_) => {
            Err("Binary file, cannot display.".to_string())
        }
    }
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn dirs_home() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").ok().map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}
