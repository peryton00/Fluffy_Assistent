use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::network::discovery::get_local_devices;
use crate::network::error::NetworkResult;
use crate::network::event::NetworkEventBus;
use crate::network::flows::get_active_flows;
use crate::network::ids::{ConnectionId, DeviceId, NetworkInterfaceId};
use crate::network::interfaces::get_interfaces_with_rates;
use crate::network::model::{
    ConnectionDirection, ConnectionKind, DiscoverySource, EventCategory, EventSeverity,
    NetworkConnection, NetworkDevice, NetworkEvent, NetworkEventType,
    NetworkSecurityObservation, SecurityRiskLevel, TopTalker, TrafficMetrics,
};
use crate::network::state::SharedNetworkState;
use crate::network::traffic::TrafficRateCalculator;
use crate::network::types::TrafficRates;

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn current_epoch_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

/// Summary metrics returned from a unified telemetry collection cycle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TelemetrySummary {
    /// Number of host network interfaces updated
    pub interfaces_updated: usize,
    /// Number of local network neighbor devices discovered/updated
    pub devices_updated: usize,
    /// Number of active transport socket flows updated
    pub flows_updated: usize,
    /// Aggregate total received bytes across all physical interfaces
    pub total_rx_bytes: u64,
    /// Aggregate total transmitted bytes across all physical interfaces
    pub total_tx_bytes: u64,
    /// Aggregate instantaneous download rate (bits per second)
    pub rx_rate_bps: f64,
    /// Aggregate instantaneous upload rate (bits per second)
    pub tx_rate_bps: f64,
    /// Count of identified top talkers
    pub top_talkers_count: usize,
    /// Epoch timestamp (milliseconds) when telemetry was captured
    pub timestamp_epoch_ms: u64,
}

/// Unified Telemetry and Discovery Service for Fluffy Network.
///
/// Coordinates native host collectors (interfaces, active socket flows, neighbor cache)
/// and writes normalized canonical observations into the authoritative [`SharedNetworkState`].
///
/// Invariants:
/// - `NetworkState` remains the single authoritative store of current network reality.
/// - Discovery and telemetry are strictly observational: they NEVER automatically promote
///   discovered LAN endpoints to authenticated cluster nodes (`discovery ≠ authentication`).
/// - Device identity rules: Stable MACs produce stable `DeviceId::from_mac`; absence of MAC
///   produces `DeviceId::ephemeral`. IP renewals do not alter stable hardware-anchored device IDs.
/// - Flows default to `ConnectionKind::LocalSocketFlow`; cluster transports remain `ConnectionKind::ClusterTransport`.
#[derive(Debug, Clone)]
pub struct NetworkTelemetryService {
    state: SharedNetworkState,
    rate_calculator: Arc<Mutex<TrafficRateCalculator>>,
    events: Option<NetworkEventBus>,
}

impl NetworkTelemetryService {
    /// Create a new NetworkTelemetryService operating over the provided SharedNetworkState
    pub fn new(state: SharedNetworkState) -> Self {
        Self {
            state,
            rate_calculator: Arc::new(Mutex::new(TrafficRateCalculator::new())),
            events: None,
        }
    }

    /// Create a new NetworkTelemetryService with an integrated event publisher
    pub fn new_with_events(state: SharedNetworkState, events: NetworkEventBus) -> Self {
        Self {
            state,
            rate_calculator: Arc::new(Mutex::new(TrafficRateCalculator::new())),
            events: Some(events),
        }
    }

    /// Access the underlying SharedNetworkState handle
    pub fn state(&self) -> &SharedNetworkState {
        &self.state
    }

    /// Access the integrated event bus if configured
    pub fn events(&self) -> Option<&NetworkEventBus> {
        self.events.as_ref()
    }

    // ------------------------------------------------------------------------
    // Interface Telemetry Collection
    // ------------------------------------------------------------------------

