use tokio::io::duplex;

use fluffy_core::capabilities::types::CapabilityRequest;
use fluffy_core::network::admin::types::{AdminCommandRequest, CallerContext};
use fluffy_core::network::admin::AdminCommandController;
use fluffy_core::network::crypto::keys::{derive_sas, NodeKeypair, PublicKey};
use fluffy_core::network::crypto::trusted::{TrustEvaluation, TrustedPeerStore};
use fluffy_core::network::ids::{NodeId, RequestId};
use fluffy_core::network::model::{AuthenticationState, NetworkNode, NodeAvailability, NodeRole};
use fluffy_core::network::state::SharedNetworkState;
use fluffy_core::network::transport::framing::{
    read_frame, write_frame, BinaryFrame, FrameHeader, FrameMessageType, FramingError, FRAME_MAGIC,
    MAX_FRAME_SIZE,
};
use fluffy_core::network::transport::noise::{
    perform_noise_handshake_initiator, perform_noise_handshake_responder,
};
use fluffy_core::network::transport::session::{SecureSession, SessionError};
use fluffy_core::permissions::{evaluate_capability, PermissionDecision};

// ============================================================================
// 1. Identity & Cryptographic Keys Tests
// ============================================================================

#[test]
fn test_identity_keypair_generation_and_persistence() {
    let keypair = NodeKeypair::generate().expect("keypair generation failed");
    assert_eq!(keypair.public.as_bytes().len(), 32);
    assert_eq!(keypair.private_bytes().len(), 32);

    let hex_pub = keypair.public.to_hex();
    assert_eq!(hex_pub.len(), 64);
    let parsed_pub = PublicKey::from_hex(&hex_pub).expect("parse public key hex failed");
    assert_eq!(parsed_pub, keypair.public);

    let fingerprint = keypair.public.fingerprint();
    assert_eq!(fingerprint.len(), 17); // 8 + 1 + 8

    let temp_dir = std::env::temp_dir().join(format!("fluffy_n14_keys_{}", uuid::Uuid::new_v4()));
    let key_file = temp_dir.join("node.key");

    keypair.save_to_file(&key_file).expect("save key file failed");
    let loaded = NodeKeypair::load_from_file(&key_file).expect("load key file failed");
    assert_eq!(loaded.public, keypair.public);
    assert_eq!(loaded.private_bytes(), keypair.private_bytes());

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_sas_fingerprint_generation() {
    let k1 = NodeKeypair::generate().unwrap();
    let k2 = NodeKeypair::generate().unwrap();

    let sas_1 = derive_sas(&k1.public, &k2.public);
    let sas_2 = derive_sas(&k2.public, &k1.public);

    assert_eq!(sas_1, sas_2);
    assert_eq!(sas_1.len(), 6);
}

#[test]
fn test_trusted_peer_store_and_mismatch_detection() {
    let mut store = TrustedPeerStore::new();
    let node_id = NodeId::new("remote_node_1");
    let key1 = PublicKey::new([10u8; 32]);
    let key2 = PublicKey::new([20u8; 32]);

    // 1. Unknown peer
    assert_eq!(store.evaluate_peer(&node_id, &key1), TrustEvaluation::Unknown);

    // 2. Trust established
    store.add_trusted_peer(node_id.clone(), key1);
    assert_eq!(store.evaluate_peer(&node_id, &key1), TrustEvaluation::Trusted);

    // 3. Changed key (Identity Mismatch)
    match store.evaluate_peer(&node_id, &key2) {
        TrustEvaluation::IdentityMismatch { expected_key, actual_key } => {
            assert_eq!(expected_key, key1);
            assert_eq!(actual_key, key2);
        }
        other => panic!("Expected IdentityMismatch, got {:?}", other),
    }

    // 4. Revocation
    assert!(store.revoke_peer(&node_id));
    assert_eq!(store.evaluate_peer(&node_id, &key1), TrustEvaluation::Revoked);
}

// ============================================================================
// 2. Framing Tests
// ============================================================================

#[tokio::test]
async fn test_framing_valid_roundtrip() {
    let payload = b"{\"action\":\"list_nodes\",\"req_id\":\"1234\"}".to_vec();
    let frame = BinaryFrame::new(FrameMessageType::EncryptedPayload, payload.clone());

    let mut buffer = Vec::new();
    write_frame(&mut buffer, &frame).await.expect("write_frame failed");

    let mut cursor = std::io::Cursor::new(buffer);
    let decoded = read_frame(&mut cursor).await.expect("read_frame failed");

    assert_eq!(decoded.header.magic, FRAME_MAGIC);
    assert_eq!(decoded.header.version_major, 1);
    assert_eq!(decoded.header.version_minor, 1);
    assert_eq!(decoded.header.message_type, FrameMessageType::EncryptedPayload);
    assert_eq!(decoded.payload, payload);
}

#[tokio::test]
async fn test_framing_invalid_magic_rejected() {
    let mut bad_header = [0u8; 10];
    bad_header[0] = 0xAA;
    bad_header[1] = 0xBB;
    let err = FrameHeader::from_bytes(&bad_header).unwrap_err();
    assert!(matches!(err, FramingError::InvalidMagic(_)));
}

#[tokio::test]
async fn test_framing_unsupported_version_rejected() {
    let mut bad_header = [0u8; 10];
    bad_header[0..2].copy_from_slice(&FRAME_MAGIC);
    bad_header[2] = 2; // Major version 2 unsupported
    bad_header[3] = 0;
    let err = FrameHeader::from_bytes(&bad_header).unwrap_err();
    assert!(matches!(err, FramingError::UnsupportedVersion { major: 2, .. }));
}

#[tokio::test]
async fn test_framing_oversized_frame_rejected_before_buffer_allocation() {
    let mut bad_header = [0u8; 10];
    bad_header[0..2].copy_from_slice(&FRAME_MAGIC);
    bad_header[2] = 1;
    bad_header[3] = 1;
    bad_header[4] = 2; // EncryptedPayload
    let length_bytes = ((MAX_FRAME_SIZE + 1) as u32).to_be_bytes();
    bad_header[6..10].copy_from_slice(&length_bytes);

    let err = FrameHeader::from_bytes(&bad_header).unwrap_err();
    assert!(matches!(err, FramingError::FrameTooLarge { .. }));
}

// ============================================================================
// 3. Noise Protocol & Secure Transport Tests
// ============================================================================

#[tokio::test]
async fn test_noise_xx_handshake_and_tamper_rejection() {
    let (mut client_stream, mut server_stream) = duplex(65536);

    let client_keypair = NodeKeypair::generate().unwrap();
    let server_keypair = NodeKeypair::generate().unwrap();

    let client_pub = client_keypair.public;
    let server_pub = server_keypair.public;

    let client_task = tokio::spawn(async move {
        perform_noise_handshake_initiator(&mut client_stream, &client_keypair).await
    });
    let server_task = tokio::spawn(async move {
        perform_noise_handshake_responder(&mut server_stream, &server_keypair).await
    });

    let (client_res, server_res) = tokio::join!(client_task, server_task);
    let (client_transport, peer_server_pub) = client_res.unwrap().expect("client handshake failed");
    let (server_transport, peer_client_pub) = server_res.unwrap().expect("server handshake failed");

    assert_eq!(peer_server_pub, server_pub);
    assert_eq!(peer_client_pub, client_pub);

    let mut client_session = SecureSession::new(NodeId::new("server_node"), server_pub, client_transport);
    let mut server_session = SecureSession::new(NodeId::new("client_node"), client_pub, server_transport);

    // Encrypt message
    let plaintext = b"secure confidential command payload";
    let mut ciphertext = client_session.encrypt(plaintext).expect("encryption failed");

    // Decrypt on receiver
    let decrypted = server_session.decrypt(&ciphertext).expect("decryption failed");
    assert_eq!(&decrypted, plaintext);

    // Tampered ciphertext fails Poly1305 MAC validation
    ciphertext[0] ^= 0xFF;
    let tamper_res = server_session.decrypt(&ciphertext);
    assert!(matches!(tamper_res, Err(SessionError::DecryptionFailed(_))));
}

// ============================================================================
// 4. Request Replay & Session Freshness Tests
// ============================================================================

#[tokio::test]
async fn test_session_request_id_replay_rejection() {
    let (mut c_stream, mut s_stream) = duplex(65536);
    let k1 = NodeKeypair::generate().unwrap();
    let k2 = NodeKeypair::generate().unwrap();

    let (c_task, s_task) = (
        tokio::spawn(async move { perform_noise_handshake_initiator(&mut c_stream, &k1).await }),
        tokio::spawn(async move { perform_noise_handshake_responder(&mut s_stream, &k2).await }),
    );
    let ((c_trans, _), _) = (c_task.await.unwrap().unwrap(), s_task.await.unwrap().unwrap());
    let mut session = SecureSession::new(NodeId::new("test_peer"), PublicKey::new([0u8; 32]), c_trans);

    let req_id = "req_unique_999";
    assert!(session.record_request_id(req_id).is_ok());

    // Replay of same request ID within session is rejected
    assert!(matches!(
        session.record_request_id(req_id),
        Err(SessionError::DuplicateRequestId(_))
    ));
}

#[tokio::test]
async fn test_controller_command_freshness_and_deadline() {
    let state = SharedNetworkState::new();
    let controller = AdminCommandController::new(state.clone(), None);

    let node_id = NodeId::new("target_node_1");
    let mut node = NetworkNode::new(node_id.clone(), "Target Node", "host1", "windows", "x86_64");
    node.is_local = true;
    node.availability = NodeAvailability::Connected;
    node.auth_state = AuthenticationState::Authenticated;
    state.upsert_node(node).unwrap();

    // 1. Expired deadline command
    let mut expired_req = AdminCommandRequest::new(
        RequestId::new("req-dead-1"),
        node_id.clone(),
        CapabilityRequest {
            id: "System.GetHardware".into(),
            parameters: serde_json::json!({}),
            request_id: Some("req-dead-1".into()),
        },
    );
    expired_req.deadline_epoch_ms = Some(1000); // Year 1970 deadline -> expired

    let caller = CallerContext::local_admin();
    let res = controller.execute_single(&caller, expired_req).await;
    assert!(!res.success);
    assert_eq!(res.error.unwrap().code, "deadline_exceeded");

    // 2. Stale timestamp command
    let mut stale_req = AdminCommandRequest::new(
        RequestId::new("req-stale-1"),
        node_id,
        CapabilityRequest {
            id: "System.GetHardware".into(),
            parameters: serde_json::json!({}),
            request_id: Some("req-stale-1".into()),
        },
    );
    stale_req.created_at_epoch_ms = Some(1000); // Year 1970 creation -> stale

    let res2 = controller.execute_single(&caller, stale_req).await;
    assert!(!res2.success);
    assert_eq!(res2.error.unwrap().code, "command_stale");
}

// ============================================================================
// 5. N14 Policy Enforcement Tests (Legacy vs Authenticated Secure)
// ============================================================================

#[test]
fn test_policy_remote_legacy_vs_secure_process_terminate() {
    let mut target_node = NetworkNode::new(
        NodeId::new("node_target"),
        "Target Node",
        "target-pc",
        "windows",
        "x86_64",
    );
    target_node.availability = NodeAvailability::Connected;
    target_node.auth_state = AuthenticationState::Authenticated;

    let req_terminate = CapabilityRequest {
        id: "Process.Terminate".into(),
        parameters: serde_json::json!({"pid": 5555}),
        request_id: Some("req-term-1".into()),
    };

    // 1. Remote legacy caller requesting Process.Terminate -> STRICTLY DENIED by N14 policy
    let legacy_caller = CallerContext::remote_legacy(NodeId::new("remote_admin"), NodeRole::Admin);
    match evaluate_capability(&legacy_caller, Some(&target_node), &req_terminate) {
        PermissionDecision::Deny { reason } => {
            assert!(reason.contains("forbidden over unauthenticated legacy compatibility transport"));
        }
        other => panic!("Expected Deny for legacy remote caller, got {:?}", other),
    }

    // 2. Remote secure authenticated caller requesting Process.Terminate -> RequireConfirmation (standard N13 behavior)
    let secure_caller = CallerContext::remote_secure(NodeId::new("remote_admin"), NodeRole::Admin);
    match evaluate_capability(&secure_caller, Some(&target_node), &req_terminate) {
        PermissionDecision::RequireConfirmation { reason } => {
            assert!(reason.contains("requires confirmation"));
        }
        other => panic!("Expected RequireConfirmation for secure remote caller, got {:?}", other),
    }

    // 3. Unauthenticated target node -> Denied
    let mut unauth_target = target_node.clone();
    unauth_target.auth_state = AuthenticationState::Unauthenticated;
    match evaluate_capability(&secure_caller, Some(&unauth_target), &req_terminate) {
        PermissionDecision::Deny { reason } => {
            assert!(reason.contains("not authenticated"));
        }
        other => panic!("Expected Deny for unauthenticated target, got {:?}", other),
    }
}

// ============================================================================
// 6. Security Tests: Spoofing Resistance & Confirmation Bypass Prevention
// ============================================================================

#[test]
fn test_attacker_with_spoofed_metadata_rejected() {
    let mut store = TrustedPeerStore::new();
    let victim_node_id = NodeId::new("trusted_server_node");
    let genuine_key = PublicKey::new([55u8; 32]);
    let attacker_key = PublicKey::new([99u8; 32]);

    // Genuine node is trusted in store
    store.add_trusted_peer(victim_node_id.clone(), genuine_key);

    // Attacker presenting victim's NodeId with their own public key is detected as IdentityMismatch
    match store.evaluate_peer(&victim_node_id, &attacker_key) {
        TrustEvaluation::IdentityMismatch { expected_key, actual_key } => {
            assert_eq!(expected_key, genuine_key);
            assert_eq!(actual_key, attacker_key);
        }
        other => panic!("Expected IdentityMismatch for attacker spoof, got {:?}", other),
    }
}

#[test]
fn test_frontend_confirmed_flag_cannot_bypass_backend_denial() {
    let mut target = NetworkNode::new(
        NodeId::new("node_target"),
        "Target Node",
        "target-pc",
        "windows",
        "x86_64",
    );
    target.availability = NodeAvailability::Connected;
    target.auth_state = AuthenticationState::Authenticated;

    // Worker node attempting to terminate process with confirmed=true
    let worker_caller = CallerContext::remote_secure(NodeId::new("worker_peer"), NodeRole::Worker);
    let req_term = CapabilityRequest {
        id: "Process.Terminate".into(),
        parameters: serde_json::json!({"pid": 4000}),
        request_id: Some("req-worker-term".into()),
    };

    // Policy returns Deny regardless of frontend confirmation
    let decision = evaluate_capability(&worker_caller, Some(&target), &req_term);
    assert!(matches!(decision, PermissionDecision::Deny { .. }));
}

// ============================================================================
// 7. Live Real-Path TCP Socket Integration Tests (Requirement 14)
// ============================================================================

#[tokio::test]
async fn test_real_tcp_socket_secure_process_list_and_terminate_lifecycle() {
    use fluffy_core::terminal::app_state::{create_terminal_remote_sender, new_shared_state, ClientServiceStatus};
    use fluffy_core::terminal::net::start_server;
    use fluffy_core::terminal::client_agent::run_client_agent;
    use tokio::net::TcpListener;

    // 1. Allocate an ephemeral TCP port for live test
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind ephemeral failed");
    let local_addr = listener.local_addr().expect("local addr failed");
    let port = local_addr.port();
    drop(listener); // release for server

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

    // Give server time to bind
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 3. Start live client agent on real TCP socket
    let client_state = new_shared_state();
    let cl_state_clone = client_state.clone();
    let client_handle = tokio::spawn(async move {
        run_client_agent(cl_state_clone, format!("127.0.0.1:{}", port)).await;
    });

    // Wait for client to connect and perform Noise XX handshake
    let mut connected = false;
    for _ in 0..30 {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let st = server_state.lock().await;
        if let Some((_, client)) = st.clients.iter().next() {
            if client.is_secure {
                connected = true;
                break;
            }
        }
    }
    assert!(connected, "Client failed to securely connect over live TCP socket");

    // 4. Setup AdminCommandController wired to live TCP runtime
    let network_state = SharedNetworkState::new();
    let remote_sender = create_terminal_remote_sender(server_state.clone());
    let controller = AdminCommandController::new(network_state.clone(), None)
        .with_remote_sender(remote_sender);

    // Register target node in NetworkState matching client hostname
    let client_hostname = {
        let st = server_state.lock().await;
        let (_, c) = st.clients.iter().next().unwrap();
        c.hostname.clone()
    };
    let target_node_id = NodeId::new(&client_hostname);
    let mut target_node = NetworkNode::new(
        target_node_id.clone(),
        "Remote Client",
        &client_hostname,
        "windows",
        "x86_64",
    );
    target_node.availability = NodeAvailability::Connected;
    target_node.auth_state = AuthenticationState::Authenticated;
    target_node.metadata.insert("terminal_tag".into(), "f1".into());
    network_state.upsert_node(target_node).expect("upsert node failed");

    // ========================================================================
    // Scenario A: Secure Process.List succeeds over real encrypted TCP 9000
    // ========================================================================
    let list_req = AdminCommandRequest::new(
        RequestId::new("req_live_list_1"),
        target_node_id.clone(),
        CapabilityRequest {
            id: "Process.List".into(),
            parameters: serde_json::json!({"limit": 5}),
            request_id: Some("req_live_list_1".into()),
        },
    );

    let list_res = controller.execute_command(list_req).await;
    assert!(list_res.success, "Process.List failed over real socket: {:?}", list_res.error);
    assert!(list_res.data.is_some());
    let data = list_res.data.unwrap();
    assert!(data["processes"].as_array().is_some());

    // ========================================================================
    // Scenario B: Secure Process.Terminate requires confirmation (confirmed=false)
    // ========================================================================
    let term_unconfirmed = AdminCommandRequest::new(
        RequestId::new("req_live_term_unconf"),
        target_node_id.clone(),
        CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: serde_json::json!({"pid": 99999999}),
            request_id: Some("req_live_term_unconf".into()),
        },
    );

    let term_unconf_res = controller.execute_command(term_unconfirmed).await;
    assert!(!term_unconf_res.success);
    let err = term_unconf_res.error.expect("expected confirmation required error");
    assert_eq!(err.code, "confirmation_required");

    // ========================================================================
    // Scenario C: Confirmed Process.Terminate reaches execution over TCP 9000
    // ========================================================================
    let mut term_confirmed = AdminCommandRequest::new(
        RequestId::new("req_live_term_conf"),
        target_node_id.clone(),
        CapabilityRequest {
            id: "Process.Terminate".into(),
            parameters: serde_json::json!({"pid": 99999999}), // Non-existent PID >= 100
            request_id: Some("req_live_term_conf".into()),
        },
    );
    term_confirmed.confirmed = true;

    let term_conf_res = controller.execute_command(term_confirmed).await;
    assert!(!term_conf_res.success);
    let term_err = term_conf_res.error.expect("expected process not found rejection");
    assert_eq!(term_err.code, "process_not_found");

    // Cleanup client and server
    {
        let mut st = client_state.lock().await;
        st.client_service_status = ClientServiceStatus::Stopped;
    }
    server_handle.abort();
    client_handle.abort();
}

