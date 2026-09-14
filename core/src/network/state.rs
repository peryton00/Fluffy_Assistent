use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::network::error::{NetworkError, NetworkResult};
use crate::network::ids::{ConnectionId, DeviceId, NetworkInterfaceId, NodeId};
use crate::network::model::{
    ConnectionKind, DiscoverySource, NetworkConnection, NetworkDevice, NetworkNode,
    TrafficMetrics,
};
use crate::network::types::{
    LocalNetworkDevice, NetworkFlow, NetworkInterfaceInfo,
};

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ============================================================================
// 1. Snapshot Model
// ============================================================================

/// Coherent, immutable, point-in-time snapshot of the authoritative Network state.
/// Safe to cross IPC/API boundaries; guaranteed free of locks, mutable handles, and secrets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NetworkStateSnapshot {
    /// Monotonically increasing revision number at which this snapshot was generated
    pub revision: u64,
    /// Epoch timestamp (milliseconds) when this snapshot was created
    pub captured_at_epoch_ms: u64,
    /// Authoritative cluster nodes
    pub nodes: Vec<NetworkNode>,
    /// Authoritative discovered network devices
    pub devices: Vec<NetworkDevice>,
    /// Authoritative active network connections and socket flows
    pub connections: Vec<NetworkConnection>,
    /// Authoritative host network interface adapters
    pub interfaces: Vec<NetworkInterfaceInfo>,
    /// Authoritative aggregate traffic metrics
    pub traffic: TrafficMetrics,
}

// ============================================================================
// 2. Authoritative NetworkState Store
// ============================================================================

/// Authoritative runtime state for the Fluffy Network subsystem.
/// 
/// Owns the definitive in-memory collections of cluster nodes, network devices,
/// transport connections, host interfaces, and aggregate traffic metrics.
#[derive(Debug, Clone, PartialEq)]
pub struct NetworkState {
    revision: u64,
    created_at_epoch_ms: u64,
    last_updated_epoch_ms: u64,
    nodes: HashMap<NodeId, NetworkNode>,
    devices: HashMap<DeviceId, NetworkDevice>,
    connections: HashMap<ConnectionId, NetworkConnection>,
    interfaces: HashMap<NetworkInterfaceId, NetworkInterfaceInfo>,
    traffic: TrafficMetrics,
}

impl Default for NetworkState {
    fn default() -> Self {
        Self::new()
    }
}

impl NetworkState {
    /// Create a new, empty authoritative NetworkState at revision 0
    pub fn new() -> Self {
        let now = current_epoch_ms();
        Self {
            revision: 0,
            created_at_epoch_ms: now,
            last_updated_epoch_ms: now,
            nodes: HashMap::new(),
            devices: HashMap::new(),
            connections: HashMap::new(),
            interfaces: HashMap::new(),
            traffic: TrafficMetrics::default(),
        }
    }

    /// Monotonically increasing revision of the network state
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Timestamp (epoch ms) when the network state store was created
    pub fn created_at_epoch_ms(&self) -> u64 {
        self.created_at_epoch_ms
    }

    /// Timestamp (epoch ms) of the most recent state mutation
    pub fn last_updated_epoch_ms(&self) -> u64 {
        self.last_updated_epoch_ms
    }

    fn bump_revision(&mut self) {
        self.revision = self.revision.saturating_add(1);
        self.last_updated_epoch_ms = current_epoch_ms();
    }

    // ------------------------------------------------------------------------
    // Node Mutation & Query APIs
    // ------------------------------------------------------------------------

    /// Insert or update an authoritative cluster node
    pub fn upsert_node(&mut self, node: NetworkNode) -> NetworkResult<()> {
        node.validate()?;
        if let Some(existing) = self.nodes.get(&node.id) {
            if existing == &node {
                return Ok(());
            }
        }
        self.nodes.insert(node.id.clone(), node);
        self.bump_revision();
        Ok(())
    }

    /// Remove a cluster node by NodeId
    pub fn remove_node(&mut self, id: &NodeId) -> NetworkResult<Option<NetworkNode>> {
        let removed = self.nodes.remove(id);
        if removed.is_some() {
            self.bump_revision();
        }
        Ok(removed)
    }

    /// Get a cloned reference to a cluster node by NodeId
    pub fn get_node(&self, id: &NodeId) -> Option<NetworkNode> {
        self.nodes.get(id).cloned()
    }