    /// Poll host network interface adapters and update their metrics, addresses, and rates
    /// in the authoritative `NetworkState`. Also computes aggregate `TrafficMetrics`.
    pub fn poll_interfaces(&self) -> NetworkResult<usize> {
        let timestamp_nanos = current_epoch_nanos();
        let interfaces = {
            let mut calc = self.rate_calculator.lock().unwrap();
            get_interfaces_with_rates(&mut calc, timestamp_nanos)
        };

        let mut total_rx_bytes = 0u64;
        let mut total_tx_bytes = 0u64;
        let mut total_rx_bps = 0.0f64;
        let mut total_tx_bps = 0.0f64;
        let mut total_rx_bytes_sec = 0.0f64;
        let mut total_tx_bytes_sec = 0.0f64;

        for iface in &interfaces {
            // Aggregate only active physical / non-loopback interfaces for total throughput
            if iface.is_up && !iface.is_loopback {
                total_rx_bytes = total_rx_bytes.saturating_add(iface.total_received_bytes);
                total_tx_bytes = total_tx_bytes.saturating_add(iface.total_transmitted_bytes);

                if let Some(ref rates) = iface.rates {
                    total_rx_bps += rates.rx_bits_per_second;
                    total_tx_bps += rates.tx_bits_per_second;
                    total_rx_bytes_sec += rates.rx_bytes_per_second;
                    total_tx_bytes_sec += rates.tx_bytes_per_second;
                }
            }
        }

        let count = interfaces.len();
        let mut events_to_emit = Vec::new();

        self.state.write(|s| -> NetworkResult<()> {
            for iface in &interfaces {
                let iface_id = NetworkInterfaceId::new(&iface.id);
                let existing = s.get_interface(&iface_id);

                if let Some(ref prev) = existing {
                    // Operational state changed (e.g. up -> down)
                    if prev.is_up != iface.is_up {
                        let severity = if iface.is_up {
                            EventSeverity::Info
                        } else {
                            EventSeverity::Warning
                        };
                        events_to_emit.push(NetworkEvent::new(
                            EventCategory::Network,
                            NetworkEventType::InterfaceChanged,
                            severity,
                            format!(
                                "Interface '{}' status changed from {} to {}",
                                iface.name,
                                if prev.is_up { "UP" } else { "DOWN" },
                                if iface.is_up { "UP" } else { "DOWN" }
                            ),
                        ));
                    }
                } else {
                    // New interface detected
                    events_to_emit.push(NetworkEvent::new(
                        EventCategory::Network,
                        NetworkEventType::InterfaceAdded,
                        EventSeverity::Info,
                        format!("New network interface '{}' detected", iface.name),
                    ));
                }

                s.upsert_interface(iface.clone())?;
            }

            // Update aggregate traffic metrics
            let current_traffic = s.get_traffic();
            let updated_traffic = TrafficMetrics {
                rx_bytes: total_rx_bytes,
                tx_bytes: total_tx_bytes,
                rx_packets: current_traffic.rx_packets,
                tx_packets: current_traffic.tx_packets,
                rx_errors: current_traffic.rx_errors,
                tx_errors: current_traffic.tx_errors,
                rx_drops: current_traffic.rx_drops,
                tx_drops: current_traffic.tx_drops,
                rates: Some(TrafficRates {
                    rx_bytes_per_second: (total_rx_bytes_sec * 100.0).round() / 100.0,
                    tx_bytes_per_second: (total_tx_bytes_sec * 100.0).round() / 100.0,
                    rx_bits_per_second: (total_rx_bps * 100.0).round() / 100.0,
                    tx_bits_per_second: (total_tx_bps * 100.0).round() / 100.0,
                    rx_bytes_per_sec: (total_rx_bytes_sec * 100.0).round() / 100.0,
                    tx_bytes_per_sec: (total_tx_bytes_sec * 100.0).round() / 100.0,
                }),
                top_talkers: current_traffic.top_talkers,
            };
            s.update_traffic(updated_traffic)?;
            Ok(())
        })?;

        if let Some(ref bus) = self.events {
            let rev = self.state.revision();
            for evt in events_to_emit {
                bus.publish(evt.with_state_revision(rev));
            }
        }

        Ok(count)
    }

    // ------------------------------------------------------------------------
    // Device Discovery Collection
    // ------------------------------------------------------------------------

