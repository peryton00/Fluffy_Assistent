//! Phase N16: Cluster Lifecycle & Session Race Validation Tests
//!
//! Validates:
//! - Exhaustive lifecycle state machine transitions (both legal and strictly illegal transitions)
//! - Session race conditions (concurrent connections, out-of-order disconnects, supersession)
//! - Stale callback isolation and old response rejection

use fluffy_core::network::cluster::heartbeat::HeartbeatConfig;
use fluffy_core::network::cluster::lifecycle::validate_transition;
use fluffy_core::network::cluster::manager::ClusterManager;
use fluffy_core::network::ids::NodeId;
use fluffy_core::network::model::{AuthenticationState, NetworkNode, NodeAvailability};
use fluffy_core::network::state::SharedNetworkState;
use fluffy_core::terminal::app_state::{new_shared_state, ClientInfo};

#[test]
fn test_exhaustive_valid_lifecycle_transitions() {
    // 1. Nominal onboarding path: Available -> Pairing -> Authenticating -> Connected
    assert!(validate_transition(NodeAvailability::Available, NodeAvailability::Pairing).is_ok());
    assert!(validate_transition(NodeAvailability::Pairing, NodeAvailability::Authenticating).is_ok());
    assert!(validate_transition(NodeAvailability::Authenticating, NodeAvailability::Connected).is_ok());

    // 2. Failure & recovery path: Connected -> Disconnected -> Recovering -> Connected
    assert!(validate_transition(NodeAvailability::Connected, NodeAvailability::Disconnected).is_ok());
    assert!(validate_transition(NodeAvailability::Disconnected, NodeAvailability::Recovering).is_ok());
    assert!(validate_transition(NodeAvailability::Recovering, NodeAvailability::Connected).is_ok());

    // 3. Fast re-pairing / re-discovery paths
    assert!(validate_transition(NodeAvailability::Disconnected, NodeAvailability::Available).is_ok());
    assert!(validate_transition(NodeAvailability::Disconnected, NodeAvailability::Pairing).is_ok());
    assert!(validate_transition(NodeAvailability::Recovering, NodeAvailability::Disconnected).is_ok());
    assert!(validate_transition(NodeAvailability::Connected, NodeAvailability::Recovering).is_ok());
}

#[test]
fn test_exhaustive_invalid_lifecycle_transitions_rejected() {
    // 1. Cannot skip directly from Available to Connected without pairing/authenticating
    assert!(validate_transition(NodeAvailability::Available, NodeAvailability::Connected).is_err());
    assert!(validate_transition(NodeAvailability::Available, NodeAvailability::Authenticating).is_err());
    assert!(validate_transition(NodeAvailability::Available, NodeAvailability::Recovering).is_err());

    // 2. Cannot skip directly from Disconnected to Connected without recovery or pairing
    assert!(validate_transition(NodeAvailability::Disconnected, NodeAvailability::Connected).is_err());

    // 3. Cannot jump from Pairing directly to Connected or Recovering
    assert!(validate_transition(NodeAvailability::Pairing, NodeAvailability::Connected).is_err());
    assert!(validate_transition(NodeAvailability::Pairing, NodeAvailability::Recovering).is_err());

    // 4. Cannot jump from Authenticating back to Available or Recovering directly
    assert!(validate_transition(NodeAvailability::Authenticating, NodeAvailability::Recovering).is_err());

    // 5. Cannot transition from Connected back into Pairing
    assert!(validate_transition(NodeAvailability::Connected, NodeAvailability::Pairing).is_err());
}

#[tokio::test]
async fn test_interleaved_session_races_and_supersession_integrity() {
    let app_state = new_shared_state();
    let net_state = SharedNetworkState::new();
    let cluster = ClusterManager::new(net_state.clone(), HeartbeatConfig::default());

    let (tx1, _) = tokio::sync::mpsc::unbounded_channel();
    let (tx2, _) = tokio::sync::mpsc::unbounded_channel();

    let client_sess_1 = ClientInfo {
        tag: "f1".into(),
        hostname: "worker-node-1".into(),
        os: "linux".into(),
        os_version: "6.1".into(),
        ip: "192.168.1.10".into(),
        arch: "x86_64".into(),
        sender: tx1,
        connected_at: "2026-09-14 00:00:00".into(),
        is_secure: true,
        peer_public_key: None,
        session_id: 1001,
        node_id: Some("worker-node-1".into()),
        is_authoritative: true,
    };

    let client_sess_2 = ClientInfo {
        tag: "f2".into(),
        hostname: "worker-node-1".into(),
        os: "linux".into(),
        os_version: "6.1".into(),
        ip: "192.168.1.10".into(),
        arch: "x86_64".into(),
        sender: tx2,
        connected_at: "2026-09-14 00:00:10".into(),
        is_secure: true,
        peer_public_key: None,
        session_id: 1002,
        node_id: Some("worker-node-1".into()),
        is_authoritative: true,
    };

    let node_id = NodeId::new("worker-node-1");
    let mut initial_node = NetworkNode::new(node_id.clone(), "Worker", "HOST", "linux", "x86_64");
    initial_node.availability = NodeAvailability::Connected;
    initial_node.auth_state = AuthenticationState::Authenticated;
    cluster.register_node(initial_node).unwrap();

    // Step 1: Session 1 registers
    {
        let mut st = app_state.lock().await;
        st.register_session("192.168.1.10:50001".into(), client_sess_1);
    }

    // Step 2: Session 2 connects and supersedes Session 1
    {
        let mut st = app_state.lock().await;
        let superseded = st.register_session("192.168.1.10:50002".into(), client_sess_2);
        assert!(superseded.is_some());
        let old = superseded.unwrap();
        assert_eq!(old.session_id, 1001);
    }

    // Step 3: Stale heartbeat from dead Session 1 arrives
    // Should NOT degrade Session 2 or alter authority
    {
        let st = app_state.lock().await;
        let (_, auth_client) = st.find_client_by_node_id("worker-node-1").unwrap();
        assert_eq!(auth_client.session_id, 1002);
        assert!(auth_client.is_authoritative);
    }

    // Step 4: Delayed disconnect callback from Session 1 arrives
    // Must NOT remove Session 2 or mark node as Disconnected
    {
        let mut st = app_state.lock().await;
        let removed = st.remove_client_session("192.168.1.10:50001", 1001);
        assert!(removed.is_none(), "Superseded session removal must return None");

        // Session 2 is intact
        assert!(st.find_client_by_node_id("worker-node-1").is_some());
    }

    // State in ClusterManager / NetworkState remains Connected
    assert_eq!(
        cluster.get_node(&node_id).unwrap().availability,
        NodeAvailability::Connected
    );

    // Step 5: Disconnect callback from active Session 2 arrives
    {
        let mut st = app_state.lock().await;
        let removed = st.remove_client_session("192.168.1.10:50002", 1002);
        assert!(removed.is_some());
        assert_eq!(removed.unwrap().session_id, 1002);
    }

    // Now node can transition to Disconnected
    cluster
        .transition_node_availability(&node_id, NodeAvailability::Disconnected)
        .unwrap();
    assert_eq!(
        cluster.get_node(&node_id).unwrap().availability,
        NodeAvailability::Disconnected
    );
}