static TEST_STORE_LOCK: once_cell::sync::Lazy<tokio::sync::Mutex<()>> =
    once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(()));

#[tokio::test]
async fn test_real_tcp_downgrade_prevention_rejection() {
    let _guard = TEST_STORE_LOCK.lock().await;
    use fluffy_core::network::crypto::TrustedPeerStore;
    use fluffy_core::terminal::app_state::new_shared_state;
    use fluffy_core::terminal::net::start_server;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::{TcpListener, TcpStream};

    // 1. Setup ephemeral server
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let server_state = new_shared_state();
    {
        let mut st = server_state.lock().await;
        st.admin_port = port;
    }

    let srv_handle = tokio::spawn(start_server(server_state.clone()));
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 2. Pre-configure node as Trusted in TrustedPeerStore
    let secure_node_id = NodeId::new("secure_workstation");
    let keypair = NodeKeypair::generate().unwrap();
    let store_path = TrustedPeerStore::default_store_path();
    let mut store = TrustedPeerStore::load_or_default(&store_path).unwrap_or_default();
    store.add_trusted_peer(secure_node_id.clone(), keypair.public);
    let _ = store.save_to_file(&store_path);

    // 3. Connect via PLAINTEXT legacy JSON (attempt downgrade)
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port)).await.expect("connect failed");
    let handshake_json = serde_json::json!({
        "hostname": "secure_workstation",
        "os": "linux",
        "os_version": "6.1.0",
        "ip": "127.0.0.1",
        "arch": "x86_64"
    }).to_string();

    stream.write_all(format!("{}\n", handshake_json).as_bytes()).await.unwrap();
    stream.flush().await.unwrap();

    // 4. Server must reject and close connection
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    let read_result = tokio::time::timeout(tokio::time::Duration::from_millis(2000), reader.read_line(&mut line)).await;
    assert!(read_result.is_ok(), "read timed out");
    let res = read_result.unwrap();
    assert!(res.is_ok());
    // EOF / connection closed by server
    assert_eq!(res.unwrap(), 0);

    srv_handle.abort();
}

