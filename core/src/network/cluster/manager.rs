use std::sync::{Arc, RwLock};

use crate::network::cluster::adapters::{
    PythonClusterAdapter, PythonMachineEntry, TerminalMeshAdapter,
};
use crate::network::cluster::heartbeat::{HeartbeatConfig, HeartbeatTracker};
use crate::network::cluster::lifecycle::validate_transition;
use crate::network::error::{NetworkError, NetworkResult};
use crate::network::event::NetworkEventBus;
use crate::network::ids::{ConnectionId, NodeId};
use crate::network::model::{
    EventCategory, EventSeverity, NetworkConnection, NetworkEvent,
    NetworkEventType, NetworkNode, NodeAvailability, NodeRole,
};
use crate::network::state::SharedNetworkState;
use crate::terminal::app_state::ClientInfo;

use crate::network::crypto::{PublicKey, TrustEvaluation, TrustedPeerStore};

/// Canonical Cluster Manager for Fluffy Network.
///
/// Owns cluster lifecycle semantics (registration, availability transitions, heartbeat health)
/// while delegating all authoritative node and connection state to [`SharedNetworkState`].
///
/// Note: `ClusterManager` does NOT maintain an independent node registry; `NetworkState`
/// remains the single source of truth across the entire system.
#[derive(Debug, Clone)]
pub struct ClusterManager {
    state: SharedNetworkState,
    heartbeats: Arc<RwLock<HeartbeatTracker>>,
    trusted_peers: Arc<RwLock<TrustedPeerStore>>,
    config: HeartbeatConfig,
    events: Option<NetworkEventBus>,
}

impl ClusterManager {
    /// Create a new ClusterManager operating over the provided SharedNetworkState
    pub fn new(state: SharedNetworkState, config: HeartbeatConfig) -> Self {
        Self {
            state,
            heartbeats: Arc::new(RwLock::new(HeartbeatTracker::new())),
            trusted_peers: Arc::new(RwLock::new(TrustedPeerStore::new())),
            config,
            events: None,
        }
    }

    /// Create a new ClusterManager with an integrated event publisher
    pub fn new_with_events(
        state: SharedNetworkState,
        config: HeartbeatConfig,
        events: NetworkEventBus,
    ) -> Self {
        Self {
            state,
            heartbeats: Arc::new(RwLock::new(HeartbeatTracker::new())),
            trusted_peers: Arc::new(RwLock::new(TrustedPeerStore::new())),
            config,
            events: Some(events),
        }
    }

    /// Create a new ClusterManager with custom trusted peers store and events
    pub fn new_with_trust(
        state: SharedNetworkState,
        config: HeartbeatConfig,
        trusted_peers: Arc<RwLock<TrustedPeerStore>>,
        events: Option<NetworkEventBus>,
    ) -> Self {
        Self {
            state,
            heartbeats: Arc::new(RwLock::new(HeartbeatTracker::new())),
            trusted_peers,
            config,
            events,
        }
    }

    /// Access the underlying SharedNetworkState handle
    pub fn state(&self) -> &SharedNetworkState {
        &self.state
    }

    /// Access the trusted peer store
    pub fn trusted_peers(&self) -> Arc<RwLock<TrustedPeerStore>> {
        Arc::clone(&self.trusted_peers)
    }

    /// Pair a node and bind its static public key in the trusted peer store
    pub fn pair_node_with_key(&self, id: &NodeId, pubkey: PublicKey) -> NetworkResult<()> {
        if let Ok(mut store) = self.trusted_peers.write() {
            store.add_trusted_peer(id.clone(), pubkey);
        }
        if self.state.read(|s| s.get_node(id).is_some()) {
            self.transition_node_availability(id, NodeAvailability::Pairing)?;
            self.state.write(|s| -> NetworkResult<()> {
                if let Some(mut node) = s.get_node(id) {
                    node.pairing_state = crate::network::model::PairingState::Paired;
                    s.upsert_node(node)?;
                }
                Ok(())
            })?;
        }
        Ok(())
    }

    /// Evaluate peer presented static key against the trusted peer store
    pub fn evaluate_peer_trust(&self, id: &NodeId, pubkey: &PublicKey) -> TrustEvaluation {
        if let Ok(store) = self.trusted_peers.read() {
            store.evaluate_peer(id, pubkey)
        } else {
            TrustEvaluation::Unknown
        }
    }

    /// Revoke trust for a peer by NodeId
    pub fn revoke_peer_trust(&self, id: &NodeId) -> bool {
        if let Ok(mut store) = self.trusted_peers.write() {
            let res = store.revoke_peer(id);
            if res {
                let _ = store.save_to_file(&crate::network::crypto::TrustedPeerStore::default_store_path());
            }
            res
        } else {
            false
        }
    }

    /// List all trusted peers from the store
    pub fn list_trusted_peers(&self) -> Vec<crate::network::crypto::TrustedPeer> {
        if let Ok(store) = self.trusted_peers.read() {
            store.list_trusted_peers()
        } else {
            vec![]
        }
    }

    /// Get trusted peer by NodeId
    pub fn get_trusted_peer(&self, id: &NodeId) -> Option<crate::network::crypto::TrustedPeer> {
        if let Ok(store) = self.trusted_peers.read() {
            store.get(id).cloned()
        } else {
            None
        }
    }

    /// Access the heartbeat configuration
    pub fn config(&self) -> &HeartbeatConfig {
        &self.config
    }

    /// Access the integrated event bus if configured
    pub fn events(&self) -> Option<&NetworkEventBus> {
        self.events.as_ref()
    }

    // ------------------------------------------------------------------------
    // Node Registration & Lifecycle
    // ------------------------------------------------------------------------

