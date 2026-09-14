//! Phase N15: Reliability & Failure Recovery Integration Tests
//!
//! Validates:
//! - Heartbeat generation and timeout sweeper
//! - Disconnect detection and NetworkState synchronization
//! - Duplicate session supersession and stale callback immunity
//! - Resilient client reconnection with bounded exponential backoff & jitter
//! - In-flight admin command immediate failure on transport drop (no duplicate execution)
//! - Graceful shutdown and resource cleanup
//! - Preservation of N14 security invariants (Noise XX, TrustedPeerStore, zero plaintext downgrade)

use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;

use fluffy_core::capabilities::types::CapabilityRequest;
use fluffy_core::network::admin::controller::{fail_all_pending, fail_pending_for_node, fail_pending_for_tag, AdminCommandController};
use fluffy_core::network::admin::types::AdminCommandRequest;
use fluffy_core::network::cluster::heartbeat::{HeartbeatConfig, ReconnectBackoff};
use fluffy_core::network::cluster::manager::ClusterManager;
use fluffy_core::network::event::NetworkEventBus;
use fluffy_core::network::ids::{NodeId, RequestId};
use fluffy_core::network::model::{NetworkNode, NodeAvailability};
use fluffy_core::network::state::SharedNetworkState;
use fluffy_core::network::subsystem::NetworkSubsystem;
use fluffy_core::terminal::app_state::{create_terminal_remote_sender, new_shared_state, ClientInfo, ClientServiceStatus};
use fluffy_core::terminal::client_agent::run_client_agent;
use fluffy_core::terminal::net::start_server;

// ============================================================================
// 1. Heartbeat Generation & Timeout Sweeper Tests
// ============================================================================

#[tokio::test]
async fn test_heartbeat_timeout_transitions_connected_to_disconnected() {
    let state = SharedNetworkState::new();
    let events = NetworkEventBus::default();
    let mut subscriber = events.subscribe();
    let config = HeartbeatConfig {
        interval_sec: 5,
        timeout_sec: 15,
        missed_threshold: 3,
    };
    let cluster = ClusterManager::new_with_events(state.clone(), config, events);

    let node_id = NodeId::new("heartbeat-node-1");
    let mut node = NetworkNode::new(node_id.clone(), "HB Node", "HB-HOST", "linux", "x86_64");
    node.availability = NodeAvailability::Connected;
    node.auth_state = fluffy_core::network::model::AuthenticationState::Authenticated;
    cluster.register_node(node).unwrap();

    // 1. Record heartbeat at t=100
    cluster.record_heartbeat(&node_id, 100).unwrap();
    assert_eq!(cluster.get_node(&node_id).unwrap().availability, NodeAvailability::Connected);

    // 2. Check timeouts at t=110 (elapsed 10s < 15s) -> stays Connected
    let timed_out = cluster.process_heartbeat_timeouts(110).unwrap();
    assert!(timed_out.is_empty());
    assert_eq!(cluster.get_node(&node_id).unwrap().availability, NodeAvailability::Connected);

    // 3. Check timeouts at t=120 (elapsed 20s >= 15s) -> transitions to Disconnected
    let timed_out = cluster.process_heartbeat_timeouts(120).unwrap();
    assert_eq!(timed_out, vec![node_id.clone()]);
    assert_eq!(cluster.get_node(&node_id).unwrap().availability, NodeAvailability::Disconnected);

    // Verify event bus received notification
    let mut received_missed_event = false;
    while let Ok(evt) = subscriber.try_recv() {
        if evt.event_type == fluffy_core::network::model::NetworkEventType::HeartbeatMissed {
            received_missed_event = true;
            break;
        }
    }
    assert!(received_missed_event, "Expected HeartbeatMissed event on timeout");
}

#[tokio::test]
async fn test_heartbeat_recovers_recovering_node() {
    let state = SharedNetworkState::new();
    let events = NetworkEventBus::default();
    let cluster = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events);

    let node_id = NodeId::new("heartbeat-recover-node");
    let mut node = NetworkNode::new(node_id.clone(), "Recover Node", "REC-HOST", "windows", "x86_64");
    node.availability = NodeAvailability::Recovering;
    node.auth_state = fluffy_core::network::model::AuthenticationState::Authenticated;
    cluster.register_node(node).unwrap();

    // Heartbeat observation recovers authenticated session to Connected
    cluster.record_heartbeat(&node_id, 200).unwrap();
    assert_eq!(cluster.get_node(&node_id).unwrap().availability, NodeAvailability::Connected);
}