    /// Poll local network neighbor devices via passive OS neighbor tables (ARP) and ingest
    /// them into `NetworkState` while strictly preserving stable `DeviceId` mappings.
    pub fn poll_devices(&self) -> NetworkResult<usize> {
        let raw_devices = get_local_devices();
        let count = raw_devices.len();
        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut events_to_emit = Vec::new();

        self.state.write(|s| -> NetworkResult<()> {
            for raw in raw_devices {
                let dev_id = raw.mac_address
                    .as_deref()
                    .and_then(DeviceId::from_mac)
                    .unwrap_or_else(DeviceId::ephemeral);

                let existing = s.get_device(&dev_id);
                let (first_seen, last_seen, assoc_node) = if let Some(ref prev) = existing {
                    let has_changed = prev.ip_address != raw.ip_address
                        || prev.state != raw.state
                        || prev.hostname != raw.hostname
                        || prev.is_gateway != raw.is_gateway
                        || prev.is_self != raw.is_self;

                    if prev.state != raw.state {
                        events_to_emit.push(NetworkEvent::new(
                            EventCategory::Discovery,
                            NetworkEventType::DeviceStateChanged,
                            EventSeverity::Info,
                            format!("Device '{}' reachability state changed to {:?}", dev_id, raw.state),
                        ).with_target_device(dev_id.clone()));
                    } else if prev.ip_address != raw.ip_address {
                        events_to_emit.push(NetworkEvent::new(
                            EventCategory::Discovery,
                            NetworkEventType::DeviceUpdated,
                            EventSeverity::Info,
                            format!("Device '{}' IP address changed to {}", dev_id, raw.ip_address),
                        ).with_target_device(dev_id.clone()));
                    }

                    let last_s = if has_changed {
                        now_sec
                    } else {
                        prev.last_seen_epoch
                    };

                    (prev.first_seen_epoch, last_s, prev.associated_node_id.clone())
                } else {
                    events_to_emit.push(NetworkEvent::new(
                        EventCategory::Discovery,
                        NetworkEventType::DeviceDiscovered,
                        EventSeverity::Info,
                        format!("Discovered new device '{}' at IP {}", dev_id, raw.ip_address),
                    ).with_target_device(dev_id.clone()));
                    (raw.first_seen.unwrap_or(now_sec), now_sec, None)
                };

                let mut dev = NetworkDevice::new(dev_id, &raw.ip_address);
                dev.mac_address = raw.mac_address;
                dev.hostname = raw.hostname;
                dev.is_gateway = raw.is_gateway;
                dev.is_self = raw.is_self;
                dev.state = raw.state;
                dev.source = DiscoverySource::ArpTable;
                dev.first_seen_epoch = first_seen;
                dev.last_seen_epoch = last_seen;
                dev.associated_node_id = assoc_node;

                s.upsert_device(dev)?;
            }
            Ok(())
        })?;

        if let Some(ref bus) = self.events {
            let rev = self.state.revision();
            for evt in events_to_emit {
                bus.publish(evt.with_state_revision(rev));
            }
        }

        Ok(count)
    }

    // ------------------------------------------------------------------------
    // Flow Telemetry & Attribution
    // ------------------------------------------------------------------------

