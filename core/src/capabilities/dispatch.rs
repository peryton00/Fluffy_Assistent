use once_cell::sync::Lazy;

use crate::capabilities::manifest::CapabilityManifest;
use crate::capabilities::registry::CapabilityRegistry;
use crate::capabilities::types::{CapabilityRequest, CapabilityResponse};

/// Global singleton capability registry
static REGISTRY: Lazy<CapabilityRegistry> = Lazy::new(CapabilityRegistry::default);

/// Dispatch a capability request to the global capability registry
pub fn dispatch_capability(request: &CapabilityRequest) -> CapabilityResponse {
    REGISTRY.dispatch(request)
}

/// Discover all native capabilities on the current host
pub fn discover_capabilities() -> CapabilityManifest {
    CapabilityManifest::from_registry(&REGISTRY)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_dispatch_process_list() {
        let req = CapabilityRequest {
            id: "Process.List".into(),
            parameters: json!({"limit": 5}),
            request_id: Some("test-proc-list".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        let procs = data["processes"].as_array().expect("processes array");
        assert!(!procs.is_empty());
        assert!(procs.len() <= 5);
        assert!(procs[0].get("pid").is_some());
        assert!(procs[0].get("name").is_some());
    }

    #[test]
    fn test_dispatch_protected_process_rejection() {
        // PID 4 is Windows System process; < 100 is always protected
        let req = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 4}),
            request_id: Some("test-proc-4".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(!resp.success);
        let err = resp.error.expect("error missing");
        assert_eq!(err.code, "protected_system_process");
    }

    #[test]
    fn test_dispatch_nonexistent_process_rejection() {
        // PID 99999999 is nonexistent
        let req = CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: json!({"pid": 99999999}),
            request_id: Some("test-proc-nonexist".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(!resp.success);
        let err = resp.error.expect("error missing");
        assert_eq!(err.code, "process_not_found");
    }

    #[test]
    fn test_dispatch_safe_path_check() {
        // Protected path check
        let req_blocked = CapabilityRequest {
            id: "Filesystem.SafePathCheck".into(),
            parameters: json!({"path": "C:\\Windows\\System32"}),
            request_id: Some("test-sec-blocked".into()),
        };
        let resp_blocked = dispatch_capability(&req_blocked);
        assert!(resp_blocked.success);
        let data = resp_blocked.data.expect("data missing");
        assert_eq!(data["blocked"], true);

        // Allowed path check
        let temp_dir = std::env::temp_dir();
        let req_allowed = CapabilityRequest {
            id: "Filesystem.SafePathCheck".into(),
            parameters: json!({"path": temp_dir.to_string_lossy()}),
            request_id: Some("test-sec-allowed".into()),
        };
        let resp_allowed = dispatch_capability(&req_allowed);
        assert!(resp_allowed.success);
        let data = resp_allowed.data.expect("data missing");
        assert_eq!(data["blocked"], false);
    }

    #[test]
    fn test_dispatch_filesystem_crud_lifecycle() {
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join(format!("fluffy_test_{}.txt", uuid::Uuid::new_v4()));
        let test_file_str = test_file.to_string_lossy().to_string();

        // 1. Create file
        let create_req = CapabilityRequest {
            id: "Filesystem.Create".into(),
            parameters: json!({
                "path": test_file_str,
                "content": "Hello Fluffy Native Capabilities"
            }),
            request_id: Some("test-fs-create".into()),
        };
        let create_resp = dispatch_capability(&create_req);
        assert!(create_resp.success);
        assert!(test_file.exists());

        // 2. Read metadata
        let meta_req = CapabilityRequest {
            id: "Filesystem.ReadMetadata".into(),
            parameters: json!({"path": test_file_str}),
            request_id: Some("test-fs-meta".into()),
        };
        let meta_resp = dispatch_capability(&meta_req);
        assert!(meta_resp.success);
        let meta_data = meta_resp.data.expect("meta data missing");
        assert_eq!(meta_data["is_file"], true);
        assert_eq!(meta_data["is_dir"], false);
        assert!(meta_data["size_bytes"].as_u64().unwrap() > 0);

        // 3. List directory
        let list_req = CapabilityRequest {
            id: "Filesystem.List".into(),
            parameters: json!({"path": temp_dir.to_string_lossy().to_string()}),
            request_id: Some("test-fs-list".into()),
        };
        let list_resp = dispatch_capability(&list_req);
        assert!(list_resp.success);
        let list_data = list_resp.data.expect("list data missing");
        assert!(list_data["count"].as_u64().unwrap() > 0);

        // 4. Delete file
        let delete_req = CapabilityRequest {
            id: "Filesystem.Delete".into(),
            parameters: json!({"path": test_file_str}),
            request_id: Some("test-fs-delete".into()),
        };
        let delete_resp = dispatch_capability(&delete_req);
        assert!(delete_resp.success);
        assert!(!test_file.exists());
    }

    #[test]
    fn test_dispatch_filesystem_protected_write_rejection() {
        let req = CapabilityRequest {
            id: "Filesystem.Create".into(),
            parameters: json!({
                "path": "C:\\Windows\\fluffy_injected.dll",
                "content": "malicious payload"
            }),
            request_id: Some("test-fs-blocked-write".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(!resp.success);
        let err = resp.error.expect("error missing");
        assert_eq!(err.code, "protected_path_blocked");
    }

    #[test]
    fn test_dispatch_system_get_hardware() {
        let req = CapabilityRequest {
            id: "System.GetHardware".into(),
            parameters: json!({}),
            request_id: Some("test-hw-1".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("os").is_some());
        assert!(data.get("cpu").is_some());
        assert!(data.get("memory").is_some());
        assert!(data["memory"]["total_gb"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn test_dispatch_system_get_power() {
        let req = CapabilityRequest {
            id: "System.GetPower".into(),
            parameters: json!({}),
            request_id: Some("test-power-1".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("battery_percent").is_some());
        assert!(data.get("ac_online").is_some());
    }

    #[test]
    fn test_dispatch_network_list_interfaces() {
        let req = CapabilityRequest {
            id: "Network.ListInterfaces".into(),
            parameters: json!({}),
            request_id: Some("test-net-1".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("interfaces").is_some());
    }

    #[test]
    fn test_dispatch_network_get_interfaces() {
        let req = CapabilityRequest {
            id: "Network.GetInterfaces".into(),
            parameters: json!({}),
            request_id: Some("test-net-get-ifaces".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        let ifaces = data["interfaces"].as_array().expect("interfaces array");
        assert!(!ifaces.is_empty());
        assert!(ifaces[0].get("interface_type").is_some());
        assert!(ifaces[0].get("status").is_some());
    }

    #[test]
    fn test_dispatch_network_get_local_devices() {
        let req = CapabilityRequest {
            id: "Network.GetLocalDevices".into(),
            parameters: json!({}),
            request_id: Some("test-net-get-devices".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("devices").is_some());
        assert!(data.get("count").is_some());
    }

    #[test]
    fn test_dispatch_network_get_active_flows() {
        let req = CapabilityRequest {
            id: "Network.GetActiveFlows".into(),
            parameters: json!({}),
            request_id: Some("test-net-get-flows".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("flows").is_some());
        assert!(data.get("count").is_some());
        let flows = data["flows"].as_array().expect("flows array");
        assert!(!flows.is_empty());
        assert!(flows[0].get("protocol").is_some());
        assert!(flows[0].get("local_port").is_some());
    }



    #[test]
    fn test_dispatch_network_list_wifi_profiles() {
        let req = CapabilityRequest {
            id: "Network.ListWifiProfiles".into(),
            parameters: json!({}),
            request_id: Some("test-net-wifi-profiles".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("profiles").is_some());
        assert!(data.get("count").is_some());

        // Security check: verify no credentials in capability response
        let json_str = serde_json::to_string(&data).unwrap();
        assert!(!json_str.contains("password"));
        assert!(!json_str.contains("keyMaterial"));
    }

    #[test]
    fn test_dispatch_network_packet_capture_lifecycle() {
        // Start capture
        let start_req = CapabilityRequest {
            id: "Network.StartPacketCapture".into(),
            parameters: json!({
                "interface_name": "Wi-Fi",
                "duration_seconds": 30,
                "max_packets": 50
            }),
            request_id: Some("test-start-capture".into()),
        };
        let start_resp = dispatch_capability(&start_req);
        assert!(start_resp.success);
        let start_data = start_resp.data.expect("data missing");
        assert_eq!(start_data["status"]["is_active"], true);
        assert_eq!(start_data["status"]["interface_name"], "Wi-Fi");

        // Get status
        let status_req = CapabilityRequest {
            id: "Network.GetPacketCaptureStatus".into(),
            parameters: json!({}),
            request_id: Some("test-status-capture".into()),
        };
        let status_resp = dispatch_capability(&status_req);
        assert!(status_resp.success);
        let status_data = status_resp.data.expect("data missing");
        assert_eq!(status_data["status"]["is_active"], true);

        // Security check: ensure no payload or raw body in packet observations
        let status_json = serde_json::to_string(&status_data).unwrap();
        assert!(!status_json.contains("payload"));
        assert!(!status_json.contains("body_raw"));

        // Stop capture
        let stop_req = CapabilityRequest {
            id: "Network.StopPacketCapture".into(),
            parameters: json!({}),
            request_id: Some("test-stop-capture".into()),
        };
        let stop_resp = dispatch_capability(&stop_req);
        assert!(stop_resp.success);
        let stop_data = stop_resp.data.expect("data missing");
        assert_eq!(stop_data["status"]["is_active"], false);
    }


    #[test]
    fn test_dispatch_startup_list() {
        let req = CapabilityRequest {
            id: "Application.Startup.List".into(),
            parameters: json!({}),
            request_id: Some("test-startup-list".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(resp.success);
        let data = resp.data.expect("data missing");
        assert!(data.get("items").is_some());
    }

    #[test]
    fn test_dispatch_unknown_capability() {
        let req = CapabilityRequest {
            id: "Nonexistent.Capability".into(),
            parameters: json!({}),
            request_id: Some("test-unk-1".into()),
        };
        let resp = dispatch_capability(&req);
        assert!(!resp.success);
        let err = resp.error.expect("error missing");
        assert_eq!(err.code, "unknown_capability");
    }
}