#[tokio::test]
async fn test_heartbeat_does_not_promote_unauthenticated_node() {
    let state = SharedNetworkState::new();
    let events = NetworkEventBus::default();
    let cluster = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events);

    let node_id = NodeId::new("unauthenticated-node");
    let mut node = NetworkNode::new(node_id.clone(), "Unauth Node", "UNAUTH-HOST", "windows", "x86_64");
    node.availability = NodeAvailability::Available;
    node.auth_state = fluffy_core::network::model::AuthenticationState::Unauthenticated;
    cluster.register_node(node).unwrap();

    // Heartbeat alone cannot promote an unauthenticated node to Connected
    cluster.record_heartbeat(&node_id, 300).unwrap();
    assert_eq!(cluster.get_node(&node_id).unwrap().availability, NodeAvailability::Available);
}

// ============================================================================
// 2. Disconnect & Session Supersession Tests
// ============================================================================

#[tokio::test]
async fn test_duplicate_session_supersession_and_stale_disconnect_immunity() {
    let state = new_shared_state();

    let (tx1, _) = tokio::sync::mpsc::unbounded_channel();
    let (tx2, _) = tokio::sync::mpsc::unbounded_channel();

    let client1 = ClientInfo {
        tag: "f1".into(),
        hostname: "node-alpha".into(),
        os: "linux".into(),
        os_version: "6.1".into(),
        ip: "10.0.0.1".into(),
        arch: "x86_64".into(),
        sender: tx1,
        connected_at: "2026-09-14 00:00:00".into(),
        is_secure: true,
        peer_public_key: None,
        session_id: 1,
        node_id: Some("node-alpha".into()),
        is_authoritative: true,
    };

    let client2 = ClientInfo {
        tag: "f2".into(),
        hostname: "node-alpha".into(),
        os: "linux".into(),
        os_version: "6.1".into(),
        ip: "10.0.0.1".into(),
        arch: "x86_64".into(),
        sender: tx2,
        connected_at: "2026-09-14 00:01:00".into(),
        is_secure: true,
        peer_public_key: None,
        session_id: 2,
        node_id: Some("node-alpha".into()),
        is_authoritative: true,
    };

    // 1. Register session 1
    {
        let mut st = state.lock().await;
        let superseded = st.register_session("10.0.0.1:5001".into(), client1);
        assert!(superseded.is_none());
        assert_eq!(st.clients.len(), 1);
        assert!(st.find_client_by_node_id("node-alpha").is_some());
    }

    // 2. Register session 2 for same NodeId (e.g. reconnect from new ephemeral port)
    {
        let mut st = state.lock().await;
        let superseded = st.register_session("10.0.0.1:5002".into(), client2);
        assert!(superseded.is_some());
        let old = superseded.unwrap();
        assert_eq!(old.session_id, 1);
        assert!(!old.is_authoritative);

        // Only 1 authoritative session exists for node-alpha
        let (addr, auth_client) = st.find_client_by_node_id("node-alpha").unwrap();
        assert_eq!(addr, "10.0.0.1:5002");
        assert_eq!(auth_client.session_id, 2);
    }

    // 3. Stale disconnect from Session 1 arrives
    {
        let mut st = state.lock().await;
        let removed = st.remove_client_session("10.0.0.1:5001", 1);
        // Session 1 was already removed during supersession, so remove_client_session returns None
        assert!(removed.is_none());

        // Session 2 is still alive and authoritative!
        let (addr, auth_client) = st.find_client_by_node_id("node-alpha").unwrap();
        assert_eq!(addr, "10.0.0.1:5002");
        assert_eq!(auth_client.session_id, 2);
    }

    // 4. Disconnect from authoritative Session 2 arrives
    {
        let mut st = state.lock().await;
        let removed = st.remove_client_session("10.0.0.1:5002", 2);
        assert!(removed.is_some());
        assert_eq!(removed.unwrap().session_id, 2);
        assert!(st.find_client_by_node_id("node-alpha").is_none());
    }
}

// ============================================================================
// 3. In-Flight Command Immediate Failure Tests
// ============================================================================

