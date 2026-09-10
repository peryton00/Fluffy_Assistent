use sysinfo::Networks;
use serde_json::json;

use crate::capabilities::handlers::CapabilityHandler;
use crate::capabilities::types::CapabilityError;

pub struct NetworkListInterfacesHandler;

impl CapabilityHandler for NetworkListInterfacesHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let networks = Networks::new_with_refreshed_list();

        let mut ifaces = Vec::new();
        for (name, data) in &networks {
            let ip_networks: Vec<String> = data.ip_networks().iter().map(|n| n.to_string()).collect();
            ifaces.push(json!({
                "name": name,
                "mac_address": data.mac_address().to_string(),
                "ip_networks": ip_networks,
                "total_received_bytes": data.total_received(),
                "total_transmitted_bytes": data.total_transmitted(),
            }));
        }

        Ok(json!({
            "count": ifaces.len(),
            "interfaces": ifaces,
        }))
    }
}

pub struct NetworkGetInterfacesHandler;

impl CapabilityHandler for NetworkGetInterfacesHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let interfaces = crate::network::get_interfaces();
        Ok(json!({
            "count": interfaces.len(),
            "interfaces": interfaces,
        }))
    }
}

pub struct NetworkGetLocalDevicesHandler;

impl CapabilityHandler for NetworkGetLocalDevicesHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let devices = crate::network::get_local_devices();
        Ok(json!({
            "count": devices.len(),
            "devices": devices,
        }))
    }
}

pub struct NetworkGetActiveFlowsHandler;

impl CapabilityHandler for NetworkGetActiveFlowsHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let flows = crate::network::get_active_flows();
        Ok(json!({
            "count": flows.len(),
            "flows": flows,
        }))
    }
}

pub struct NetworkListWifiProfilesHandler;

impl CapabilityHandler for NetworkListWifiProfilesHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let profiles = crate::network::get_wifi_profiles();
        Ok(json!({
            "count": profiles.len(),
            "profiles": profiles,
        }))
    }
}

pub struct NetworkStartPacketCaptureHandler;

impl CapabilityHandler for NetworkStartPacketCaptureHandler {
    fn execute(&self, params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let interface_name = params.get("interface_name").and_then(|v| v.as_str()).map(String::from);
        let max_duration = params.get("duration_seconds").and_then(|v| v.as_u64()).map(|v| v as u32);
        let max_packets = params.get("max_packets").and_then(|v| v.as_u64()).map(|v| v as usize);

        match crate::network::start_packet_capture(interface_name, max_duration, max_packets) {
            Ok(status) => Ok(json!({
                "status": status,
            })),
            Err(e) => Err(CapabilityError::new("capture_start_failed", e)),
        }
    }
}

pub struct NetworkStopPacketCaptureHandler;

impl CapabilityHandler for NetworkStopPacketCaptureHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        match crate::network::stop_packet_capture() {
            Ok(status) => Ok(json!({
                "status": status,
            })),
            Err(e) => Err(CapabilityError::new("capture_stop_failed", e)),
        }
    }
}

pub struct NetworkGetPacketCaptureStatusHandler;

impl CapabilityHandler for NetworkGetPacketCaptureStatusHandler {
    fn execute(&self, _params: &serde_json::Value) -> Result<serde_json::Value, CapabilityError> {
        let status = crate::network::get_packet_capture_status();
        Ok(json!({
            "status": status,
        }))
    }
}




