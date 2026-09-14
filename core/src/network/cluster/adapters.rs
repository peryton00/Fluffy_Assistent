use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::network::ids::{ConnectionId, NodeId};
use crate::network::model::{
    AuthenticationState, ConnectionDirection, ConnectionKind, NetworkConnection, NetworkNode,
    NodeAvailability, NodeRole, PairingState,
};
use crate::network::types::{FlowProtocol, FlowState};
use crate::terminal::app_state::ClientInfo;

// ============================================================================
// 1. Terminal Mesh Adapter
// ============================================================================

/// Adapter for translating existing Rust Terminal Mesh `ClientInfo` into canonical
/// `NetworkNode` and `NetworkConnection` domain structures.
///
/// Identity Invariant:
/// - Terminal session tags (e.g. `f1`, `[1]`, `[2]`) are local UI/session correlation tags,
///   NOT permanent canonical `NodeId` identities.
/// - If `custom_node_id` is provided (e.g. from authenticated negotiation), it is preserved;
///   otherwise, an explicitly ephemeral identity (`NodeId::ephemeral()`) is generated.
pub struct TerminalMeshAdapter;

impl TerminalMeshAdapter {
    /// Convert a Terminal `ClientInfo` entry into a canonical `NetworkNode`.
    ///
    /// Represents an already-established local Terminal transport session.
    pub fn to_network_node(client: &ClientInfo, custom_node_id: Option<NodeId>) -> NetworkNode {
        let node_id = custom_node_id.unwrap_or_else(NodeId::ephemeral);

        let mut node = NetworkNode::new(
            node_id,
            format!("Terminal Session [{}]", client.tag),
            &client.hostname,
            &client.os,
            &client.arch,
        );

        node.os_version = if client.os_version.is_empty() {
            None
        } else {
            Some(client.os_version.clone())
        };

        node.role = NodeRole::Worker;
        node.availability = NodeAvailability::Connected;
        node.auth_state = AuthenticationState::Authenticated;
        node.pairing_state = PairingState::Paired;

        if !client.ip.is_empty() {
            node.ip_addresses.push(client.ip.clone());
        }

        node.capabilities = vec!["terminal".into(), "remote_tasks".into()];

        let mut meta = HashMap::new();
        meta.insert("adapter_source".into(), "terminal_mesh".into());
        meta.insert("terminal_tag".into(), client.tag.clone());
        meta.insert("connected_at".into(), client.connected_at.clone());
        node.metadata = meta;

        node
    }

    /// Convert a Terminal `ClientInfo` entry into a canonical `NetworkConnection`
    /// referencing the given `NodeId`.
    pub fn to_connection(
        client: &ClientInfo,
        node_id: &NodeId,
        custom_conn_id: Option<ConnectionId>,
    ) -> NetworkConnection {
        let conn_id = custom_conn_id.unwrap_or_else(|| {
            ConnectionId::new(format!("conn_term_{}", client.tag))
        });

        let mut conn = NetworkConnection::new(
            conn_id,
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "0.0.0.0",
            9000,
            FlowState::Established,
        );

        conn.direction = ConnectionDirection::Inbound;
        conn.remote_addr = if client.ip.is_empty() { None } else { Some(client.ip.clone()) };
        conn.associated_node_id = Some(node_id.clone());
        conn.process_name = Some("fluffy-terminal".into());

        conn
    }
}

// ============================================================================
// 2. Python Cluster Compatibility Model & Adapter
// ============================================================================

/// Representation of a legacy Python cluster machine entry (from `ConnectionManager` / `RoleManager`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PythonMachineEntry {
    /// Python machine UUID or identifier
    pub machine_id: String,
    /// Python machine friendly name (e.g. "Machine-192.168.1.50")
    pub machine_name: String,
    /// Host IP address
    pub ip: String,
    /// Python status string: "online", "offline", "available", etc.
    pub status: String,
    /// Epoch timestamp of last heartbeat
    pub last_seen: f64,
    /// Epoch timestamp when connection was established
    pub connected_at: f64,
    /// Python session token string (non-secret identifier)
    pub session_token: Option<String>,
    /// Configured role string ("admin", "available", "standalone")
    pub role: Option<String>,
}

/// Adapter for translating legacy Python Cluster machine entries into canonical
/// `NetworkNode` and `NetworkConnection` domain structures.
pub struct PythonClusterAdapter;

impl PythonClusterAdapter {
    /// Map legacy Python role string to canonical `NodeRole`.
    pub fn map_role(role_str: Option<&str>) -> NodeRole {
        match role_str.unwrap_or_default().to_lowercase().as_str() {
            "admin" => NodeRole::Admin,
            "worker" | "available" => NodeRole::Worker,
            "peer" => NodeRole::Peer,
            _ => NodeRole::Standalone,
        }
    }

    /// Map legacy Python status string to canonical `NodeAvailability`.
    pub fn map_availability(status_str: &str) -> NodeAvailability {
        match status_str.to_lowercase().as_str() {
            "online" | "connected" => NodeAvailability::Connected,
            "available" => NodeAvailability::Available,
            "offline" | "disconnected" => NodeAvailability::Disconnected,
            "recovering" => NodeAvailability::Recovering,
            _ => NodeAvailability::Unknown,
        }
    }