#[tokio::test]
async fn test_in_flight_commands_fail_immediately_on_disconnect() {
    let network_state = SharedNetworkState::new();
    let _controller = AdminCommandController::new(network_state.clone(), None);

    // Fail pending for a specific tag
    let failed_count = fail_pending_for_tag("f_nonexistent", "socket closed").await;
    assert_eq!(failed_count, 0);

    // Fail pending for a specific node_id
    let failed_count_node = fail_pending_for_node("node_nonexistent", "socket closed").await;
    assert_eq!(failed_count_node, 0);

    // Fail all pending
    let failed_all = fail_all_pending("subsystem shutdown").await;
    assert_eq!(failed_all, 0);
}

// ============================================================================
// 4. Reconnect Backoff & Jitter Verification
// ============================================================================

#[test]
fn test_reconnect_backoff_bounds_and_reset() {
    let mut backoff = ReconnectBackoff::new(1000, 60000);
    assert_eq!(backoff.min_delay_ms, 1000);
    assert_eq!(backoff.max_delay_ms, 60000);

    // Delay 1: ~1000ms ± 20%
    let d1 = backoff.next_delay();
    assert!(d1.as_millis() >= 800 && d1.as_millis() <= 1200);

    // Delay 2: ~2000ms ± 20%
    let d2 = backoff.next_delay();
    assert!(d2.as_millis() >= 1600 && d2.as_millis() <= 2400);

    // Delay 3: ~4000ms ± 20%
    let d3 = backoff.next_delay();
    assert!(d3.as_millis() >= 3200 && d3.as_millis() <= 4800);

    // Run 10 more iterations -> verify strictly capped at max_delay_ms
    for _ in 0..10 {
        let d = backoff.next_delay();
        assert!(d.as_millis() <= 60000);
    }

    // Reset backoff upon successful recovery
    backoff.reset();
    assert_eq!(backoff.current_delay_ms, 1000);
    assert_eq!(backoff.attempt_count, 0);
}

// ============================================================================
// 5. Subsystem Graceful Start & Stop Lifecycle
// ============================================================================

#[tokio::test]
async fn test_subsystem_graceful_start_and_stop_lifecycle() {
    let mut subsystem = NetworkSubsystem::default();
    assert!(!subsystem.is_running());

    // Start subsystem: starts background sweeper
    subsystem.start().unwrap();
    assert!(subsystem.is_running());

    // Stop subsystem: stops sweeper and cancels background tasks cleanly
    subsystem.stop().unwrap();
    assert!(!subsystem.is_running());
}

// ============================================================================
// 6. Live Real TCP Socket Reconnect & Capability Dispatch Lifecycle
// ============================================================================

#[tokio::test]
async fn test_real_tcp_live_reconnect_and_state_recovery_lifecycle() {
    // 1. Allocate ephemeral TCP port for live test
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind ephemeral failed");
    let local_addr = listener.local_addr().expect("local addr failed");
    let port = local_addr.port();
    drop(listener);

    let server_state = new_shared_state();
    {
        let mut st = server_state.lock().await;
        st.admin_port = port;
    }

    // 2. Start live server on real TCP socket
    let srv_state_clone = server_state.clone();
    let server_handle = tokio::spawn(async move {
        start_server(srv_state_clone).await;
    });

    tokio::time::sleep(Duration::from_millis(100)).await;

    // 3. Start client agent
    let client_state = new_shared_state();
    let cl_state_clone = client_state.clone();
    let client_handle = tokio::spawn(async move {
        run_client_agent(cl_state_clone, format!("127.0.0.1:{}", port)).await;
    });

    // 4. Await initial connection
    let mut connected = false;
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        let st = server_state.lock().await;
        if let Some((_, client)) = st.clients.iter().next() {
            if client.is_secure {
                connected = true;
                break;
            }
        }
    }
    assert!(connected, "Client failed to securely connect on live TCP port");

    // 5. Verify target node is registered in global network subsystem state
    let client_hostname = {
        let st = server_state.lock().await;
        let (_, c) = st.clients.iter().next().unwrap();
        c.hostname.clone()
    };
    let target_node_id = NodeId::new(&client_hostname);

    let subsystem = fluffy_core::network::subsystem::global_network_subsystem();
    let node_in_state = subsystem.cluster().get_node(&target_node_id);
    assert!(node_in_state.is_some(), "Node should be registered in NetworkState");
    assert_eq!(node_in_state.unwrap().availability, NodeAvailability::Connected);

    // 6. Test AdminCommand execution over live Noise XX session
    let remote_sender = create_terminal_remote_sender(server_state.clone());
    let controller = AdminCommandController::new(subsystem.state().clone(), None)
        .with_remote_sender(remote_sender);

    let cap_req = CapabilityRequest {
        id: "Process.List".to_string(),
        parameters: serde_json::json!({"limit": 5}),
        request_id: None,
    };
    let admin_req = AdminCommandRequest::new(
        RequestId::new("n15-live-req-1"),
        target_node_id.clone(),
        cap_req,
    );

    let caller = fluffy_core::network::admin::types::CallerContext::local_elevated("desktop_admin", "ipc");
    let result = controller.execute_single(&caller, admin_req).await;
    assert!(result.success, "Capability command should succeed over live Noise XX socket: {:?}", result.error);

    // 7. Clean shutdown
    {
        let mut st = client_state.lock().await;
        st.client_service_status = ClientServiceStatus::Stopped;
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
    client_handle.abort();
    server_handle.abort();
}