    /// List all authoritative cluster nodes
    pub fn list_nodes(&self) -> Vec<NetworkNode> {
        self.nodes.values().cloned().collect()
    }

    // ------------------------------------------------------------------------
    // Device Mutation & Query APIs
    // ------------------------------------------------------------------------

    /// Insert or update an authoritative discovered network device
    pub fn upsert_device(&mut self, device: NetworkDevice) -> NetworkResult<()> {
        device.validate()?;
        if let Some(existing) = self.devices.get(&device.id) {
            if existing == &device {
                return Ok(());
            }
        }
        self.devices.insert(device.id.clone(), device);
        self.bump_revision();
        Ok(())
    }

    /// Remove a network device by DeviceId
    pub fn remove_device(&mut self, id: &DeviceId) -> NetworkResult<Option<NetworkDevice>> {
        let removed = self.devices.remove(id);
        if removed.is_some() {
            self.bump_revision();
        }
        Ok(removed)
    }

    /// Get a cloned reference to a network device by DeviceId
    pub fn get_device(&self, id: &DeviceId) -> Option<NetworkDevice> {
        self.devices.get(id).cloned()
    }

    /// List all authoritative discovered network devices
    pub fn list_devices(&self) -> Vec<NetworkDevice> {
        self.devices.values().cloned().collect()
    }

    /// Prune inactive discovered subnet devices that have not been observed within `max_age_secs` (RES-05).
    /// Preserves local host self device, verified cluster nodes, and active default gateways.
    pub fn prune_stale_devices(&mut self, max_age_secs: u64, now_epoch_secs: u64) -> usize {
        let initial_len = self.devices.len();
        self.devices.retain(|_, dev| {
            if dev.is_self || dev.is_gateway || dev.is_fluffy_node {
                return true;
            }
            now_epoch_secs.saturating_sub(dev.last_seen_epoch) <= max_age_secs
        });
        let pruned = initial_len.saturating_sub(self.devices.len());
        if pruned > 0 {
            self.bump_revision();
        }
        pruned
    }

    /// Prune inactive devices using current system epoch time (default 24h TTL)
    pub fn prune_stale_devices_now(&mut self, max_age_secs: u64) -> usize {
        let now_epoch_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.prune_stale_devices(max_age_secs, now_epoch_secs)
    }

    // ------------------------------------------------------------------------
    // Connection Mutation & Query APIs
    // ------------------------------------------------------------------------

    /// Insert or update an authoritative connection or socket flow
    pub fn upsert_connection(&mut self, connection: NetworkConnection) -> NetworkResult<()> {
        connection.validate()?;
        if let Some(existing) = self.connections.get(&connection.id) {
            if existing == &connection {
                return Ok(());
            }
        }
        self.connections.insert(connection.id.clone(), connection);
        self.bump_revision();
        Ok(())
    }

    /// Remove a connection by ConnectionId
    pub fn remove_connection(&mut self, id: &ConnectionId) -> NetworkResult<Option<NetworkConnection>> {
        let removed = self.connections.remove(id);
        if removed.is_some() {
            self.bump_revision();
        }
        Ok(removed)
    }

    /// Get a cloned reference to a connection by ConnectionId
    pub fn get_connection(&self, id: &ConnectionId) -> Option<NetworkConnection> {
        self.connections.get(id).cloned()
    }

    /// List all authoritative connections
    pub fn list_connections(&self) -> Vec<NetworkConnection> {
        self.connections.values().cloned().collect()
    }

    // ------------------------------------------------------------------------
    // Interface Mutation & Query APIs
    // ------------------------------------------------------------------------

    /// Insert or update an authoritative host interface adapter
    pub fn upsert_interface(&mut self, interface: NetworkInterfaceInfo) -> NetworkResult<()> {
        if interface.id.trim().is_empty() {
            return Err(NetworkError::InvalidConfig("Interface ID cannot be empty".into()));
        }
        let iface_id = NetworkInterfaceId::new(&interface.id);
        if let Some(existing) = self.interfaces.get(&iface_id) {
            if existing == &interface {
                return Ok(());
            }
        }
        self.interfaces.insert(iface_id, interface);
        self.bump_revision();
        Ok(())
    }