    /// Register a new node or update an existing node in the authoritative NetworkState.
    /// Validates domain invariants before committing.
    pub fn register_node(&self, node: NetworkNode) -> NetworkResult<()> {
        node.validate()?;
        let is_new = self.state.read(|s| s.get_node(&node.id).is_none());
        let node_id = node.id.clone();
        let avail = node.availability;

        self.state.upsert_node(node)?;
        let rev = self.state.revision();

        if is_new {
            if let Some(ref bus) = self.events {
                let event_type = match avail {
                    NodeAvailability::Connected => NetworkEventType::NodeConnected,
                    NodeAvailability::Available => NetworkEventType::NodeAvailable,
                    _ => NetworkEventType::NodeDiscovered,
                };
                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    event_type,
                    EventSeverity::Info,
                    format!("Node '{}' registered in cluster", node_id),
                )
                .with_state_revision(rev)
                .with_target_node(node_id);
                bus.publish(evt);
            }
        }
        Ok(())
    }

    /// Update an existing node's metadata or attributes.
    /// Errors if the node does not exist in NetworkState.
    pub fn update_node(&self, node: NetworkNode) -> NetworkResult<()> {
        node.validate()?;
        let (old_role, old_avail) = self.state.write(|s| -> NetworkResult<(NodeRole, NodeAvailability)> {
            let existing = s.get_node(&node.id).ok_or_else(|| {
                NetworkError::InvalidState(format!(
                    "Cannot update non-existent node '{}'",
                    node.id.as_str()
                ))
            })?;
            let old_role = existing.role;
            let old_avail = existing.availability;
            s.upsert_node(node.clone())?;
            Ok((old_role, old_avail))
        })?;

        let rev = self.state.revision();

        if let Some(ref bus) = self.events {
            if old_role != node.role {
                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    NetworkEventType::RoleChanged,
                    EventSeverity::Info,
                    format!("Node '{}' role changed to {}", node.id, node.role),
                )
                .with_state_revision(rev)
                .with_target_node(node.id.clone());
                bus.publish(evt);
            }
            if old_avail != node.availability {
                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    NetworkEventType::NodeAvailable,
                    EventSeverity::Info,
                    format!("Node '{}' availability updated to {}", node.id, node.availability),
                )
                .with_state_revision(rev)
                .with_target_node(node.id);
                bus.publish(evt);
            }
        }
        Ok(())
    }

    /// Unregister and remove a node from the authoritative NetworkState and heartbeat tracker.
    pub fn unregister_node(&self, id: &NodeId) -> NetworkResult<Option<NetworkNode>> {
        let removed = self.state.write(|s| s.remove_node(id))?;
        if let Some(ref node) = removed {
            if let Ok(mut tracker) = self.heartbeats.write() {
                tracker.remove_node(id);
            }
            let rev = self.state.revision();
            if let Some(ref bus) = self.events {
                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    NetworkEventType::NodeDisconnected,
                    EventSeverity::Info,
                    format!("Node '{}' unregistered from cluster", node.id),
                )
                .with_state_revision(rev)
                .with_target_node(node.id.clone());
                bus.publish(evt);
            }
        }
        Ok(removed)
    }

    /// Perform a validated availability state transition for a managed node.
    pub fn transition_node_availability(&self, id: &NodeId, target: NodeAvailability) -> NetworkResult<()> {
        let (old_avail, did_transition) = self.state.write(|s| -> NetworkResult<(NodeAvailability, bool)> {
            let mut node = s.get_node(id).ok_or_else(|| {
                NetworkError::InvalidState(format!(
                    "Cannot transition availability for non-existent node '{}'",
                    id.as_str()
                ))
            })?;

            if node.availability == target {
                return Ok((node.availability, false));
            }

            validate_transition(node.availability, target)?;
            let old = node.availability;
            node.availability = target;
            s.upsert_node(node)?;
            Ok((old, true))
        })?;

        if did_transition {
            let rev = self.state.revision();
            if let Some(ref bus) = self.events {
                let (event_type, severity) = match target {
                    NodeAvailability::Connected => (NetworkEventType::NodeConnected, EventSeverity::Info),
                    NodeAvailability::Disconnected => (NetworkEventType::NodeDisconnected, EventSeverity::Warning),
                    NodeAvailability::Recovering => (NetworkEventType::HeartbeatMissed, EventSeverity::Warning),
                    NodeAvailability::Pairing => (NetworkEventType::PairingStarted, EventSeverity::Info),
                    NodeAvailability::Authenticating => (NetworkEventType::AuthStarted, EventSeverity::Info),
                    NodeAvailability::Available => (NetworkEventType::NodeAvailable, EventSeverity::Info),
                    _ => (NetworkEventType::NodeDiscovered, EventSeverity::Info),
                };

                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    event_type,
                    severity,
                    format!("Node '{}' transitioned from {} to {}", id, old_avail, target),
                )
                .with_state_revision(rev)
                .with_target_node(id.clone());
                bus.publish(evt);
            }
        }

        Ok(())
    }

    // ------------------------------------------------------------------------
    // Heartbeat Tracking & Disconnect/Recovery
    // ------------------------------------------------------------------------

    /// Record a received heartbeat observation for a node.
    /// Updates `last_seen_epoch` and heartbeat tracker metadata.
    ///
    /// Authentication Invariant:
    /// - Heartbeat proves liveness/reachability, NOT authentication.
    /// - It maintains an already-authenticated `Connected` node.
    /// - It restores `Connected` state ONLY when the node is in `Recovering` status
    ///   for an already-authenticated session (`auth_state == AuthenticationState::Authenticated`).
    /// - Unauthenticated or disconnected nodes are NOT promoted to `Connected` by heartbeat alone.
    pub fn record_heartbeat(&self, id: &NodeId, observed_at_epoch_sec: u64) -> NetworkResult<()> {
        // 1. Update internal tracker
        if let Ok(mut tracker) = self.heartbeats.write() {
            tracker.record_heartbeat(id, observed_at_epoch_sec);
        }

        // 2. Update authoritative NetworkState
        let mut did_recover = false;
        self.state.write(|s| -> NetworkResult<()> {
            if let Some(mut node) = s.get_node(id) {
                node.last_seen_epoch = observed_at_epoch_sec;
                // Only recover toward Connected if an active, authenticated session was in recovery
                if node.availability == NodeAvailability::Recovering
                    && node.auth_state == crate::network::model::AuthenticationState::Authenticated
                {
                    node.availability = NodeAvailability::Connected;
                    did_recover = true;
                }
                s.upsert_node(node)?;
            }
            Ok(())
        })?;

        if did_recover {
            let rev = self.state.revision();
            if let Some(ref bus) = self.events {
                let evt = NetworkEvent::new(
                    EventCategory::Cluster,
                    NetworkEventType::NodeRecovered,
                    EventSeverity::Info,
                    format!("Node '{}' recovered connected status after heartbeat", id),
                )
                .with_state_revision(rev)
                .with_target_node(id.clone());
                bus.publish(evt);
            }
        }

        Ok(())
    }

    /// Process heartbeat timeouts against the configured timeout threshold.
    /// Nodes that exceed the timeout are transitioned to `Disconnected` (or `Recovering`),
    /// preserving their canonical identity without deleting them from NetworkState.
    pub fn process_heartbeat_timeouts(&self, now_epoch_sec: u64) -> NetworkResult<Vec<NodeId>> {
        let timeouts = if let Ok(mut tracker) = self.heartbeats.write() {
            tracker.check_timeouts(now_epoch_sec, self.config.timeout_sec)
        } else {
            Vec::new()
        };

        let mut affected = Vec::new();
        for (node_id, _) in timeouts {
            let mut did_disconnect = false;
            self.state.write(|s| -> NetworkResult<()> {
                if let Some(mut node) = s.get_node(&node_id) {
                    if node.availability == NodeAvailability::Connected {
                        node.availability = NodeAvailability::Disconnected;
                        s.upsert_node(node)?;
                        affected.push(node_id.clone());
                        did_disconnect = true;
                    }
                }
                Ok(())
            })?;

            if did_disconnect {
                let rev = self.state.revision();
                if let Some(ref bus) = self.events {
                    let evt = NetworkEvent::new(
                        EventCategory::Cluster,
                        NetworkEventType::HeartbeatMissed,
                        EventSeverity::Warning,
                        format!("Node '{}' heartbeat timed out; transitioned to disconnected", node_id),
                    )
                    .with_state_revision(rev)
                    .with_target_node(node_id.clone());
                    bus.publish(evt);
                }
            }
        }

        Ok(affected)
    }

    // ------------------------------------------------------------------------
    // Cluster Queries (Read-Only Views over NetworkState)
    // ------------------------------------------------------------------------

    /// Get a cloned copy of a node by NodeId
    pub fn get_node(&self, id: &NodeId) -> Option<NetworkNode> {
        self.state.read(|s| s.get_node(id))
    }

    /// List all managed nodes in the cluster
    pub fn list_nodes(&self) -> Vec<NetworkNode> {
        self.state.read(|s| s.list_nodes())
    }

    /// List all nodes matching a specific availability status
    pub fn list_nodes_by_availability(&self, availability: NodeAvailability) -> Vec<NetworkNode> {
        self.state.read(|s| {
            s.list_nodes()
                .into_iter()
                .filter(|n| n.availability == availability)
                .collect()
        })
    }

    /// List all nodes matching a specific operational role
    pub fn list_nodes_by_role(&self, role: NodeRole) -> Vec<NetworkNode> {
        self.state.read(|s| {
            s.list_nodes()
                .into_iter()
                .filter(|n| n.role == role)
                .collect()
        })
    }

    /// Convenience query: Return all currently connected nodes
    pub fn get_connected_nodes(&self) -> Vec<NetworkNode> {
        self.list_nodes_by_availability(NodeAvailability::Connected)
    }

    /// Convenience query: Return all available nodes advertising presence
    pub fn get_available_nodes(&self) -> Vec<NetworkNode> {
        self.list_nodes_by_availability(NodeAvailability::Available)
    }

    /// Convenience query: Return all disconnected nodes
    pub fn get_disconnected_nodes(&self) -> Vec<NetworkNode> {
        self.list_nodes_by_availability(NodeAvailability::Disconnected)
    }

    /// Convenience query: Return all recovering nodes
    pub fn get_recovering_nodes(&self) -> Vec<NetworkNode> {
        self.list_nodes_by_availability(NodeAvailability::Recovering)
    }

    // ------------------------------------------------------------------------
    // Controlled Pairing & Connection Lifecycle (Phase N10)
    // ------------------------------------------------------------------------

    /// Execute the complete, canonical connection workflow for an eligible node:
    /// Available/Disconnected -> Pairing -> Authenticating -> Connected.
    ///
    /// N6 Event Ordering:
    /// mutate authoritative NetworkState -> release state lock -> publish NetworkEvent (with committed revision).
    pub fn connect_node(&self, id: &NodeId) -> NetworkResult<(NetworkNode, Option<NetworkConnection>)> {
        // 1. Check eligibility under read lock
        let current_node = self.state.read(|s| s.get_node(id)).ok_or_else(|| {
            NetworkError::InvalidState(format!("Cannot connect non-existent node '{}'", id.as_str()))
        })?;

        // Idempotency: If already connected, return directly
        if current_node.availability == NodeAvailability::Connected {
            let active_conn = self.state.read(|s| {
                s.list_connections()
                    .into_iter()
                    .find(|c| c.associated_node_id.as_ref() == Some(id) && c.state == crate::network::types::FlowState::Established)
            });
            return Ok((current_node, active_conn));
        }

        // In-flight guard: Prevent duplicate concurrent connection workflows
        if current_node.availability == NodeAvailability::Pairing || current_node.availability == NodeAvailability::Authenticating {
            return Err(NetworkError::InvalidState(format!(
                "Connection attempt already in progress for node '{}' (current state: {})",
                id.as_str(),
                current_node.availability
            )));
        }

        // Must be in an eligible state (Available, Disconnected, or Recovering)
        if current_node.availability != NodeAvailability::Available
            && current_node.availability != NodeAvailability::Disconnected
            && current_node.availability != NodeAvailability::Recovering
        {
            return Err(NetworkError::InvalidState(format!(
                "Node '{}' in state '{}' is not eligible for connection",
                id.as_str(),
                current_node.availability
            )));
        }

        // STEP 1: Transition Available/Disconnected -> Pairing
        validate_transition(current_node.availability, NodeAvailability::Pairing)?;
        self.state.write(|s| -> NetworkResult<()> {
            if let Some(mut node) = s.get_node(id) {
                node.availability = NodeAvailability::Pairing;
                node.pairing_state = crate::network::model::PairingState::PairingRequested;
                s.upsert_node(node)?;
            }
            Ok(())
        })?;
        let rev1 = self.state.revision();
        if let Some(ref bus) = self.events {
            let evt = NetworkEvent::new(
                EventCategory::Cluster,
                NetworkEventType::PairingStarted,
                EventSeverity::Info,
                format!("Pairing initiated for node '{}'", id),
            )
            .with_state_revision(rev1)
            .with_target_node(id.clone());
            bus.publish(evt);
        }

        // STEP 2: Transition Pairing -> Authenticating
        validate_transition(NodeAvailability::Pairing, NodeAvailability::Authenticating)?;
        self.state.write(|s| -> NetworkResult<()> {
            if let Some(mut node) = s.get_node(id) {
                node.availability = NodeAvailability::Authenticating;
                node.auth_state = crate::network::model::AuthenticationState::Authenticating;
                s.upsert_node(node)?;
            }
            Ok(())
        })?;
        let rev2 = self.state.revision();
        if let Some(ref bus) = self.events {
            let evt = NetworkEvent::new(
                EventCategory::Cluster,
                NetworkEventType::AuthStarted,
                EventSeverity::Info,
                format!("Authentication handshake started for node '{}'", id),
            )
            .with_state_revision(rev2)
            .with_target_node(id.clone());
            bus.publish(evt);
        }

        // STEP 3: Complete Authentication & Establish Connection
        validate_transition(NodeAvailability::Authenticating, NodeAvailability::Connected)?;
        let conn_id = ConnectionId::new(format!("conn_cluster_{}", id.as_str()));
        let mut connection: Option<NetworkConnection> = None;

        let final_node = self.state.write(|s| -> NetworkResult<NetworkNode> {
            let mut node = s.get_node(id).ok_or_else(|| {
                NetworkError::InvalidState(format!("Node '{}' lost during connection handshake", id.as_str()))
            })?;

            // Determine transport and auth mode:
            // Explicitly preserve legacy_compatibility semantics without claiming full PKI
            node.metadata.insert("transport_mode".into(), "legacy_compatibility".into());
            node.metadata.insert("auth_mode".into(), "compatibility".into());

            node.availability = NodeAvailability::Connected;
            node.auth_state = crate::network::model::AuthenticationState::Authenticated;
            node.pairing_state = crate::network::model::PairingState::Paired;
            let now_sec = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            node.last_seen_epoch = now_sec;

            s.upsert_node(node.clone())?;

            // Create and record canonical NetworkConnection
            let remote_ip = node.ip_addresses.first().cloned();
            let mut conn = NetworkConnection::new(
                conn_id.clone(),
                crate::network::model::ConnectionKind::ClusterTransport,
                crate::network::types::FlowProtocol::Tcp,
                "0.0.0.0",
                9000,
                crate::network::types::FlowState::Established,
            );
            conn.remote_addr = remote_ip;
            conn.remote_port = Some(9000);
            conn.associated_node_id = Some(id.clone());
            conn.direction = crate::network::model::ConnectionDirection::Outbound;
            conn.established_at_epoch = Some(now_sec);
            conn.last_active_epoch = now_sec;
            s.upsert_connection(conn.clone())?;

            connection = Some(conn);
            Ok(node)
        })?;

        let rev3 = self.state.revision();
        if let Some(ref bus) = self.events {
            let evt = NetworkEvent::new(
                EventCategory::Cluster,
                NetworkEventType::NodeConnected,
                EventSeverity::Info,
                format!("Node '{}' successfully connected to cluster mesh", id),
            )
            .with_state_revision(rev3)
            .with_target_node(id.clone())
            .with_target_connection(conn_id.clone());
            bus.publish(evt);

            let conn_evt = NetworkEvent::new(
                EventCategory::Connection,
                NetworkEventType::ConnectionOpened,
                EventSeverity::Info,
                format!("Cluster transport connection '{}' established for node '{}'", conn_id, id),
            )
            .with_state_revision(rev3)
            .with_target_node(id.clone())
            .with_target_connection(conn_id);
            bus.publish(conn_evt);
        }

        // Record heartbeat in tracker
        if let Ok(mut tracker) = self.heartbeats.write() {
            let now_sec = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            tracker.record_heartbeat(id, now_sec);
        }

        Ok((final_node, connection))
    }

    /// Disconnect a connected node: Connected -> Disconnected.
    /// Preserves canonical NodeId in state and closes active cluster connections.
    pub fn disconnect_node(&self, id: &NodeId) -> NetworkResult<NetworkNode> {
        let current_node = self.state.read(|s| s.get_node(id)).ok_or_else(|| {
            NetworkError::InvalidState(format!("Cannot disconnect non-existent node '{}'", id.as_str()))
        })?;

        if current_node.availability == NodeAvailability::Disconnected {
            return Ok(current_node);
        }

        validate_transition(current_node.availability, NodeAvailability::Disconnected)?;

        let mut closed_conn_ids: Vec<ConnectionId> = Vec::new();

        let updated_node = self.state.write(|s| -> NetworkResult<NetworkNode> {
            let mut node = s.get_node(id).ok_or_else(|| {
                NetworkError::InvalidState(format!("Node '{}' lost during disconnect", id.as_str()))
            })?;

            node.availability = NodeAvailability::Disconnected;
            s.upsert_node(node.clone())?;

            // Close associated cluster connections
            let matching_conns: Vec<NetworkConnection> = s.list_connections()
                .into_iter()
                .filter(|c| c.associated_node_id.as_ref() == Some(id) && c.state == crate::network::types::FlowState::Established)
                .collect();

            for mut conn in matching_conns {
                closed_conn_ids.push(conn.id.clone());
                conn.state = crate::network::types::FlowState::Closed;
                s.upsert_connection(conn)?;
            }

            Ok(node)
        })?;

        // Remove from heartbeat tracker
        if let Ok(mut tracker) = self.heartbeats.write() {
            tracker.remove_node(id);
        }

        let rev = self.state.revision();
        if let Some(ref bus) = self.events {
            let evt = NetworkEvent::new(
                EventCategory::Cluster,
                NetworkEventType::NodeDisconnected,
                EventSeverity::Info,
                format!("Node '{}' disconnected from cluster", id),
            )
            .with_state_revision(rev)
            .with_target_node(id.clone());
            bus.publish(evt);

            for cid in closed_conn_ids {
                let conn_evt = NetworkEvent::new(
                    EventCategory::Connection,
                    NetworkEventType::ConnectionClosed,
                    EventSeverity::Info,
                    format!("Cluster connection '{}' closed for node '{}'", cid, id),
                )
                .with_state_revision(rev)
                .with_target_node(id.clone())
                .with_target_connection(cid);
                bus.publish(conn_evt);
            }
        }

        Ok(updated_node)
    }

    /// Pure projection of authoritative NetworkState into ConnectionInfo (zero secrets).
    pub fn get_connection_info(&self, id: &NodeId) -> NetworkResult<crate::network::api::contracts::ConnectionInfo> {
        self.state.read(|s| {
            let node = s.get_node(id).ok_or_else(|| {
                NetworkError::InvalidState(format!("Node '{}' not found", id.as_str()))
            })?;

            let active_conn = s.list_connections()
                .into_iter()
                .find(|c| c.associated_node_id.as_ref() == Some(id) && c.state == crate::network::types::FlowState::Established);

            let port = active_conn.as_ref().and_then(|c| c.remote_port).or(Some(9000));
            let transport_mode = node.metadata.get("transport_mode").cloned().unwrap_or_else(|| "legacy_compatibility".into());
            let auth_mode = node.metadata.get("auth_mode").cloned().unwrap_or_else(|| "compatibility".into());

            Ok(crate::network::api::contracts::ConnectionInfo {
                node_id: node.id.clone(),
                node_name: node.name.clone(),
                hostname: node.hostname.clone(),
                ip_addresses: node.ip_addresses.clone(),
                port,
                transport_mode,
                auth_mode,
                availability: node.availability,
                pairing_state: node.pairing_state,
                auth_state: node.auth_state,
                last_seen_epoch: node.last_seen_epoch,
                capabilities: node.capabilities.clone(),
                active_connection_id: active_conn.map(|c| c.id),
            })
        })
    }

    // ------------------------------------------------------------------------
    // Ingestion Adapters
    // ------------------------------------------------------------------------

    /// Ingest a connected Rust Terminal Mesh client into authoritative NetworkState.
    /// Creates or updates both the `NetworkNode` and the associated `NetworkConnection`.
    pub fn ingest_terminal_client(
        &self,
        client: &ClientInfo,
        custom_node_id: Option<NodeId>,
    ) -> NetworkResult<(NodeId, ConnectionId)> {
        let node = TerminalMeshAdapter::to_network_node(client, custom_node_id);
        let node_id = node.id.clone();
        let conn = TerminalMeshAdapter::to_connection(client, &node_id, None);
        let conn_id = conn.id.clone();

        self.state.write(|s| -> NetworkResult<()> {
            s.upsert_node(node)?;
            s.upsert_connection(conn)?;
            Ok(())
        })?;

        Ok((node_id, conn_id))
    }

    /// Ingest a legacy Python cluster machine entry into authoritative NetworkState.
    /// Creates or updates both the `NetworkNode` and the associated `NetworkConnection`.
    pub fn ingest_python_machine(
        &self,
        entry: &PythonMachineEntry,
    ) -> NetworkResult<(NodeId, ConnectionId)> {
        let node = PythonClusterAdapter::to_network_node(entry, None);
        let node_id = node.id.clone();
        let conn = PythonClusterAdapter::to_connection(entry, &node_id, None);
        let conn_id = conn.id.clone();

        self.state.write(|s| -> NetworkResult<()> {
            s.upsert_node(node)?;
            s.upsert_connection(conn)?;
            Ok(())
        })?;

        Ok((node_id, conn_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::model::{AuthenticationState, PairingState};
    use std::thread;

    #[test]
    fn test_cluster_manager_registration_and_queries() {
        let state = SharedNetworkState::new();
        let manager = ClusterManager::new(state.clone(), HeartbeatConfig::default());

        assert_eq!(manager.list_nodes().len(), 0);

        let node_id = NodeId::new("node-alpha");
        let mut node = NetworkNode::new(node_id.clone(), "Workstation Alpha", "ALPHA-PC", "windows", "x86_64");
        node.role = NodeRole::Worker;
        node.availability = NodeAvailability::Available;

        // 1. Register node
        manager.register_node(node.clone()).unwrap();
        assert_eq!(manager.list_nodes().len(), 1);
        assert_eq!(manager.get_available_nodes().len(), 1);
        assert_eq!(manager.get_connected_nodes().len(), 0);
        assert_eq!(state.revision(), 1);

        // 2. Direct jump from Available -> Connected is strictly rejected by lifecycle validation
        assert!(manager.transition_node_availability(&node_id, NodeAvailability::Connected).is_err());

        // 3. Proper connection path: Available -> Pairing -> Authenticating -> Connected
        manager.transition_node_availability(&node_id, NodeAvailability::Pairing).unwrap();
        assert_eq!(state.revision(), 2);
        manager.transition_node_availability(&node_id, NodeAvailability::Authenticating).unwrap();
        assert_eq!(state.revision(), 3);
        manager.transition_node_availability(&node_id, NodeAvailability::Connected).unwrap();
        assert_eq!(manager.get_connected_nodes().len(), 1);
        assert_eq!(manager.get_available_nodes().len(), 0);
        assert_eq!(state.revision(), 4);

        // 4. Update node metadata
        node.availability = NodeAvailability::Connected;
        node.name = "Workstation Alpha Updated".into();
        manager.update_node(node).unwrap();
        assert_eq!(manager.get_node(&node_id).unwrap().name, "Workstation Alpha Updated");
        assert_eq!(state.revision(), 5);

        // 5. Unregister node
        let removed = manager.unregister_node(&node_id).unwrap();
        assert!(removed.is_some());
        assert_eq!(manager.list_nodes().len(), 0);
        assert_eq!(state.revision(), 6);
    }

    #[test]
    fn test_stable_identity_across_ip_changes() {
        let state = SharedNetworkState::new();
        let manager = ClusterManager::new(state.clone(), HeartbeatConfig::default());

        let node_id = NodeId::new("node-permanent-1");
        let mut node = NetworkNode::new(node_id.clone(), "Server Node", "SRV-01", "linux", "x86_64");
        node.ip_addresses = vec!["10.0.0.5".into()];
        manager.register_node(node.clone()).unwrap();

        // Node acquires new DHCP IP 10.0.0.25
        node.ip_addresses = vec!["10.0.0.25".into()];
        manager.update_node(node).unwrap();

        // Canonical NodeId remains exactly the same
        assert_eq!(manager.list_nodes().len(), 1);
        let fetched = manager.get_node(&node_id).unwrap();
        assert_eq!(fetched.id, node_id);
        assert_eq!(fetched.ip_addresses, vec!["10.0.0.25"]);
    }

    #[test]
    fn test_heartbeat_and_timeout_lifecycle() {
        let state = SharedNetworkState::new();
        let config = HeartbeatConfig {
            interval_sec: 5,
            timeout_sec: 10,
            missed_threshold: 2,
        };
        let manager = ClusterManager::new(state.clone(), config);

        let node_id = NodeId::new("node-heartbeat-1");
        let mut node = NetworkNode::new(node_id.clone(), "Worker Node", "WRK-01", "linux", "x86_64");
        node.availability = NodeAvailability::Connected;
        node.auth_state = AuthenticationState::Authenticated;
        manager.register_node(node).unwrap();

        // Record initial heartbeat at t=100 -> maintains Connected
        manager.record_heartbeat(&node_id, 100).unwrap();
        assert_eq!(manager.get_node(&node_id).unwrap().last_seen_epoch, 100);
        assert_eq!(manager.get_connected_nodes().len(), 1);

        // Process timeouts at t=105 -> still connected
        let timed_out = manager.process_heartbeat_timeouts(105).unwrap();
        assert!(timed_out.is_empty());
        assert_eq!(manager.get_connected_nodes().len(), 1);

        // Process timeouts at t=115 -> exceeds 10s timeout, transitions to Disconnected
        let timed_out = manager.process_heartbeat_timeouts(115).unwrap();
        assert_eq!(timed_out, vec![node_id.clone()]);
        assert_eq!(manager.get_disconnected_nodes().len(), 1);
        assert_eq!(manager.get_connected_nodes().len(), 0);

        // Disconnected node receiving a heartbeat does NOT automatically jump to Connected
        manager.record_heartbeat(&node_id, 120).unwrap();
        assert_eq!(manager.get_disconnected_nodes().len(), 1);
        assert_eq!(manager.get_connected_nodes().len(), 0);
        assert_eq!(manager.get_node(&node_id).unwrap().last_seen_epoch, 120);

        // When node transitions to Recovering (active session recovery initiated), heartbeat restores Connected
        manager.transition_node_availability(&node_id, NodeAvailability::Recovering).unwrap();
        assert_eq!(manager.get_recovering_nodes().len(), 1);
        manager.record_heartbeat(&node_id, 125).unwrap();
        assert_eq!(manager.get_connected_nodes().len(), 1);
        assert_eq!(manager.get_recovering_nodes().len(), 0);
    }

    #[test]
    fn test_heartbeat_on_unauthenticated_node_does_not_promote() {
        let state = SharedNetworkState::new();
        let manager = ClusterManager::new(state, HeartbeatConfig::default());

        let node_id = NodeId::new("node-unauth");
        let mut node = NetworkNode::new(node_id.clone(), "Unauthenticated Node", "WRK-02", "linux", "x86_64");
        node.availability = NodeAvailability::Available;
        node.auth_state = AuthenticationState::Unauthenticated;
        manager.register_node(node).unwrap();

        // Heartbeat received from unauthenticated node -> updates last_seen but stays Available
        manager.record_heartbeat(&node_id, 200).unwrap();
        let fetched = manager.get_node(&node_id).unwrap();
        assert_eq!(fetched.last_seen_epoch, 200);
        assert_eq!(fetched.availability, NodeAvailability::Available);
        assert_eq!(manager.get_connected_nodes().len(), 0);
    }

    #[test]
    fn test_concurrent_cluster_operations() {
        let state = SharedNetworkState::new();
        let manager = ClusterManager::new(state, HeartbeatConfig::default());
        let mut handles = Vec::new();

        // 10 concurrent writers registering distinct nodes
        for i in 0..10 {
            let mgr = manager.clone();
            handles.push(thread::spawn(move || {
                let node_id = NodeId::new(format!("node-concurrent-{}", i));
                let node = NetworkNode::new(node_id, format!("Node {}", i), "host", "linux", "x86_64");
                mgr.register_node(node).unwrap();
            }));
        }

        // 10 concurrent readers listing nodes
        for _ in 0..10 {
            let mgr = manager.clone();
            handles.push(thread::spawn(move || {
                let nodes = mgr.list_nodes();
                assert!(nodes.len() <= 10);
            }));
        }

        for h in handles {
            h.join().unwrap();
        }

        assert_eq!(manager.list_nodes().len(), 10);
    }

    #[test]
    fn test_cluster_manager_event_emission() {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let mut sub = events.subscribe();
        let manager = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events);

        let node_id = NodeId::new("node-evt-test");
        let mut node = NetworkNode::new(node_id.clone(), "Evt Node", "EVT-PC", "linux", "x86_64");
        node.availability = NodeAvailability::Available;

        // 1. Register -> emits NodeAvailable
        manager.register_node(node.clone()).unwrap();
        let evt1 = sub.try_recv().unwrap();
        assert_eq!(evt1.event_type, NetworkEventType::NodeAvailable);
        assert_eq!(evt1.state_revision, Some(1));
        assert_eq!(evt1.target_node_id, Some(node_id.clone()));

        // 2. Lifecycle transition to Pairing -> emits PairingStarted
        manager.transition_node_availability(&node_id, NodeAvailability::Pairing).unwrap();
        let evt2 = sub.try_recv().unwrap();
        assert_eq!(evt2.event_type, NetworkEventType::PairingStarted);
        assert_eq!(evt2.state_revision, Some(2));

        // 3. Lifecycle transition to Authenticating -> emits AuthStarted
        manager.transition_node_availability(&node_id, NodeAvailability::Authenticating).unwrap();
        let evt3 = sub.try_recv().unwrap();
        assert_eq!(evt3.event_type, NetworkEventType::AuthStarted);
        assert_eq!(evt3.state_revision, Some(3));

        // 4. Lifecycle transition to Connected -> emits NodeConnected
        manager.transition_node_availability(&node_id, NodeAvailability::Connected).unwrap();
        let evt4 = sub.try_recv().unwrap();
        assert_eq!(evt4.event_type, NetworkEventType::NodeConnected);
        assert_eq!(evt4.state_revision, Some(4));

        // Record heartbeat at t=80
        manager.record_heartbeat(&node_id, 80).unwrap();

        // 5. Heartbeat timeout at t=100 (elapsed 20s > 10s timeout) -> transitions to Disconnected, emits HeartbeatMissed
        let timed_out = manager.process_heartbeat_timeouts(100).unwrap();
        assert_eq!(timed_out, vec![node_id.clone()]);
        let evt5 = sub.try_recv().unwrap();
        assert_eq!(evt5.event_type, NetworkEventType::HeartbeatMissed);
        assert_eq!(evt5.severity, EventSeverity::Warning);

        // Repeated timeout check without change does NOT emit duplicate events
        let timed_out_again = manager.process_heartbeat_timeouts(105).unwrap();
        assert!(timed_out_again.is_empty());
        assert_eq!(sub.try_recv(), Err(crate::network::event::EventTryRecvError::Empty));
    }

    #[test]
    fn test_controlled_pairing_and_connect_workflow() {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let mut sub = events.subscribe();
        let manager = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events);

        let node_id = NodeId::new("node-pairing-target");
        let mut node = NetworkNode::new(node_id.clone(), "Target Node", "TARGET-PC", "windows", "x86_64");
        node.ip_addresses = vec!["192.168.1.150".into()];
        node.availability = NodeAvailability::Available;
        manager.register_node(node).unwrap();

        // Flush registration event
        let _ = sub.try_recv().unwrap();

        // 1. Execute connect_node -> runs Available -> Pairing -> Authenticating -> Connected
        let (connected_node, conn_opt) = manager.connect_node(&node_id).unwrap();
        assert_eq!(connected_node.availability, NodeAvailability::Connected);
        assert_eq!(connected_node.pairing_state, PairingState::Paired);
        assert_eq!(connected_node.auth_state, AuthenticationState::Authenticated);
        assert_eq!(connected_node.metadata.get("transport_mode").map(|s: &String| s.as_str()), Some("legacy_compatibility"));
        assert_eq!(connected_node.metadata.get("auth_mode").map(|s: &String| s.as_str()), Some("compatibility"));

        // Authoritative connection created in state
        assert!(conn_opt.is_some());
        let conn = conn_opt.unwrap();
        assert_eq!(conn.associated_node_id, Some(node_id.clone()));
        assert_eq!(conn.remote_addr, Some("192.168.1.150".into()));
        assert_eq!(conn.state, crate::network::types::FlowState::Established);

        // Events emitted with monotonic committed revisions in order:
        // 1) PairingStarted
        let evt_pair = sub.try_recv().unwrap();
        assert_eq!(evt_pair.event_type, NetworkEventType::PairingStarted);
        assert_eq!(evt_pair.target_node_id, Some(node_id.clone()));

        // 2) AuthStarted
        let evt_auth = sub.try_recv().unwrap();
        assert_eq!(evt_auth.event_type, NetworkEventType::AuthStarted);
        assert_eq!(evt_auth.target_node_id, Some(node_id.clone()));

        // 3) NodeConnected
        let evt_conn = sub.try_recv().unwrap();
        assert_eq!(evt_conn.event_type, NetworkEventType::NodeConnected);
        assert_eq!(evt_conn.target_node_id, Some(node_id.clone()));

        // 4) ConnectionOpened
        let evt_opened = sub.try_recv().unwrap();
        assert_eq!(evt_opened.event_type, NetworkEventType::ConnectionOpened);
        assert_eq!(evt_opened.target_node_id, Some(node_id.clone()));
    }

    #[test]
    fn test_disconnect_workflow_and_connection_closure() {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let mut sub = events.subscribe();
        let manager = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events);

        let node_id = NodeId::new("node-disc-target");
        let mut node = NetworkNode::new(node_id.clone(), "Disconnect Target", "DISC-PC", "linux", "x86_64");
        node.ip_addresses = vec!["10.0.0.50".into()];
        node.availability = NodeAvailability::Available;
        manager.register_node(node).unwrap();
        let _ = sub.try_recv().unwrap(); // drain registration event

        // Connect first
        manager.connect_node(&node_id).unwrap();
        // Drain connect events
        while sub.try_recv().is_ok() {}

        // Disconnect node
        let disc_node = manager.disconnect_node(&node_id).unwrap();
        assert_eq!(disc_node.availability, NodeAvailability::Disconnected);
        assert_eq!(disc_node.id, node_id); // NodeId preserved

        // Associated connection closed in authoritative state
        let conns = state.read(|s| s.list_connections());
        let matching_conn = conns.iter().find(|c| c.associated_node_id.as_ref() == Some(&node_id)).unwrap();
        assert_eq!(matching_conn.state, crate::network::types::FlowState::Closed);

        // Events emitted: NodeDisconnected and ConnectionClosed
        let evt_disc = sub.try_recv().unwrap();
        assert_eq!(evt_disc.event_type, NetworkEventType::NodeDisconnected);
        let evt_closed = sub.try_recv().unwrap();
        assert_eq!(evt_closed.event_type, NetworkEventType::ConnectionClosed);

        // Reconnection from Disconnected follows Disconnected -> Pairing -> Authenticating -> Connected
        let (reconnected, _) = manager.connect_node(&node_id).unwrap();
        assert_eq!(reconnected.availability, NodeAvailability::Connected);
    }

    #[test]
    fn test_connect_idempotency_and_rejections() {
        let state = SharedNetworkState::new();
        let manager = ClusterManager::new(state.clone(), HeartbeatConfig::default());

        let node_id = NodeId::new("node-idem");
        let mut node = NetworkNode::new(node_id.clone(), "Idem Node", "IDEM-PC", "linux", "x86_64");
        node.availability = NodeAvailability::Available;
        manager.register_node(node).unwrap();

        // 1. First connect succeeds
        let (c1, _) = manager.connect_node(&node_id).unwrap();
        assert_eq!(c1.availability, NodeAvailability::Connected);

        // 2. Second connect is idempotent and returns Connected without error
        let (c2, _) = manager.connect_node(&node_id).unwrap();
        assert_eq!(c2.availability, NodeAvailability::Connected);

        // 3. Connect on non-existent node fails safely
        let non_existent = NodeId::new("node-non-existent");
        assert!(manager.connect_node(&non_existent).is_err());
    }

    #[test]
    fn test_get_connection_info_projection() {
        let state = SharedNetworkState::new();
        let manager = ClusterManager::new(state.clone(), HeartbeatConfig::default());

        let node_id = NodeId::new("node-proj-info");
        let mut node = NetworkNode::new(node_id.clone(), "Info Node", "INFO-PC", "linux", "x86_64");
        node.ip_addresses = vec!["192.168.1.99".into()];
        node.availability = NodeAvailability::Available;
        manager.register_node(node).unwrap();

        let info_avail = manager.get_connection_info(&node_id).unwrap();
        assert_eq!(info_avail.node_id, node_id);
        assert_eq!(info_avail.availability, NodeAvailability::Available);
        assert_eq!(info_avail.transport_mode, "legacy_compatibility");
        assert_eq!(info_avail.auth_mode, "compatibility");
        assert!(info_avail.active_connection_id.is_none());

        manager.connect_node(&node_id).unwrap();

        let info_conn = manager.get_connection_info(&node_id).unwrap();
        assert_eq!(info_conn.availability, NodeAvailability::Connected);
        assert!(info_conn.active_connection_id.is_some());
    }
}