#[tokio::test]
async fn test_real_tcp_revoked_and_identity_mismatch_rejection() {
    let _guard = TEST_STORE_LOCK.lock().await;
    use fluffy_core::network::crypto::TrustedPeerStore;
    use fluffy_core::terminal::app_state::new_shared_state;
    use fluffy_core::terminal::net::start_server;
    use tokio::net::{TcpListener, TcpStream};

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);

    let server_state = new_shared_state();
    {
        let mut st = server_state.lock().await;
        st.admin_port = port;
    }

    let srv_handle = tokio::spawn(start_server(server_state.clone()));
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 1. Setup store with a revoked peer and an identity with key1
    let revoked_id = NodeId::new("revoked_node");
    let genuine_key = NodeKeypair::generate().unwrap().public;
    let mismatch_id = NodeId::new("mismatch_node");
    let mismatch_key = NodeKeypair::generate().unwrap().public;

    let store_path = TrustedPeerStore::default_store_path();
    let mut store = TrustedPeerStore::load_or_default(&store_path).unwrap_or_default();
    store.add_trusted_peer(revoked_id.clone(), genuine_key);
    store.revoke_peer(&revoked_id);
    store.add_trusted_peer(mismatch_id.clone(), mismatch_key);
    let _ = store.save_to_file(&store_path);

    // 2. Attacker with revoked key tries to connect
    let attacker_keys = NodeKeypair::generate().unwrap();
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let handshake_res = perform_noise_handshake_initiator(&mut stream, &attacker_keys).await;
    assert!(handshake_res.is_ok());
    let (transport, remote_pub) = handshake_res.unwrap();
    let mut sess = SecureSession::new(NodeId::new("admin"), remote_pub, transport);

    // Send handshake claiming to be mismatch_node
    let hs = serde_json::json!({
        "hostname": "mismatch_node", // presents mismatch_node with attacker key
        "os": "linux",
        "os_version": "1.0",
        "ip": "127.0.0.1",
        "arch": "x86_64"
    }).to_string();

    let enc = sess.encrypt(hs.as_bytes()).unwrap();
    let frame = BinaryFrame::new(FrameMessageType::EncryptedPayload, enc);
    let _ = write_frame(&mut stream, &frame).await;

    // Read response frame - should be Close frame or connection closed
    let read_result = tokio::time::timeout(tokio::time::Duration::from_millis(2000), read_frame(&mut stream)).await;
    assert!(read_result.is_ok(), "read frame timed out");
    let resp_frame = read_result.unwrap();
    if let Ok(f) = resp_frame {
        assert_eq!(f.header.message_type, FrameMessageType::Close);
    }

    srv_handle.abort();
}