    /// Remove a host interface by NetworkInterfaceId
    pub fn remove_interface(&mut self, id: &NetworkInterfaceId) -> NetworkResult<Option<NetworkInterfaceInfo>> {
        let removed = self.interfaces.remove(id);
        if removed.is_some() {
            self.bump_revision();
        }
        Ok(removed)
    }

    /// Get a cloned reference to a host interface by NetworkInterfaceId
    pub fn get_interface(&self, id: &NetworkInterfaceId) -> Option<NetworkInterfaceInfo> {
        self.interfaces.get(id).cloned()
    }

    /// List all authoritative host interfaces
    pub fn list_interfaces(&self) -> Vec<NetworkInterfaceInfo> {
        self.interfaces.values().cloned().collect()
    }

    // ------------------------------------------------------------------------
    // Traffic Mutation & Query APIs
    // ------------------------------------------------------------------------

    /// Update aggregate traffic metrics
    pub fn update_traffic(&mut self, metrics: TrafficMetrics) -> NetworkResult<()> {
        if self.traffic == metrics {
            return Ok(());
        }
        self.traffic = metrics;
        self.bump_revision();
        Ok(())
    }

    /// Get current aggregate traffic metrics
    pub fn get_traffic(&self) -> TrafficMetrics {
        self.traffic.clone()
    }

    // ------------------------------------------------------------------------
    // Local Network Adapter Ingestion (Explicit Translation Boundary)
    // ------------------------------------------------------------------------

    /// Ingest a batch of raw `LocalNetworkDevice` observations from collectors,
    /// translating them into canonical `NetworkDevice` entries while preserving stable DeviceIds.
    pub fn ingest_local_devices(&mut self, raw_devices: &[LocalNetworkDevice]) -> NetworkResult<usize> {
        let mut count = 0;
        for raw in raw_devices {
            let mut dev = NetworkDevice::from_discovered(raw.mac_address.as_deref(), &raw.ip_address);
            dev.hostname = raw.hostname.clone();
            dev.is_gateway = raw.is_gateway;
            dev.is_self = raw.is_self;
            dev.state = raw.state;
            dev.first_seen_epoch = raw.first_seen.unwrap_or(0);
            dev.last_seen_epoch = raw.last_seen.unwrap_or(0);
            dev.source = DiscoverySource::ArpTable;

            self.upsert_device(dev)?;
            count += 1;
        }
        Ok(count)
    }

    /// Ingest a batch of raw `NetworkFlow` observations from collectors,
    /// translating them into canonical `NetworkConnection` entries.
    pub fn ingest_local_flows(&mut self, raw_flows: &[NetworkFlow]) -> NetworkResult<usize> {
        let mut count = 0;
        for flow in raw_flows {
            let conn_id = ConnectionId::new(format!(
                "{}_{}_{}_{:?}",
                flow.protocol,
                flow.local_port,
                flow.remote_port.unwrap_or(0),
                flow.remote_address.as_deref().unwrap_or("none")
            ));

            let mut conn = NetworkConnection::new(
                conn_id,
                ConnectionKind::LocalSocketFlow,
                flow.protocol,
                &flow.local_address,
                flow.local_port,
                flow.state,
            );
            conn.remote_addr = flow.remote_address.clone();
            conn.remote_port = flow.remote_port;
            conn.pid = flow.pid;
            conn.process_name = flow.process_name.clone();

            self.upsert_connection(conn)?;
            count += 1;
        }
        Ok(count)
    }

    /// Ingest a batch of raw `NetworkInterfaceInfo` observations from collectors.
    pub fn ingest_local_interfaces(&mut self, interfaces: &[NetworkInterfaceInfo]) -> NetworkResult<usize> {
        let mut count = 0;
        for iface in interfaces {
            self.upsert_interface(iface.clone())?;
            count += 1;
        }
        Ok(count)
    }

    // ------------------------------------------------------------------------
    // Snapshot Production
    // ------------------------------------------------------------------------

    /// Produce an immutable point-in-time snapshot of the authoritative state
    pub fn get_snapshot(&self) -> NetworkStateSnapshot {
        NetworkStateSnapshot {
            revision: self.revision,
            captured_at_epoch_ms: current_epoch_ms(),
            nodes: self.list_nodes(),
            devices: self.list_devices(),
            connections: self.list_connections(),
            interfaces: self.list_interfaces(),
            traffic: self.get_traffic(),
        }
    }
}

// ============================================================================
// 3. Thread-Safe Shared State Handle
// ============================================================================