    /// Convert a Python cluster machine entry into a canonical `NetworkNode`.
    pub fn to_network_node(entry: &PythonMachineEntry, custom_node_id: Option<NodeId>) -> NetworkNode {
        let node_id = custom_node_id.unwrap_or_else(|| {
            NodeId::new(format!("node_compat_python_{}", entry.machine_id))
        });

        let mut node = NetworkNode::new(
            node_id,
            &entry.machine_name,
            &entry.machine_name,
            "unknown",
            "unknown",
        );

        node.role = Self::map_role(entry.role.as_deref());
        node.availability = Self::map_availability(&entry.status);
        node.auth_state = AuthenticationState::Authenticated;
        node.pairing_state = PairingState::Paired;
        node.last_seen_epoch = entry.last_seen as u64;

        if !entry.ip.is_empty() {
            node.ip_addresses.push(entry.ip.clone());
        }

        node.capabilities = vec!["cluster_telemetry".into(), "remote_tasks".into()];

        let mut meta = HashMap::new();
        meta.insert("adapter_source".into(), "python_cluster".into());
        meta.insert("legacy_machine_id".into(), entry.machine_id.clone());
        node.metadata = meta;

        node
    }

    /// Convert a Python cluster machine entry into a canonical `NetworkConnection`.
    pub fn to_connection(
        entry: &PythonMachineEntry,
        node_id: &NodeId,
        custom_conn_id: Option<ConnectionId>,
    ) -> NetworkConnection {
        let conn_id = custom_conn_id.unwrap_or_else(|| {
            ConnectionId::new(format!("conn_py_{}", entry.machine_id))
        });

        let mut conn = NetworkConnection::new(
            conn_id,
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "0.0.0.0",
            9000,
            FlowState::Established,
        );

        conn.direction = ConnectionDirection::Inbound;
        conn.remote_addr = if entry.ip.is_empty() { None } else { Some(entry.ip.clone()) };
        conn.associated_node_id = Some(node_id.clone());
        conn.process_name = Some("fluffy-python-cluster".into());

        conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[test]
    fn test_terminal_mesh_adapter_translation() {
        let (tx, _) = mpsc::unbounded_channel();
        let client = ClientInfo {
            tag: "f1".into(),
            hostname: "DESKTOP-CLIENT".into(),
            os: "windows".into(),
            os_version: "10.0.19045".into(),
            ip: "192.168.1.100".into(),
            arch: "x86_64".into(),
            sender: tx,
            connected_at: "2026-09-14 00:00:00".into(),
            is_secure: false,
            peer_public_key: None,
            session_id: 1,
            node_id: Some("DESKTOP-CLIENT".into()),
            is_authoritative: true,
        };

        // 1. Without custom_node_id -> derived explicitly as ephemeral session identity
        let node = TerminalMeshAdapter::to_network_node(&client, None);
        assert!(node.id.is_ephemeral());
        assert_eq!(node.hostname, "DESKTOP-CLIENT");
        assert_eq!(node.os, "windows");
        assert_eq!(node.role, NodeRole::Worker);
        assert_eq!(node.availability, NodeAvailability::Connected);
        assert_eq!(node.ip_addresses, vec!["192.168.1.100"]);
        assert_eq!(node.metadata.get("terminal_tag").map(|s| s.as_str()), Some("f1"));

        // 2. With explicit stable NodeId -> preserved
        let stable_id = NodeId::new("node-stable-terminal-1");
        let stable_node = TerminalMeshAdapter::to_network_node(&client, Some(stable_id.clone()));
        assert_eq!(stable_node.id, stable_id);
        assert!(!stable_node.id.is_ephemeral());

        let conn = TerminalMeshAdapter::to_connection(&client, &node.id, None);
        assert_eq!(conn.id.as_str(), "conn_term_f1");
        assert_eq!(conn.associated_node_id, Some(node.id));
        assert_eq!(conn.kind, ConnectionKind::ClusterTransport);
        assert_eq!(conn.local_port, 9000);
    }

    #[test]
    fn test_python_cluster_adapter_translation() {
        let entry = PythonMachineEntry {
            machine_id: "uuid-1234".into(),
            machine_name: "Machine-192.168.1.50".into(),
            ip: "192.168.1.50".into(),
            status: "online".into(),
            last_seen: 1700000000.0,
            connected_at: 1699990000.0,
            session_token: Some("token_abc".into()),
            role: Some("admin".into()),
        };

        let node = PythonClusterAdapter::to_network_node(&entry, None);
        assert_eq!(node.id.as_str(), "node_compat_python_uuid-1234");
        assert_eq!(node.role, NodeRole::Admin);
        assert_eq!(node.availability, NodeAvailability::Connected);
        assert_eq!(node.ip_addresses, vec!["192.168.1.50"]);
        assert_eq!(node.last_seen_epoch, 1700000000);

        let conn = PythonClusterAdapter::to_connection(&entry, &node.id, None);
        assert_eq!(conn.id.as_str(), "conn_py_uuid-1234");
        assert_eq!(conn.associated_node_id, Some(node.id));
        assert_eq!(conn.kind, ConnectionKind::ClusterTransport);
    }
}