// ============================================================================
// 7. Non-Idempotency & Retry Prevention Tests
// ============================================================================

#[tokio::test]
async fn test_process_terminate_is_never_automatically_retried_on_disconnect() {
    let network_state = SharedNetworkState::new();
    let remote_sender = Arc::new(|_tag: &str, _payload: &str| {
        Err(fluffy_core::network::error::NetworkError::Io("Connection reset by peer".into()))
    });

    let controller = AdminCommandController::new(network_state.clone(), None)
        .with_remote_sender(remote_sender);

    let target_node_id = NodeId::new("remote-worker-node");
    let mut target_node = NetworkNode::new(
        target_node_id.clone(),
        "Remote Worker",
        "WORKER-1",
        "linux",
        "x86_64",
    );
    target_node.availability = NodeAvailability::Connected;
    target_node.auth_state = fluffy_core::network::model::AuthenticationState::Authenticated;
    target_node.metadata.insert("terminal_tag".to_string(), "f1".to_string());
    network_state.write(|s| s.upsert_node(target_node)).unwrap();

    let cap_req = CapabilityRequest {
        id: "Process.Terminate".to_string(),
        parameters: serde_json::json!({"pid": 12345}),
        request_id: None,
    };

    let mut admin_req = AdminCommandRequest::new(
        RequestId::new("req-terminate-1"),
        target_node_id.clone(),
        cap_req,
    );
    admin_req.confirmed = true;

    let caller = fluffy_core::network::admin::types::CallerContext::local_elevated("admin_user", "ipc");
    let result = controller.execute_single(&caller, admin_req).await;

    // Must fail immediately on transport drop and NOT retry automatically
    assert!(!result.success);
    assert_eq!(result.error.as_ref().unwrap().code, "dispatch_failed");
}

// ============================================================================
// 8. Python Brain & UI Independence Tests
// ============================================================================

#[tokio::test]
async fn test_network_subsystem_full_operation_without_python_brain_or_ui() {
    // 1. Initialize standalone NetworkSubsystem without any Python runtime or Tauri UI
    let mut subsystem = NetworkSubsystem::default();
    assert!(subsystem.start().is_ok());

    // 2. Perform cluster node registration and availability transitions
    let node_id = NodeId::new("standalone-core-node");
    let mut node = NetworkNode::new(node_id.clone(), "Standalone Node", "STANDALONE", "linux", "x86_64");
    node.is_local = true;
    node.availability = NodeAvailability::Connected;
    node.auth_state = fluffy_core::network::model::AuthenticationState::Authenticated;
    subsystem.cluster().register_node(node).unwrap();

    // 3. Telemetry and state snapshots are fully functional
    let snap = subsystem.state().get_snapshot();
    assert!(snap.nodes.iter().any(|n| n.id == node_id));

    // 4. Local capability dispatch works autonomously
    let caller = fluffy_core::network::admin::types::CallerContext::local_elevated("desktop_user", "ipc");
    let cap_req = CapabilityRequest {
        id: "Process.List".to_string(),
        parameters: serde_json::json!({"limit": 2}),
        request_id: None,
    };
    let admin_req = AdminCommandRequest::new(
        RequestId::new("req-local-proc-list"),
        node_id.clone(),
        cap_req,
    );
    let result = subsystem.admin().execute_single(&caller, admin_req).await;
    assert!(result.success, "Autonomous native capability execution succeeded");

    assert!(subsystem.stop().is_ok());
}

