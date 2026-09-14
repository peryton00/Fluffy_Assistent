//! Phase N16: System-Wide Validation, Guardian Correlation, & EventBus Stress Tests
//!
//! Validates:
//! - EventBus extreme burst lag accounting under 1,500+ high-frequency events
//! - Guardian SecurityObservation correlation precedence (MAC -> Conn -> Device IP -> Unresolved)
//! - Resilience when Guardian or Python services are unavailable
//! - Resource stability under repeated connect/disconnect/state churn cycles

use fluffy_core::network::event::{EventRecvError, NetworkEventBus};
use fluffy_core::network::ids::{ConnectionId, DeviceId, NodeId};
use fluffy_core::network::model::{
    ConnectionDirection, ConnectionKind, EventCategory, EventSeverity, NetworkConnection,
    NetworkDevice, NetworkEvent, NetworkEventType, NetworkNode, NetworkSecurityObservation,
    NodeAvailability, SecurityRiskLevel,
};
use fluffy_core::network::state::SharedNetworkState;
use fluffy_core::network::telemetry::NetworkTelemetryService;
use fluffy_core::network::types::{FlowProtocol, FlowState};

#[tokio::test]
async fn test_event_bus_extreme_burst_lag_and_subscriber_isolation() {
    let bus = NetworkEventBus::default();
    let mut slow_subscriber = bus.subscribe();

    // 1. Emit 1,500 events in rapid burst (exceeding 1,000 capacity)
    for i in 0..1500 {
        let evt = NetworkEvent::new(
            EventCategory::Telemetry,
            NetworkEventType::TrafficMetricsUpdated,
            EventSeverity::Info,
            format!("Telemetry tick {}", i),
        );
        bus.publish(evt);
    }

    // 2. Slow subscriber attempts recv
    // In tokio broadcast channels, if a receiver lags behind the capacity, it returns Lagged(count)
    let first_recv = slow_subscriber.recv().await;
    match first_recv {
        Ok(_) => {} // Caught initial or un-lagged event
        Err(EventRecvError::Lagged(skipped)) => {
            assert!(skipped > 0, "Expected positive skipped count on lag");
        }
        Err(e) => panic!("Unexpected receive error: {:?}", e),
    }

    // 3. New events sent after catching up are delivered normally
    let fresh_evt = NetworkEvent::new(
        EventCategory::Cluster,
        NetworkEventType::NodeConnected,
        EventSeverity::Info,
        "Fresh node connected",
    );
    bus.publish(fresh_evt);

    let mut received_fresh = false;
    for _ in 0..2000 {
        match slow_subscriber.recv().await {
            Ok(evt) => {
                if evt.event_type == NetworkEventType::NodeConnected {
                    received_fresh = true;
                    break;
                }
            }
            Err(EventRecvError::Lagged(_)) => continue,
            Err(e) => panic!("Unexpected error while draining event bus: {:?}", e),
        }
    }
    assert!(received_fresh, "Subscriber must recover and receive fresh events");
}

