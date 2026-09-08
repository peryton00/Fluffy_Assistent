use sysinfo::System;
use serde_json::json;

use crate::capabilities::handlers::CapabilityHandler;
use crate::capabilities::types::CapabilityError;

#[cfg(windows)]
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

pub struct SystemGetHardwareHandler;

impl CapabilityHandler for SystemGetHardwareHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let mut sys = System::new();
        sys.refresh_cpu_all();
        sys.refresh_memory();

        let os_name = System::name().unwrap_or_else(|| "Unknown".into());
        let os_version = System::os_version().unwrap_or_else(|| "Unknown".into());
        let kernel_version = System::kernel_version().unwrap_or_else(|| "Unknown".into());
        let host_name = System::host_name().unwrap_or_else(|| "localhost".into());

        let cpu_count = sys.cpus().len();
        let cpu_brand = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
        let total_mem_bytes = sys.total_memory();
        let used_mem_bytes = sys.used_memory();
        let avail_mem_bytes = sys.available_memory();

        Ok(json!({
            "os": {
                "name": os_name,
                "version": os_version,
                "kernel": kernel_version,
                "hostname": host_name,
                "platform": std::env::consts::OS,
                "architecture": std::env::consts::ARCH,
            },
            "cpu": {
                "brand": cpu_brand,
                "cores": cpu_count,
            },
            "memory": {
                "total_bytes": total_mem_bytes,
                "used_bytes": used_mem_bytes,
                "available_bytes": avail_mem_bytes,
                "total_gb": (total_mem_bytes as f64 / (1024.0 * 1024.0 * 1024.0)).round(),
                "available_gb": (avail_mem_bytes as f64 / (1024.0 * 1024.0 * 1024.0)).round(),
            }
        }))
    }
}

pub struct SystemGetPowerHandler;

impl CapabilityHandler for SystemGetPowerHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        #[cfg(windows)]
        {
            unsafe {
                let mut status: SYSTEM_POWER_STATUS = std::mem::zeroed();
                if GetSystemPowerStatus(&mut status) != 0 {
                    let battery_pct = if status.BatteryLifePercent != 255 {
                        status.BatteryLifePercent as f32
                    } else {
                        100.0
                    };
                    let ac_online = status.ACLineStatus == 1;

                    return Ok(json!({
                        "battery_percent": battery_pct,
                        "ac_online": ac_online,
                        "charging": ac_online && battery_pct < 100.0,
                        "supported": true,
                    }));
                }
            }
        }

        Ok(json!({
            "battery_percent": 100.0,
            "ac_online": true,
            "charging": false,
            "supported": false,
            "notice": "Native power query not available on this platform",
        }))
    }
}
