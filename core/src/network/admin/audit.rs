use std::fs::{create_dir_all, metadata, remove_file, rename, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use once_cell::sync::Lazy;

use crate::network::admin::types::AdminAuditEntry;
use crate::network::config::default_audit_log_path;

/// Maximum size of a single audit log file before rotation (10 MB)
pub const DEFAULT_MAX_AUDIT_LOG_BYTES: u64 = 10 * 1024 * 1024;
/// Maximum number of rotated archive files to retain (e.g., admin_actions.1.jsonl .. admin_actions.5.jsonl)
pub const DEFAULT_MAX_ROTATED_FILES: usize = 5;

/// Central thread-safe operational admin audit logger with size-based rotation (RES-03 / WIN-01).
pub struct AdminAuditLogger {
    log_path: PathBuf,
    max_file_bytes: u64,
    max_rotated_files: usize,
    in_memory_records: Mutex<Vec<AdminAuditEntry>>,
    rotation_lock: Mutex<()>,
}

static GLOBAL_AUDIT_LOGGER: Lazy<AdminAuditLogger> = Lazy::new(|| {
    AdminAuditLogger::new(default_audit_log_path())
});

/// Access the global operational admin audit logger
pub fn global_admin_audit_logger() -> &'static AdminAuditLogger {
    &GLOBAL_AUDIT_LOGGER
}

impl AdminAuditLogger {
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self::new_with_limits(path, DEFAULT_MAX_AUDIT_LOG_BYTES, DEFAULT_MAX_ROTATED_FILES)
    }

    pub fn new_with_limits(path: impl AsRef<Path>, max_file_bytes: u64, max_rotated_files: usize) -> Self {
        Self {
            log_path: path.as_ref().to_path_buf(),
            max_file_bytes,
            max_rotated_files,
            in_memory_records: Mutex::new(Vec::new()),
            rotation_lock: Mutex::new(()),
        }
    }

    /// Rotate the audit log file if its size exceeds `max_file_bytes`.
    fn maybe_rotate(&self) {
        let _guard = self.rotation_lock.lock();
        if let Ok(meta) = metadata(&self.log_path) {
            if meta.len() >= self.max_file_bytes {
                let parent = self.log_path.parent().unwrap_or_else(|| Path::new("."));
                let stem = self.log_path.file_stem().and_then(|s| s.to_str()).unwrap_or("admin_actions");
                let ext = self.log_path.extension().and_then(|s| s.to_str()).unwrap_or("jsonl");

                // Shift existing rotated files from N down to 1
                for i in (1..=self.max_rotated_files).rev() {
                    let current_archive = parent.join(format!("{}.{}.{}", stem, i, ext));
                    if i == self.max_rotated_files {
                        let _ = remove_file(&current_archive);
                    } else {
                        let next_archive = parent.join(format!("{}.{}.{}", stem, i + 1, ext));
                        if current_archive.exists() {
                            let _ = rename(&current_archive, &next_archive);
                        }
                    }
                }

                // Rename active log file to archive 1
                let first_archive = parent.join(format!("{}.1.{}", stem, ext));
                let _ = rename(&self.log_path, &first_archive);
            }
        }
    }

    /// Record an administrative action execution in the audit log.
    /// Never panics; falls back to in-memory buffer if file write fails.
    pub fn record(&self, entry: AdminAuditEntry) {
        if let Ok(json_line) = serde_json::to_string(&entry) {
            if let Some(parent) = self.log_path.parent() {
                let _ = create_dir_all(parent);
            }

            self.maybe_rotate();

            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.log_path)
            {
                let _ = writeln!(file, "{}", json_line);
            }
        }

        // Store bounded in-memory buffer (retaining last 1000 records for inspection/tests)
        if let Ok(mut records) = self.in_memory_records.lock() {
            if records.len() >= 1000 {
                records.remove(0);
            }
            records.push(entry);
        }
    }

    /// Retrieve in-memory records (for inspection and tests)
    pub fn get_recent_records(&self) -> Vec<AdminAuditEntry> {
        self.in_memory_records.lock().map(|r| r.clone()).unwrap_or_default()
    }

    /// Retrieve in-memory records with optional limit
    pub fn get_recent(&self, limit: Option<usize>) -> Vec<AdminAuditEntry> {
        let all = self.get_recent_records();
        if let Some(l) = limit {
            if all.len() > l {
                return all[all.len() - l..].to_vec();
            }
        }
        all
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_admin_audit_logger_records_entries() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_audit_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let log_file = temp_dir.join("admin_actions.jsonl");
        let logger = AdminAuditLogger::new(&log_file);

        let entry = AdminAuditEntry {
            timestamp_epoch_ms: 1726000000000,
            request_id: "req-test-1".into(),
            target_node_id: "node-target-1".into(),
            capability_id: "Process.Terminate".into(),
            caller_type: "LocalUser".into(),
            authorization_decision: "Allow".into(),
            success: true,
            duration_ms: 45,
            error_code: None,
        };

        logger.record(entry.clone());

        let records = logger.get_recent_records();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].request_id, "req-test-1");
        assert_eq!(records[0].capability_id, "Process.Terminate");
        assert!(records[0].success);

        // Clean up test file
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_admin_audit_logger_rotation_and_retention() {
        let temp_dir = std::env::temp_dir().join(format!("fluffy_audit_rot_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let log_file = temp_dir.join("admin_actions.jsonl");
        // Limit max file size to 200 bytes and max 2 rotated files for testing
        let logger = AdminAuditLogger::new_with_limits(&log_file, 200, 2);

        for i in 0..15 {
            let entry = AdminAuditEntry {
                timestamp_epoch_ms: 1726000000000 + i,
                request_id: format!("req-{}", i),
                target_node_id: "target".into(),
                capability_id: "System.GetHardware".into(),
                caller_type: "LocalUser".into(),
                authorization_decision: "Allow".into(),
                success: true,
                duration_ms: 10,
                error_code: None,
            };
            logger.record(entry);
        }

        assert!(log_file.exists());
        let archive_1 = temp_dir.join("admin_actions.1.jsonl");
        let archive_2 = temp_dir.join("admin_actions.2.jsonl");
        let archive_3 = temp_dir.join("admin_actions.3.jsonl");

        assert!(archive_1.exists(), "Archive 1 must exist after multiple rotations");
        assert!(archive_2.exists(), "Archive 2 must exist after multiple rotations");
        assert!(!archive_3.exists(), "Archive 3 must NOT exist when retention is capped at 2");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