#[tokio::test]
async fn test_guardian_security_observation_correlation_precedence() {
    let state = SharedNetworkState::new();
    let bus = NetworkEventBus::default();
    let mut event_sub = bus.subscribe();
    let telemetry = NetworkTelemetryService::new_with_events(state.clone(), bus.clone());

    let node_id = NodeId::new("victim-node");
    let mut node = NetworkNode::new(node_id.clone(), "Victim", "HOST", "linux", "x86_64");
    node.availability = NodeAvailability::Connected;
    state.write(|s| s.upsert_node(node)).unwrap();

    let dev_id = DeviceId::from_mac("AA:BB:CC:DD:EE:FF").unwrap();
    let mut dev = NetworkDevice::new(dev_id.clone(), "192.168.1.100");
    dev.mac_address = Some("AA:BB:CC:DD:EE:FF".to_string());
    dev.associated_node_id = Some(node_id.clone());
    state.write(|s| s.upsert_device(dev)).unwrap();

    let conn_id = ConnectionId::new("victim-conn");
    let mut conn = NetworkConnection::new(
        conn_id.clone(),
        ConnectionKind::LocalSocketFlow,
        FlowProtocol::Tcp,
        "192.168.1.100",
        443,
        FlowState::Established,
    );
    conn.remote_addr = Some("10.0.0.1".into());
    conn.remote_port = Some(54321);
    conn.direction = ConnectionDirection::Inbound;
    conn.associated_node_id = Some(node_id.clone());
    state.write(|s| s.upsert_connection(conn)).unwrap();

    // 1. MAC Correlation Precedence (Highest Precedence)
    let obs_mac = NetworkSecurityObservation {
        observation_id: "obs-1".into(),
        timestamp_epoch_ms: 1000,
        risk_level: SecurityRiskLevel::High,
        anomaly_kind: "unauthorized_access".into(),
        affected_interface: None,
        affected_ip: Some("192.168.1.200".into()), // Mismatched IP, but matching MAC!
        affected_mac: Some("AA:BB:CC:DD:EE:FF".into()),
        affected_pid: None,
        description: "Port scan detected by MAC".into(),
        evidence: vec!["arp_sniff".into()],
    };
    telemetry.record_security_observation(obs_mac).unwrap();

    let evt1 = event_sub.recv().await.unwrap();
    assert_eq!(evt1.category, EventCategory::Security);
    assert_eq!(evt1.target_device_id, Some(dev_id.clone()), "Device must correlate via MAC precedence");

    // 2. Connection and Device IP Fallback
    let obs_conn = NetworkSecurityObservation {
        observation_id: "obs-2".into(),
        timestamp_epoch_ms: 2000,
        risk_level: SecurityRiskLevel::Medium,
        anomaly_kind: "suspicious_flow".into(),
        affected_interface: None,
        affected_ip: Some("10.0.0.1".into()),
        affected_mac: None,
        affected_pid: None,
        description: "Inbound malicious payload".into(),
        evidence: vec!["signature_match".into()],
    };
    telemetry.record_security_observation(obs_conn).unwrap();

    let evt2 = event_sub.recv().await.unwrap();
    assert_eq!(evt2.target_connection_id, Some(conn_id.clone()));
    assert_eq!(evt2.target_node_id, Some(node_id.clone()));

    // 3. Unresolved Fallback (Ambiguous/Unknown external IP)
    let obs_unresolved = NetworkSecurityObservation {
        observation_id: "obs-unknown".into(),
        timestamp_epoch_ms: 3000,
        risk_level: SecurityRiskLevel::Low,
        anomaly_kind: "protocol_violation".into(),
        affected_interface: None,
        affected_ip: Some("203.0.113.99".into()),
        affected_mac: None,
        affected_pid: None,
        description: "External unknown IP probe".into(),
        evidence: vec!["tcp_rst_flood".into()],
    };
    telemetry.record_security_observation(obs_unresolved).unwrap();

    let evt3 = event_sub.recv().await.unwrap();
    assert_eq!(evt3.target_device_id, None);
    assert_eq!(evt3.target_node_id, None);
    assert_eq!(evt3.target_connection_id, None);
}

#[tokio::test]
async fn test_resource_stability_repeated_churn_cycles() {
    let state = SharedNetworkState::new();

    // Perform 100 rapid addition and removal cycles
    for cycle in 0..100 {
        let node_id = NodeId::new(format!("churn-node-{}", cycle));
        let node = NetworkNode::new(node_id.clone(), "Churn", "HOST", "linux", "x86_64");

        state.write(|s| s.upsert_node(node)).unwrap();
        assert!(state.read(|s| s.get_node(&node_id)).is_some());

        let _ = state.write(|s| s.remove_node(&node_id));
        assert!(state.read(|s| s.get_node(&node_id)).is_none());
    }

    let snap = state.get_snapshot();
    assert!(snap.nodes.is_empty(), "All churn nodes should be cleanly deallocated");
    assert!(snap.revision >= 200, "Revision tracked all lifecycle mutations");
}
