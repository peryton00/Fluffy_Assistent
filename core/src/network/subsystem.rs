use crate::network::admin::AdminCommandController;
use crate::network::cluster::{ClusterManager, HeartbeatConfig};
use crate::network::config::NetworkTransportConfig;
use crate::network::error::NetworkResult;
use crate::network::event::{EventSubscriber, NetworkEventBus};
use crate::network::state::SharedNetworkState;
use crate::network::telemetry::{NetworkTelemetryService, TelemetrySummary};

use std::sync::Arc;

/// Authoritative entry point and lifecycle coordinator for the Fluffy Network subsystem.
/// 
/// Coordinates transport configuration, thread-safe access to the authoritative `NetworkState`,
/// cluster management lifecycle operations, host telemetry/discovery polling, and the
/// unified network event bus.
#[derive(Debug, Clone)]
pub struct NetworkSubsystem {
    config: NetworkTransportConfig,
    state: SharedNetworkState,
    events: NetworkEventBus,
    cluster: ClusterManager,
    telemetry: NetworkTelemetryService,
    admin: AdminCommandController,
    running: bool,
    sweeper_handle: Arc<tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    shutdown_tx: Arc<tokio::sync::watch::Sender<bool>>,
}

impl Default for NetworkSubsystem {
    fn default() -> Self {
        Self::new(NetworkTransportConfig::default())
    }
}

impl NetworkSubsystem {
    /// Create a new NetworkSubsystem with the specified transport configuration
    pub fn new(config: NetworkTransportConfig) -> Self {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::default();
        let cluster = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events.clone());
        let telemetry = NetworkTelemetryService::new_with_events(state.clone(), events.clone());
        let admin = AdminCommandController::new_with_bus(state.clone(), events.clone());
        let (shutdown_tx, _) = tokio::sync::watch::channel(false);
        Self {
            config,
            state,
            events,
            cluster,
            telemetry,
            admin,
            running: false,
            sweeper_handle: Arc::new(tokio::sync::Mutex::new(None)),
            shutdown_tx: Arc::new(shutdown_tx),
        }
    }

    /// Obtain a subscription handle to the subsystem shutdown signal (REL-01)
    pub fn shutdown_receiver(&self) -> tokio::sync::watch::Receiver<bool> {
        self.shutdown_tx.subscribe()
    }

    /// Access the transport configuration
    pub fn config(&self) -> &NetworkTransportConfig {
        &self.config
    }

    /// Access the thread-safe authoritative NetworkState handle
    pub fn state(&self) -> &SharedNetworkState {
        &self.state
    }

    /// Access the central network event bus
    pub fn events(&self) -> &NetworkEventBus {
        &self.events
    }

    /// Subscribe to the stream of network lifecycle and telemetry events
    pub fn subscribe(&self) -> EventSubscriber {
        self.events.subscribe()
    }

    /// Access the ClusterManager domain service
    pub fn cluster(&self) -> &ClusterManager {
        &self.cluster
    }

    /// Access the NetworkTelemetryService domain service
    pub fn telemetry(&self) -> &NetworkTelemetryService {
        &self.telemetry
    }

    /// Access the AdminCommandController domain service
    pub fn admin(&self) -> &AdminCommandController {
        &self.admin
    }

    /// Access the Network API contract and query interface
    pub fn api(&self) -> crate::network::api::NetworkApi {
        crate::network::api::NetworkApi::new_with_admin(
            self.state.clone(),
            self.events.clone(),
            self.cluster.clone(),
            self.admin.clone(),
        )
    }

    /// Poll host network telemetry and discovery, updating the authoritative `NetworkState`
    pub fn poll_telemetry(&self) -> NetworkResult<TelemetrySummary> {
        self.telemetry.poll_all()
    }

    /// Check if the network subsystem is active
    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Initialize and start the network subsystem boundary, spawning the periodic heartbeat timeout sweeper
    pub fn start(&mut self) -> NetworkResult<()> {
        self.config.validate()?;
        self.running = true;
        let _ = self.shutdown_tx.send(false);

        // Spawn periodic heartbeat timeout sweeper if inside tokio runtime
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            let cluster_clone = self.cluster.clone();
            let interval_sec = self.cluster.config().interval_sec.max(1);
            let join_handle = handle.spawn(async move {
                let mut ticker = tokio::time::interval(std::time::Duration::from_secs(interval_sec));
                loop {
                    ticker.tick().await;
                    let now_epoch = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let _ = cluster_clone.process_heartbeat_timeouts(now_epoch);
                }
            });
            if let Ok(mut guard) = self.sweeper_handle.try_lock() {
                *guard = Some(join_handle);
            }
        }

        Ok(())
    }

    /// Stop the network subsystem boundary, signaling shutdown to transport listeners, canceling background tasks, and failing pending commands
    pub fn stop(&mut self) -> NetworkResult<()> {
        self.running = false;
        let _ = self.shutdown_tx.send(true);
        if let Ok(mut guard) = self.sweeper_handle.try_lock() {
            if let Some(handle) = guard.take() {
                handle.abort();
            }
        }
        Ok(())
    }
}

use once_cell::sync::Lazy;
use crate::network::model::NetworkSecurityObservation;

static GLOBAL_NETWORK_SUBSYSTEM: Lazy<NetworkSubsystem> = Lazy::new(NetworkSubsystem::default);

/// Access the global shared NetworkSubsystem instance
pub fn global_network_subsystem() -> &'static NetworkSubsystem {
    &GLOBAL_NETWORK_SUBSYSTEM
}

/// Record a security observation in the global NetworkSubsystem
pub fn record_security_observation(obs: NetworkSecurityObservation) -> NetworkResult<()> {
    GLOBAL_NETWORK_SUBSYSTEM.telemetry().record_security_observation(obs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::ids::NodeId;
    use crate::network::model::{NetworkEventType, NetworkNode, NodeAvailability};

    #[test]
    fn test_network_subsystem_lifecycle_and_state_access() {
        let mut subsystem = NetworkSubsystem::default();
        assert!(!subsystem.is_running());
        assert_eq!(subsystem.config().cluster_mesh_port, 9000);
        assert_eq!(subsystem.state().revision(), 0);

        let mut sub = subsystem.subscribe();

        assert!(subsystem.start().is_ok());
        assert!(subsystem.is_running());

        // Subsystem state, cluster manager, and telemetry service can be queried and mutated
        let snap = subsystem.state().get_snapshot();
        assert_eq!(snap.revision, 0);
        assert_eq!(subsystem.cluster().list_nodes().len(), 0);

        // Register node via cluster manager -> event flows to subscriber
        let node_id = NodeId::new("subsystem-node-1");
        let mut node = NetworkNode::new(node_id.clone(), "Subsystem Node", "SUB-PC", "linux", "x86_64");
        node.availability = NodeAvailability::Available;
        subsystem.cluster().register_node(node).unwrap();

        let evt = sub.try_recv().unwrap();
        assert_eq!(evt.event_type, NetworkEventType::NodeAvailable);
        assert_eq!(evt.target_node_id, Some(node_id));

        let telemetry_res = subsystem.poll_telemetry();
        assert!(telemetry_res.is_ok());
        let summary = telemetry_res.unwrap();
        assert!(summary.timestamp_epoch_ms > 0);
        assert!(subsystem.state().revision() > 0);

        assert!(subsystem.stop().is_ok());
        assert!(!subsystem.is_running());
    }
}
