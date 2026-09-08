use sysinfo::{Pid, ProcessesToUpdate, System};
use serde_json::json;

use crate::capabilities::handlers::CapabilityHandler;
use crate::capabilities::types::CapabilityError;

pub struct ProcessListHandler;

impl CapabilityHandler for ProcessListHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let limit = params.get("limit").and_then(|v| v.as_u64()).unwrap_or(u64::MAX) as usize;

        let mut processes = Vec::new();
        for (pid, proc) in sys.processes() {
            processes.push(json!({
                "pid": pid.as_u32(),
                "name": proc.name().to_string_lossy(),
                "cpu_usage": proc.cpu_usage(),
                "memory_bytes": proc.memory(),
                "parent_pid": proc.parent().map(|p| p.as_u32()),
                "status": format!("{:?}", proc.status()),
            }));
            if processes.len() >= limit {
                break;
            }
        }

        Ok(json!({
            "total_count": sys.processes().len(),
            "processes": processes,
        }))
    }
}

pub struct ProcessTerminateHandler;

impl CapabilityHandler for ProcessTerminateHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let pid_u32 = params
            .get("pid")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| CapabilityError::new("invalid_parameter", "Missing or invalid 'pid' parameter."))?
            as u32;

        // 1. Hard check: System PIDs below 100 are strictly protected
        if pid_u32 < 100 {
            return Err(CapabilityError::new(
                "protected_system_process",
                format!("PID {} is a protected system process and cannot be terminated.", pid_u32),
            ));
        }

        // 2. Refresh process list to inspect process identity
        let mut sys = System::new();
        let sysinfo_pid = Pid::from_u32(pid_u32);
        sys.refresh_processes(ProcessesToUpdate::Some(&[sysinfo_pid]), true);

        let proc = sys.process(sysinfo_pid).ok_or_else(|| {
            CapabilityError::new("process_not_found", format!("No active process found with PID {}.", pid_u32))
        })?;

        let proc_name = proc.name().to_string_lossy().to_lowercase();

        // 3. Blacklist of critical OS processes
        let critical_processes = [
            "smss.exe",
            "csrss.exe",
            "wininit.exe",
            "services.exe",
            "lsass.exe",
            "winlogon.exe",
            "svchost.exe",
            "system",
            "systemd",
            "launchd",
            "kernel_task",
            "init",
        ];

        if critical_processes.iter().any(|&cp| proc_name == cp || proc_name.starts_with(cp)) {
            return Err(CapabilityError::new(
                "critical_system_process_protected",
                format!("Process '{}' (PID {}) is a critical operating system component and cannot be terminated.", proc_name, pid_u32),
            ));
        }

        // 4. Terminate process
        if proc.kill() {
            Ok(json!({
                "pid": pid_u32,
                "name": proc_name,
                "status": "terminated",
                "success": true,
            }))
        } else {
            Err(CapabilityError::new(
                "termination_failed",
                format!("Failed to terminate process '{}' (PID {}). Possible insufficient permissions.", proc_name, pid_u32),
            ))
        }
    }
}