/// Thread-safe, synchronized handle to the authoritative NetworkState.
/// 
/// Facilitates concurrent, lock-safe read access and isolated write mutations.
#[derive(Debug, Clone)]
pub struct SharedNetworkState {
    inner: Arc<RwLock<NetworkState>>,
}

impl Default for SharedNetworkState {
    fn default() -> Self {
        Self::new()
    }
}

impl SharedNetworkState {
    /// Create a new synchronized SharedNetworkState
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(NetworkState::new())),
        }
    }

    /// Execute a closure with read access to the authoritative state
    pub fn read<R>(&self, f: impl FnOnce(&NetworkState) -> R) -> R {
        let state = self.inner.read().expect("NetworkState read lock poisoned");
        f(&state)
    }

    /// Execute a closure with write access to the authoritative state
    pub fn write<R>(&self, f: impl FnOnce(&mut NetworkState) -> R) -> R {
        let mut state = self.inner.write().expect("NetworkState write lock poisoned");
        f(&mut state)
    }

    /// Obtain a coherent, point-in-time snapshot of the authoritative state
    pub fn get_snapshot(&self) -> NetworkStateSnapshot {
        self.read(|s| s.get_snapshot())
    }

    /// Retrieve the current state revision
    pub fn revision(&self) -> u64 {
        self.read(|s| s.revision())
    }

    /// Convenience helper: Upsert a cluster node
    pub fn upsert_node(&self, node: NetworkNode) -> NetworkResult<()> {
        self.write(|s| s.upsert_node(node))
    }

    /// Convenience helper: Get a cluster node by NodeId
    pub fn get_node(&self, id: &NodeId) -> Option<NetworkNode> {
        self.read(|s| s.get_node(id))
    }

    /// Convenience helper: List all cluster nodes
    pub fn list_nodes(&self) -> Vec<NetworkNode> {
        self.read(|s| s.list_nodes())
    }

    /// Convenience helper: Upsert a network device
    pub fn upsert_device(&self, device: NetworkDevice) -> NetworkResult<()> {
        self.write(|s| s.upsert_device(device))
    }

    /// Convenience helper: Get a network device by DeviceId
    pub fn get_device(&self, id: &DeviceId) -> Option<NetworkDevice> {
        self.read(|s| s.get_device(id))
    }

    /// Convenience helper: List all network devices
    pub fn list_devices(&self) -> Vec<NetworkDevice> {
        self.read(|s| s.list_devices())
    }

    /// Convenience helper: Upsert a connection
    pub fn upsert_connection(&self, conn: NetworkConnection) -> NetworkResult<()> {
        self.write(|s| s.upsert_connection(conn))
    }

    /// Convenience helper: Get a connection by ConnectionId
    pub fn get_connection(&self, id: &ConnectionId) -> Option<NetworkConnection> {
        self.read(|s| s.get_connection(id))
    }

    /// Convenience helper: List all connections
    pub fn list_connections(&self) -> Vec<NetworkConnection> {
        self.read(|s| s.list_connections())
    }

    /// Convenience helper: Upsert an interface
    pub fn upsert_interface(&self, iface: NetworkInterfaceInfo) -> NetworkResult<()> {
        self.write(|s| s.upsert_interface(iface))
    }

    /// Convenience helper: Get an interface by NetworkInterfaceId
    pub fn get_interface(&self, id: &NetworkInterfaceId) -> Option<NetworkInterfaceInfo> {
        self.read(|s| s.get_interface(id))
    }

    /// Convenience helper: List all interfaces
    pub fn list_interfaces(&self) -> Vec<NetworkInterfaceInfo> {
        self.read(|s| s.list_interfaces())
    }

    /// Convenience helper: Update aggregate traffic metrics
    pub fn update_traffic(&self, metrics: TrafficMetrics) -> NetworkResult<()> {
        self.write(|s| s.update_traffic(metrics))
    }

    /// Convenience helper: Get current aggregate traffic metrics
    pub fn traffic(&self) -> TrafficMetrics {
        self.read(|s| s.get_traffic())
    }

    /// Convenience helper: Get current aggregate traffic metrics
    pub fn get_traffic(&self) -> TrafficMetrics {
        self.read(|s| s.get_traffic())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::model::{NodeAvailability, NodeRole};
    use crate::network::types::{FlowProtocol, FlowState, InterfaceType, OperationalStatus};
    use std::thread;

    #[test]
    fn test_empty_state_initialization() {
        let state = NetworkState::new();
        assert_eq!(state.revision(), 0);
        assert!(state.list_nodes().is_empty());
        assert!(state.list_devices().is_empty());
        assert!(state.list_connections().is_empty());
        assert!(state.list_interfaces().is_empty());
    }

    #[test]
    fn test_node_lifecycle_and_monotonic_revision() {
        let mut state = NetworkState::new();
        assert_eq!(state.revision(), 0);

        let node_id = NodeId::new("node-alpha-1");
        let mut node = NetworkNode::new(node_id.clone(), "Workstation Alpha", "DESKTOP-1", "windows", "x86_64");
        node.role = NodeRole::Admin;

        // 1. Insert node -> revision 1
        state.upsert_node(node.clone()).unwrap();
        assert_eq!(state.revision(), 1);
        assert_eq!(state.get_node(&node_id).unwrap().name, "Workstation Alpha");

        // 2. Update node -> revision 2
        node.availability = NodeAvailability::Connected;
        state.upsert_node(node).unwrap();
        assert_eq!(state.revision(), 2);
        assert_eq!(state.get_node(&node_id).unwrap().availability, NodeAvailability::Connected);

        // 3. Remove node -> revision 3
        let removed = state.remove_node(&node_id).unwrap();
        assert!(removed.is_some());
        assert_eq!(state.revision(), 3);
        assert!(state.get_node(&node_id).is_none());
    }

    #[test]
    fn test_device_lifecycle_with_stable_mac_and_changing_ip() {
        let mut state = NetworkState::new();

        // Device first observed with IP 192.168.1.50
        let dev = NetworkDevice::from_discovered(Some("00:11:22:33:44:55"), "192.168.1.50");
        let stable_id = dev.id.clone();
        assert!(stable_id.is_hardware_anchored());

        state.upsert_device(dev).unwrap();
        assert_eq!(state.get_device(&stable_id).unwrap().ip_address, "192.168.1.50");

        // Same physical device later observed with renewed IP 192.168.1.150
        let updated_dev = NetworkDevice::from_discovered(Some("00:11:22:33:44:55"), "192.168.1.150");
        assert_eq!(updated_dev.id, stable_id);

        state.upsert_device(updated_dev).unwrap();
        // ID remains unchanged, IP is updated
        assert_eq!(state.list_devices().len(), 1);
        assert_eq!(state.get_device(&stable_id).unwrap().ip_address, "192.168.1.150");
    }

    #[test]
    fn test_connection_lifecycle() {
        let mut state = NetworkState::new();
        let conn_id = ConnectionId::new("conn-1");
        let conn = NetworkConnection::new(
            conn_id.clone(),
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "127.0.0.1",
            9000,
            FlowState::Established,
        );

        state.upsert_connection(conn).unwrap();
        assert_eq!(state.list_connections().len(), 1);
        assert_eq!(state.get_connection(&conn_id).unwrap().local_port, 9000);

        state.remove_connection(&conn_id).unwrap();
        assert!(state.get_connection(&conn_id).is_none());
    }

    #[test]
    fn test_snapshot_coherence_and_isolation() {
        let mut state = NetworkState::new();
        let node_id = NodeId::new("node-1");
        let node = NetworkNode::new(node_id.clone(), "Node 1", "host1", "linux", "x86_64");
        state.upsert_node(node).unwrap();

        // Take snapshot at revision 1
        let snap1 = state.get_snapshot();
        assert_eq!(snap1.revision, 1);
        assert_eq!(snap1.nodes.len(), 1);

        // Later mutation -> state moves to revision 2
        let node_id_2 = NodeId::new("node-2");
        let node2 = NetworkNode::new(node_id_2.clone(), "Node 2", "host2", "linux", "x86_64");
        state.upsert_node(node2).unwrap();
        assert_eq!(state.revision(), 2);

        // Snapshot 1 remains completely isolated and unchanged at revision 1
        assert_eq!(snap1.revision, 1);
        assert_eq!(snap1.nodes.len(), 1);

        // Snapshot 2 reflects revision 2
        let snap2 = state.get_snapshot();
        assert_eq!(snap2.revision, 2);
        assert_eq!(snap2.nodes.len(), 2);
    }

    #[test]
    fn test_snapshot_serialization_safety() {
        let mut state = NetworkState::new();
        let iface = NetworkInterfaceInfo {
            id: "eth0".into(),
            name: "eth0".into(),
            description: None,
            mac_address: Some("00:11:22:33:44:55".into()),
            interface_type: InterfaceType::Ethernet,
            status: OperationalStatus::Up,
            is_up: true,
            is_physical: true,
            is_loopback: false,
            is_default_gateway: true,
            ipv4_addresses: vec!["192.168.1.10/24".into()],
            ipv6_addresses: vec![],
            gateway: Some("192.168.1.1".into()),
            dns_servers: vec![],
            mtu: Some(1500),
            link_speed_mbps: Some(1000),
            total_received_bytes: 1000,
            total_transmitted_bytes: 500,
            rates: None,
        };
        state.upsert_interface(iface).unwrap();

        let snap = state.get_snapshot();
        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("\"revision\":1"));
        assert!(json.contains("\"name\":\"eth0\""));
        // Ensure no passwords, tokens, or sync primitives exist in serialized snapshot
        assert!(!json.contains("password"));
        assert!(!json.contains("secret"));
        assert!(!json.contains("token"));
        assert!(!json.contains("lock"));

        let deserialized: NetworkStateSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.revision, 1);
        assert_eq!(deserialized.interfaces.len(), 1);
    }

    #[test]
    fn test_shared_network_state_concurrent_readers_and_writers() {
        let shared = SharedNetworkState::new();
        let mut handles = Vec::new();

        // Spawn concurrent writers
        for i in 0..10 {
            let s = shared.clone();
            handles.push(thread::spawn(move || {
                let node_id = NodeId::new(format!("node-concurrent-{}", i));
                let node = NetworkNode::new(node_id, format!("Node {}", i), "host", "linux", "x86_64");
                s.upsert_node(node).unwrap();
            }));
        }

        // Spawn concurrent readers
        for _ in 0..10 {
            let s = shared.clone();
            handles.push(thread::spawn(move || {
                let snap = s.get_snapshot();
                assert!(snap.captured_at_epoch_ms > 0);
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        assert_eq!(shared.read(|s| s.list_nodes().len()), 10);
        assert_eq!(shared.revision(), 10);
    }

    #[test]
    fn test_device_aging_and_pruning() {
        let mut state = NetworkState::new();

        let mut d_fresh = NetworkDevice::new(DeviceId::new("dev-fresh"), "192.168.1.50");
        d_fresh.last_seen_epoch = 1000;

        let mut d_stale = NetworkDevice::new(DeviceId::new("dev-stale"), "192.168.1.51");
        d_stale.last_seen_epoch = 100;

        let mut d_gateway = NetworkDevice::new(DeviceId::new("dev-gw"), "192.168.1.1");
        d_gateway.last_seen_epoch = 100;
        d_gateway.is_gateway = true;

        let mut d_node = NetworkDevice::new(DeviceId::new("dev-fluffy"), "192.168.1.52");
        d_node.last_seen_epoch = 100;
        d_node.is_fluffy_node = true;

        state.upsert_device(d_fresh).unwrap();
        state.upsert_device(d_stale).unwrap();
        state.upsert_device(d_gateway).unwrap();
        state.upsert_device(d_node).unwrap();

        assert_eq!(state.list_devices().len(), 4);
        let rev_before = state.revision();

        // Prune with max_age of 500 at current_time = 1000
        // d_fresh age = 0 (kept)
        // d_stale age = 900 (pruned)
        // d_gateway age = 900 (kept because is_gateway)
        // d_node age = 900 (kept because is_fluffy_node)
        let pruned = state.prune_stale_devices(500, 1000);
        assert_eq!(pruned, 1);
        assert_eq!(state.list_devices().len(), 3);
        assert!(state.revision() > rev_before);

        assert!(state.get_device(&DeviceId::new("dev-fresh")).is_some());
        assert!(state.get_device(&DeviceId::new("dev-stale")).is_none());
        assert!(state.get_device(&DeviceId::new("dev-gw")).is_some());
        assert!(state.get_device(&DeviceId::new("dev-fluffy")).is_some());

        // Repeated pruning is idempotent
        let pruned_again = state.prune_stale_devices(500, 1000);
        assert_eq!(pruned_again, 0);
    }
}