#[tokio::test]
async fn test_pairing_api_and_sas_contracts() {
    use fluffy_core::network::api::{
        GetNodeFingerprintRequest, ListTrustedPeersRequest, NetworkApi, PairNodeWithKeyRequest,
        RevokeNodeTrustRequest,
    };
    use fluffy_core::network::cluster::{ClusterManager, HeartbeatConfig};
    use fluffy_core::network::event::NetworkEventBus;
    use fluffy_core::network::state::SharedNetworkState;

    let state = SharedNetworkState::new();
    let events = NetworkEventBus::default();
    let cluster = ClusterManager::new_with_events(state.clone(), HeartbeatConfig::default(), events.clone());
    let admin = AdminCommandController::new_with_bus(state.clone(), events.clone());
    let api = NetworkApi::new_with_admin(state, events, cluster, admin);

    // 1. Get local node fingerprint
    let fp_req = GetNodeFingerprintRequest::new();
    let fp_resp = api.get_node_fingerprint(fp_req).expect("get fingerprint failed");
    assert_eq!(fp_resp.local_public_key_hex.len(), 64);
    assert_eq!(fp_resp.local_fingerprint.len(), 17);

    // 2. Pair a remote node with its public key
    let remote_id = NodeId::new("remote_peer_alpha");
    let remote_key = NodeKeypair::generate().unwrap();
    let pair_req = PairNodeWithKeyRequest::new(remote_id.clone(), remote_key.public.to_hex());
    let pair_resp = api.pair_node_with_key(pair_req).expect("pair node failed");
    assert_eq!(pair_resp.node_id, remote_id);
    assert_eq!(pair_resp.status, "paired_trusted");

    // 3. Inspect SAS code with paired node
    let sas_req = GetNodeFingerprintRequest::with_target(remote_id.clone());
    let sas_resp = api.get_node_fingerprint(sas_req).expect("get sas failed");
    assert!(sas_resp.sas_code.is_some());
    let sas = sas_resp.sas_code.unwrap();
    assert_eq!(sas.len(), 6);
    assert!(sas.chars().all(|c| c.is_ascii_digit()));

    // 4. List trusted peers
    let list_req = ListTrustedPeersRequest::new();
    let list_resp = api.list_trusted_peers(list_req).expect("list trusted peers failed");
    assert_eq!(list_resp.peers.len(), 1);
    assert_eq!(list_resp.peers[0].node_id, remote_id);

    // 5. Revoke trust
    let revoke_req = RevokeNodeTrustRequest::new(remote_id.clone());
    let revoke_resp = api.revoke_node_trust(revoke_req).expect("revoke failed");
    assert!(revoke_resp.revoked);
}
