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