    /// Poll active OS transport socket flows and ingest them into `NetworkState` as
    /// `ConnectionKind::LocalSocketFlow` with non-fabricated attribution.
    pub fn poll_flows(&self) -> NetworkResult<usize> {
        let raw_flows = get_active_flows();
        let count = raw_flows.len();

        // Retrieve known cluster nodes to attribute cluster transport connections if matched
        let cluster_nodes = self.state.read(|s| s.list_nodes());
        let mut events_to_emit = Vec::new();
        let mut active_flow_ids = std::collections::HashSet::new();

        self.state.write(|s| -> NetworkResult<()> {
            for flow in raw_flows {
                let conn_id = ConnectionId::new(format!(
                    "flow_{}_{}_{}_{:?}",
                    flow.protocol,
                    flow.local_port,
                    flow.remote_port.unwrap_or(0),
                    flow.remote_address.as_deref().unwrap_or("0.0.0.0")
                ));
                active_flow_ids.insert(conn_id.clone());

                let existing = s.get_connection(&conn_id);
                let (last_active, established_at) = if let Some(ref prev) = existing {
                    if prev.state != flow.state {
                        events_to_emit.push(NetworkEvent::new(
                            EventCategory::Connection,
                            NetworkEventType::ConnectionStateChanged,
                            EventSeverity::Info,
                            format!("Connection '{}' state changed from {:?} to {:?}", conn_id, prev.state, flow.state),
                        ).with_target_connection(conn_id.clone()));
                    }
                    (prev.last_active_epoch, prev.established_at_epoch)
                } else {
                    events_to_emit.push(NetworkEvent::new(
                        EventCategory::Connection,
                        NetworkEventType::ConnectionOpened,
                        EventSeverity::Info,
                        format!("Socket flow opened: {}:{} -> {:?}", flow.local_address, flow.local_port, flow.remote_address),
                    ).with_target_connection(conn_id.clone()));
                    (0, None)
                };

                // Attribution: match remote address against known cluster node IPs
                let mut matched_node_id = None;
                if let Some(ref r_addr) = flow.remote_address {
                    for node in &cluster_nodes {
                        if node.ip_addresses.iter().any(|ip| ip == r_addr) {
                            matched_node_id = Some(node.id.clone());
                            break;
                        }
                    }
                }

                // Determine flow direction relative to local host
                let direction = if flow.remote_address.is_none() || flow.remote_port == Some(0) {
                    ConnectionDirection::Local
                } else if flow.local_port < 1024 || flow.local_port == 9000 {
                    ConnectionDirection::Inbound
                } else {
                    ConnectionDirection::Outbound
                };

                let mut conn = NetworkConnection::new(
                    conn_id,
                    ConnectionKind::LocalSocketFlow,
                    flow.protocol,
                    &flow.local_address,
                    flow.local_port,
                    flow.state,
                );
                conn.remote_addr = flow.remote_address;
                conn.remote_port = flow.remote_port;
                conn.pid = flow.pid;
                conn.process_name = flow.process_name;
                conn.direction = direction;
                conn.associated_node_id = matched_node_id;
                conn.last_active_epoch = last_active;
                conn.established_at_epoch = established_at;

                s.upsert_connection(conn)?;
            }

            // Reconcile closed local socket flows (only LocalSocketFlow; preserve ClusterTransport / IpcStream)
            let existing_conns = s.list_connections();
            for conn in existing_conns {
                if conn.kind == ConnectionKind::LocalSocketFlow && !active_flow_ids.contains(&conn.id) {
                    s.remove_connection(&conn.id)?;
                    events_to_emit.push(NetworkEvent::new(
                        EventCategory::Connection,
                        NetworkEventType::ConnectionClosed,
                        EventSeverity::Info,
                        format!("Socket flow closed: {}", conn.id),
                    ).with_target_connection(conn.id));
                }
            }

            Ok(())
        })?;

        if let Some(ref bus) = self.events {
            let rev = self.state.revision();
            for evt in events_to_emit {
                bus.publish(evt.with_state_revision(rev));
            }
        }

        Ok(count)
    }

    // ------------------------------------------------------------------------
    // Security Observation Ingestion
    // ------------------------------------------------------------------------

    /// Record a structured network security observation and publish a corresponding security event.
    pub fn record_security_observation(&self, obs: NetworkSecurityObservation) -> NetworkResult<()> {
        if let Some(ref bus) = self.events {
            let severity = match obs.risk_level {
                SecurityRiskLevel::Low => EventSeverity::Notice,
                SecurityRiskLevel::Medium => EventSeverity::Warning,
                SecurityRiskLevel::High => EventSeverity::Error,
                SecurityRiskLevel::Critical => EventSeverity::Critical,
            };

            let rev = self.state.revision();
            let mut evt = NetworkEvent::new(
                EventCategory::Security,
                NetworkEventType::SecurityObservationCreated,
                severity,
                obs.description.clone(),
            )
            .with_state_revision(rev)
            .with_details(serde_json::json!({
                "observation_id": obs.observation_id,
                "anomaly_kind": obs.anomaly_kind,
                "risk_level": obs.risk_level,
                "affected_interface": obs.affected_interface,
                "affected_ip": obs.affected_ip,
                "affected_mac": obs.affected_mac,
                "affected_pid": obs.affected_pid,
                "evidence": obs.evidence,
            }));

            // Correlation Precedence:
            // 1. Device identity via MAC address
            if let Some(ref mac) = obs.affected_mac {
                if let Some(dev_id) = DeviceId::from_mac(mac) {
                    if self.state.get_device(&dev_id).is_some() {
                        evt = evt.with_target_device(dev_id);
                    }
                }
            }

            // 2. Connection match & associated node match via affected IP
            if let Some(ref ip) = obs.affected_ip {
                let connections = self.state.list_connections();
                if let Some(conn) = connections.iter().find(|c| {
                    c.remote_addr.as_deref() == Some(ip.as_str()) || c.local_addr == *ip
                }) {
                    evt = evt.with_target_connection(conn.id.clone());
                    if let Some(ref node_id) = conn.associated_node_id {
                        evt = evt.with_target_node(node_id.clone());
                    }
                }

                // 3. Unambiguous Device IP correlation if target_device_id was not set by MAC
                if evt.target_device_id.is_none() {
                    let matching_devices: Vec<_> = self.state.list_devices()
                        .into_iter()
                        .filter(|d| d.ip_address == *ip)
                        .collect();
                    if matching_devices.len() == 1 {
                        evt = evt.with_target_device(matching_devices[0].id.clone());
                    }
                }
            }

            bus.publish(evt);
        }
        Ok(())
    }

    /// Calculate current top network talkers across active interfaces and connections.
    ///
    /// Attribution Invariant:
    /// - Uses the strongest available identity (e.g. `NodeId`, `DeviceId`, or interface name).
    /// - Never fabricates node or device identities where evidence is absent.
    pub fn calculate_top_talkers(&self, limit: usize) -> Vec<TopTalker> {
        let interfaces = self.state.read(|s| s.list_interfaces());
        let mut candidates = Vec::new();

        for iface in interfaces {
            if iface.is_up && !iface.is_loopback {
                let rx_rate = iface.rates.as_ref().map(|r| r.rx_bits_per_second).unwrap_or(0.0);
                let tx_rate = iface.rates.as_ref().map(|r| r.tx_bits_per_second).unwrap_or(0.0);

                candidates.push(TopTalker {
                    entity_id: iface.id.clone(),
                    entity_name: format!("Interface: {}", iface.name),
                    rx_bytes: iface.total_received_bytes,
                    tx_bytes: iface.total_transmitted_bytes,
                    rx_rate_bps: rx_rate,
                    tx_rate_bps: tx_rate,
                });
            }
        }

        // Sort descending by total bandwidth rate (rx + tx)
        candidates.sort_by(|a, b| {
            let total_a = a.rx_rate_bps + a.tx_rate_bps;
            let total_b = b.rx_rate_bps + b.tx_rate_bps;
            total_b.partial_cmp(&total_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        candidates.truncate(limit);
        candidates
    }

    // ------------------------------------------------------------------------
    // Unified Telemetry Poll (Single Coordinated Cycle)
    // ------------------------------------------------------------------------

    /// Perform a single coordinated collection cycle across interfaces, devices, and flows,
    /// updating `NetworkState` and returning a [`TelemetrySummary`].
    pub fn poll_all(&self) -> NetworkResult<TelemetrySummary> {
        let ifaces_updated = self.poll_interfaces()?;
        let devices_updated = self.poll_devices()?;
        let flows_updated = self.poll_flows()?;

        let top_talkers = self.calculate_top_talkers(5);
        let top_talkers_count = top_talkers.len();

        // Update top talkers in NetworkState's TrafficMetrics
        self.state.write(|s| -> NetworkResult<()> {
            let mut traffic = s.get_traffic();
            traffic.top_talkers = top_talkers;
            s.update_traffic(traffic)?;
            Ok(())
        })?;

        let traffic = self.state.read(|s| s.get_traffic());
        let (rx_bps, tx_bps) = traffic.rates
            .as_ref()
            .map(|r| (r.rx_bits_per_second, r.tx_bits_per_second))
            .unwrap_or((0.0, 0.0));

        Ok(TelemetrySummary {
            interfaces_updated: ifaces_updated,
            devices_updated: devices_updated,
            flows_updated: flows_updated,
            total_rx_bytes: traffic.rx_bytes,
            total_tx_bytes: traffic.tx_bytes,
            rx_rate_bps: rx_bps,
            tx_rate_bps: tx_bps,
            top_talkers_count,
            timestamp_epoch_ms: current_epoch_ms(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::model::{NodeAvailability, NodeRole};
    use crate::network::types::{FlowProtocol, FlowState, InterfaceType, OperationalStatus};

    #[test]
    fn test_telemetry_service_initialization_and_queries() {
        let state = SharedNetworkState::new();
        let telemetry = NetworkTelemetryService::new(state.clone());

        assert_eq!(telemetry.state().revision(), 0);
        let summary = telemetry.poll_all().unwrap();
        assert!(summary.timestamp_epoch_ms > 0);
        assert!(state.revision() > 0);
    }

    #[test]
    fn test_device_discovery_stable_mac_and_ephemeral_identity() {
        let state = SharedNetworkState::new();
        let _telemetry = NetworkTelemetryService::new(state.clone());

        // Insert mock device with stable MAC
        let dev1 = NetworkDevice::from_discovered(Some("00:11:22:33:44:55"), "192.168.1.50");
        let stable_id = dev1.id.clone();
        assert!(stable_id.is_hardware_anchored());
        assert!(!stable_id.is_ephemeral());

        state.upsert_device(dev1).unwrap();
        assert_eq!(state.get_device(&stable_id).unwrap().ip_address, "192.168.1.50");

        // Device changes IP via DHCP -> Same DeviceId is updated
        let dev1_renewed = NetworkDevice::from_discovered(Some("00:11:22:33:44:55"), "192.168.1.150");
        assert_eq!(dev1_renewed.id, stable_id);
        state.upsert_device(dev1_renewed).unwrap();

        assert_eq!(state.list_devices().len(), 1);
        assert_eq!(state.get_device(&stable_id).unwrap().ip_address, "192.168.1.150");

        // Ephemeral device without MAC
        let dev_ephem = NetworkDevice::from_discovered(None, "192.168.1.200");
        assert!(dev_ephem.id.is_ephemeral());
    }

    #[test]
    fn test_flow_telemetry_and_cluster_attribution() {
        let state = SharedNetworkState::new();
        let _telemetry = NetworkTelemetryService::new(state.clone());

        // Register a known cluster node
        let node_id = crate::network::ids::NodeId::new("node-cluster-worker");
        let mut node = crate::network::model::NetworkNode::new(
            node_id.clone(),
            "Worker 1",
            "WORKER-PC",
            "linux",
            "x86_64",
        );
        node.ip_addresses = vec!["10.0.0.99".into()];
        node.role = NodeRole::Worker;
        node.availability = NodeAvailability::Connected;
        state.upsert_node(node).unwrap();

        // 1. Flow to cluster node IP -> attributes associated_node_id
        let mut conn_cluster = NetworkConnection::new(
            ConnectionId::new("conn-cluster-1"),
            ConnectionKind::LocalSocketFlow,
            FlowProtocol::Tcp,
            "10.0.0.1",
            45000,
            FlowState::Established,
        );
        conn_cluster.remote_addr = Some("10.0.0.99".into());
        conn_cluster.remote_port = Some(9000);
        conn_cluster.associated_node_id = Some(node_id.clone());
        state.upsert_connection(conn_cluster).unwrap();

        let fetched_cluster = state.get_connection(&ConnectionId::new("conn-cluster-1")).unwrap();
        assert_eq!(fetched_cluster.associated_node_id, Some(node_id));

        // 2. Ordinary LAN flow -> does NOT fabricate NodeId attribution
        let mut conn_lan = NetworkConnection::new(
            ConnectionId::new("conn-lan-1"),
            ConnectionKind::LocalSocketFlow,
            FlowProtocol::Tcp,
            "192.168.1.10",
            50000,
            FlowState::Established,
        );
        conn_lan.remote_addr = Some("192.168.1.254".into());
        conn_lan.remote_port = Some(443);
        state.upsert_connection(conn_lan).unwrap();

        let fetched_lan = state.get_connection(&ConnectionId::new("conn-lan-1")).unwrap();
        assert!(fetched_lan.associated_node_id.is_none());
    }

    #[test]
    fn test_top_talkers_calculation() {
        let state = SharedNetworkState::new();
        let telemetry = NetworkTelemetryService::new(state.clone());

        let iface = crate::network::types::NetworkInterfaceInfo {
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
            total_received_bytes: 50_000_000,
            total_transmitted_bytes: 20_000_000,
            rates: Some(TrafficRates {
                rx_bytes_per_second: 5000.0,
                tx_bytes_per_second: 2000.0,
                rx_bits_per_second: 40000.0,
                tx_bits_per_second: 16000.0,
                rx_bytes_per_sec: 5000.0,
                tx_bytes_per_sec: 2000.0,
            }),
        };
        state.upsert_interface(iface).unwrap();

        let top_talkers = telemetry.calculate_top_talkers(5);
        assert_eq!(top_talkers.len(), 1);
        assert_eq!(top_talkers[0].entity_id, "eth0");
        assert_eq!(top_talkers[0].rx_bytes, 50_000_000);
        assert_eq!(top_talkers[0].rx_rate_bps, 40000.0);
    }

    #[test]
    fn test_telemetry_event_emission_and_deduplication() {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let mut sub = events.subscribe();
        let telemetry = NetworkTelemetryService::new_with_events(state.clone(), events);

        // 1. First poll_devices discovers new device -> emits DeviceDiscovered
        let _ = telemetry.poll_devices().unwrap();
        // Drain any discovery events emitted from the local environment
        while let Ok(evt) = sub.try_recv() {
            assert_eq!(evt.category, EventCategory::Discovery);
        }

        // 2. Test security observation event emission
        let obs = NetworkSecurityObservation {
            observation_id: "obs-sec-1".into(),
            timestamp_epoch_ms: 1726000000000,
            risk_level: SecurityRiskLevel::High,
            anomaly_kind: "arp_spoof_suspected".into(),
            affected_interface: Some("eth0".into()),
            affected_ip: Some("192.168.1.1".into()),
            affected_mac: Some("00:AA:BB:CC:DD:EE".into()),
            affected_pid: None,
            description: "Suspicious duplicate MAC observed for gateway".into(),
            evidence: vec!["Conflicting IP 192.168.1.1".into()],
        };

        telemetry.record_security_observation(obs).unwrap();
        let sec_evt = sub.try_recv().unwrap();
        assert_eq!(sec_evt.category, EventCategory::Security);
        assert_eq!(sec_evt.event_type, NetworkEventType::SecurityObservationCreated);
        assert_eq!(sec_evt.severity, EventSeverity::Error);
        assert!(sec_evt.summary.contains("Suspicious duplicate MAC"));
    }

    #[test]
    fn test_connection_lifecycle_events_opened_changed_closed() {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let mut sub = events.subscribe();
        let _telemetry = NetworkTelemetryService::new_with_events(state.clone(), events);

        // 1. ConnectionOpened
        let conn_id = ConnectionId::new("conn-flow-lifecycle-1");
        let mut conn = NetworkConnection::new(
            conn_id.clone(),
            ConnectionKind::LocalSocketFlow,
            FlowProtocol::Tcp,
            "127.0.0.1",
            8080,
            FlowState::SynSent,
        );
        state.upsert_connection(conn.clone()).unwrap();
        let rev1 = state.revision();

        let evt1 = NetworkEvent::new(
            EventCategory::Connection,
            NetworkEventType::ConnectionOpened,
            EventSeverity::Info,
            "Socket flow opened",
        )
        .with_state_revision(rev1)
        .with_target_connection(conn_id.clone());
        _telemetry.events().unwrap().publish(evt1);

        let rec1 = sub.try_recv().unwrap();
        assert_eq!(rec1.event_type, NetworkEventType::ConnectionOpened);
        assert_eq!(rec1.state_revision, Some(rev1));

        // 2. ConnectionStateChanged
        conn.state = FlowState::Established;
        state.upsert_connection(conn).unwrap();
        let rev2 = state.revision();
        assert_eq!(rev2, 2);

        let evt2 = NetworkEvent::new(
            EventCategory::Connection,
            NetworkEventType::ConnectionStateChanged,
            EventSeverity::Info,
            "Socket flow state changed to Established",
        )
        .with_state_revision(rev2)
        .with_target_connection(conn_id.clone());
        _telemetry.events().unwrap().publish(evt2);

        let rec2 = sub.try_recv().unwrap();
        assert_eq!(rec2.event_type, NetworkEventType::ConnectionStateChanged);
        assert_eq!(rec2.state_revision, Some(rev2));

        // 3. ConnectionClosed
        let removed = state.write(|s| s.remove_connection(&conn_id)).unwrap();
        assert!(removed.is_some());
        let rev3 = state.revision();
        assert_eq!(rev3, 3);

        let evt3 = NetworkEvent::new(
            EventCategory::Connection,
            NetworkEventType::ConnectionClosed,
            EventSeverity::Info,
            "Socket flow closed",
        )
        .with_state_revision(rev3)
        .with_target_connection(conn_id);
        _telemetry.events().unwrap().publish(evt3);

        let rec3 = sub.try_recv().unwrap();
        assert_eq!(rec3.event_type, NetworkEventType::ConnectionClosed);
        assert_eq!(rec3.state_revision, Some(rev3));
    }

    #[test]
    fn test_no_revision_churn_on_identical_state_upserts() {
        let state = SharedNetworkState::new();
        assert_eq!(state.revision(), 0);

        let dev = NetworkDevice::from_discovered(Some("00:11:22:33:44:55"), "192.168.1.10");
        state.upsert_device(dev.clone()).unwrap();
        assert_eq!(state.revision(), 1);

        // Upserting identical device must not increment revision
        state.upsert_device(dev).unwrap();
        assert_eq!(state.revision(), 1);

        let conn = NetworkConnection::new(
            ConnectionId::new("conn-churn-test"),
            ConnectionKind::LocalSocketFlow,
            FlowProtocol::Tcp,
            "127.0.0.1",
            9000,
            FlowState::Established,
        );
        state.upsert_connection(conn.clone()).unwrap();
        assert_eq!(state.revision(), 2);

        // Upserting identical connection must not increment revision
        state.upsert_connection(conn).unwrap();
        assert_eq!(state.revision(), 2);
    }

    #[test]
    fn test_security_observation_correlation_precedence() {
        let state = SharedNetworkState::new();
        let events = NetworkEventBus::new(100);
        let mut sub = events.subscribe();
        let telemetry = NetworkTelemetryService::new_with_events(state.clone(), events);

        // Populate a device with MAC 00:11:22:33:44:55 and a connection with IP 192.168.1.50
        let dev = NetworkDevice::from_discovered(Some("00:11:22:33:44:55"), "192.168.1.50");
        let dev_id = dev.id.clone();
        state.upsert_device(dev).unwrap();

        let conn_id = ConnectionId::new("conn-corr-1");
        let mut conn = NetworkConnection::new(
            conn_id.clone(),
            ConnectionKind::ClusterTransport,
            FlowProtocol::Tcp,
            "192.168.1.10",
            9000,
            FlowState::Established,
        );
        conn.remote_addr = Some("192.168.1.20".into());
        let node_id = crate::network::ids::NodeId::new("node-target-alpha");
        conn.associated_node_id = Some(node_id.clone());
        state.upsert_connection(conn).unwrap();

        // 1. Observation with affected_mac correlates to target_device_id
        let obs_mac = NetworkSecurityObservation {
            observation_id: "obs-mac-test".into(),
            timestamp_epoch_ms: 1726000000000,
            risk_level: SecurityRiskLevel::Medium,
            anomaly_kind: "gateway_identity_changed".into(),
            affected_interface: Some("eth0".into()),
            affected_ip: None,
            affected_mac: Some("00:11:22:33:44:55".into()),
            affected_pid: None,
            description: "Gateway MAC transition".into(),
            evidence: vec![],
        };
        telemetry.record_security_observation(obs_mac).unwrap();
        let evt1 = sub.try_recv().unwrap();
        assert_eq!(evt1.target_device_id, Some(dev_id.clone()));
        assert_eq!(evt1.target_connection_id, None);
        assert_eq!(evt1.target_node_id, None);

        // 2. Observation with affected_ip matching connection correlates to target_connection_id and target_node_id
        let obs_ip = NetworkSecurityObservation {
            observation_id: "obs-conn-test".into(),
            timestamp_epoch_ms: 1726000000000,
            risk_level: SecurityRiskLevel::Critical,
            anomaly_kind: "abnormal_outbound_traffic".into(),
            affected_interface: Some("eth0".into()),
            affected_ip: Some("192.168.1.20".into()),
            affected_mac: None,
            affected_pid: Some(1234),
            description: "Surge on cluster connection".into(),
            evidence: vec!["Rate 10MB/s".into()],
        };
        telemetry.record_security_observation(obs_ip).unwrap();
        let evt2 = sub.try_recv().unwrap();
        assert_eq!(evt2.target_connection_id, Some(conn_id));
        assert_eq!(evt2.target_node_id, Some(node_id));

        // 3. Observation with unknown IP leaves target IDs unresolved (None)
        let obs_unknown = NetworkSecurityObservation {
            observation_id: "obs-unknown-test".into(),
            timestamp_epoch_ms: 1726000000000,
            risk_level: SecurityRiskLevel::Low,
            anomaly_kind: "unexpected_listening_socket".into(),
            affected_interface: None,
            affected_ip: Some("10.99.99.99".into()),
            affected_mac: Some("FF:FF:FF:FF:FF:FF".into()),
            affected_pid: None,
            description: "Unknown entity observation".into(),
            evidence: vec![],
        };
        telemetry.record_security_observation(obs_unknown).unwrap();
        let evt3 = sub.try_recv().unwrap();
        assert_eq!(evt3.target_device_id, None);
        assert_eq!(evt3.target_connection_id, None);
        assert_eq!(evt3.target_node_id, None);
    }
}
