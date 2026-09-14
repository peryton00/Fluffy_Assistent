use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, Mutex, Semaphore};

use crate::network::crypto::{NodeKeypair, TrustEvaluation, TrustedPeerStore};
use crate::network::diagnostics::global_diagnostics;
use crate::network::ids::NodeId;
use crate::network::transport::framing::{read_frame, write_frame, BinaryFrame, FrameMessageType, FRAME_MAGIC};
use crate::network::transport::noise::perform_noise_handshake_responder;
use crate::network::transport::SecureSession;
use crate::terminal::app_state::{ClientInfo, SharedState};
use crate::terminal::protocol::{ClientHandshake, ClientResponse};

/// Maximum bounded duration allowed for an unauthenticated peer to complete protocol detection and Noise XX handshake (SEC-03)
pub const TCP_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Maximum concurrent active and evaluating TCP connections allowed on the admin mesh port (RES-01)
pub const MAX_CONCURRENT_TCP_CONNECTIONS: usize = 128;

/// Start the TCP server on the configured port with default standalone lifecycle.
pub async fn start_server(state: SharedState) {
    let (_tx, rx) = tokio::sync::watch::channel(false);
    start_server_with_shutdown(state, rx).await;
}

/// Start the TCP server on the configured port, coordinating with subsystem shutdown cancellation (REL-01)
pub async fn start_server_with_shutdown(
    state: SharedState,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) {
    let port = {
        let st = state.lock().await;
        st.admin_port
    };

    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Fluffy admin server listening on port {}", port),
                "brand",
            );
            l
        }
        Err(e) => {
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Failed to bind port {}: {}", port, e),
                "error",
            );
            return;
        }
    };

    let conn_semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_TCP_CONNECTIONS));

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    let mut st = state.lock().await;
                    st.add_output("system", "Fluffy admin server shutting down cleanly.", "warning");
                    break;
                }
            }
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((stream, addr)) => {
                        let addr_str = addr.to_string();
                        global_diagnostics().inc_accepted_connections();

                        match conn_semaphore.clone().try_acquire_owned() {
                            Ok(permit) => {
                                let state_clone = Arc::clone(&state);
                                tokio::spawn(async move {
                                    let _permit = permit;
                                    handle_client(stream, addr_str, state_clone).await;
                                });
                            }
                            Err(_) => {
                                global_diagnostics().inc_rejected_connections();
                                let mut st = state.lock().await;
                                st.add_output(
                                    "system",
                                    &format!(
                                        "Rejecting connection from {}: concurrent connection limit ({}) reached",
                                        addr_str, MAX_CONCURRENT_TCP_CONNECTIONS
                                    ),
                                    "error",
                                );
                                drop(stream);
                            }
                        }
                    }
                    Err(e) => {
                        let mut st = state.lock().await;
                        st.add_output(
                            "system",
                            &format!("Accept error: {}", e),
                            "error",
                        );
                    }
                }
            }
        }
    }
}

/// Handle a single client connection with automatic secure Noise XX / legacy transport detection and bounded timeout (SEC-03).
async fn handle_client(
    stream: tokio::net::TcpStream,
    addr: String,
    state: SharedState,
) {
    // 1. Peek at first 2 bytes to detect Noise binary framing vs legacy plaintext JSON with bounded timeout
    let mut peek_buf = [0u8; 2];
    let peek_res = tokio::time::timeout(TCP_HANDSHAKE_TIMEOUT, stream.peek(&mut peek_buf)).await;

    let is_secure_framed = match peek_res {
        Ok(Ok(2)) if peek_buf == FRAME_MAGIC => true,
        Ok(Ok(_)) | Ok(Err(_)) => false,
        Err(_) => {
            global_diagnostics().inc_handshake_timeouts();
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Connection timed out waiting for protocol peek from {}", addr),
                "warning",
            );
            return;
        }
    };

    if is_secure_framed {
        handle_secure_client(stream, addr, state).await;
    } else {
        handle_legacy_client(stream, addr, state).await;
    }
}

/// Handle a cryptographically authenticated Noise XX binary-framed client connection with handshake timeouts.
async fn handle_secure_client(
    mut stream: tokio::net::TcpStream,
    addr: String,
    state: SharedState,
) {
    // 1. Load or generate server static identity keypair
    let local_keypair = match NodeKeypair::load_or_generate(&NodeKeypair::default_key_path()) {
        Ok(k) => k,
        Err(_) => match NodeKeypair::generate() {
            Ok(k) => k,
            Err(e) => {
                let mut st = state.lock().await;
                st.add_output("system", &format!("Key generation error: {}", e), "error");
                return;
            }
        },
    };

    // 2. Perform Noise_XX mutual cryptographic handshake as responder with bounded timeout (SEC-03)
    let handshake_fut = perform_noise_handshake_responder(&mut stream, &local_keypair);
    let (transport_state, peer_public_key) = match tokio::time::timeout(TCP_HANDSHAKE_TIMEOUT, handshake_fut).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => {
            global_diagnostics().inc_auth_failures();
            let mut st = state.lock().await;
            st.add_output("system", &format!("Noise XX handshake failed from {}: {}", addr, e), "error");
            return;
        }
        Err(_) => {
            global_diagnostics().inc_handshake_timeouts();
            let mut st = state.lock().await;
            st.add_output("system", &format!("Noise XX handshake timed out from {}", addr), "warning");
            return;
        }
    };

    let mut session = SecureSession::new(NodeId::new("evaluating"), peer_public_key, transport_state);

    // 3. Read initial encrypted frame containing ClientHandshake with bounded timeout
    let initial_frame = match tokio::time::timeout(TCP_HANDSHAKE_TIMEOUT, read_frame(&mut stream)).await {
        Ok(Ok(f)) => f,
        Ok(Err(e)) => {
            let mut st = state.lock().await;
            st.add_output("system", &format!("Failed to read initial handshake frame from {}: {}", addr, e), "error");
            return;
        }
        Err(_) => {
            global_diagnostics().inc_handshake_timeouts();
            let mut st = state.lock().await;
            st.add_output("system", &format!("Initial frame read timed out from {}", addr), "warning");
            return;
        }
    };

    if initial_frame.header.message_type != FrameMessageType::EncryptedPayload {
        let mut st = state.lock().await;
        st.add_output(
            "system",
            &format!("Expected EncryptedPayload frame from {}, received {:?}", addr, initial_frame.header.message_type),
            "error",
        );
        return;
    }

    let decrypted_bytes = match session.decrypt(&initial_frame.payload) {
        Ok(b) => b,
        Err(e) => {
            global_diagnostics().inc_auth_failures();
            let mut st = state.lock().await;
            st.add_output("system", &format!("Handshake decryption error from {}: {}", addr, e), "error");
            return;
        }
    };

    let handshake: ClientHandshake = match serde_json::from_slice(&decrypted_bytes) {
        Ok(h) => h,
        Err(e) => {
            let mut st = state.lock().await;
            st.add_output("system", &format!("Invalid decrypted handshake payload from {}: {}", addr, e), "error");
            return;
        }
    };

    // 4. Identity & Trust Verification against TrustedPeerStore
    let logical_node_id = NodeId::new(&handshake.hostname);
    session.node_id = logical_node_id.clone();

    let store = TrustedPeerStore::load_or_default(&TrustedPeerStore::default_store_path())
        .unwrap_or_default();
    let evaluation = store.evaluate_peer(&logical_node_id, &peer_public_key);

    match evaluation {
        TrustEvaluation::Revoked => {
            global_diagnostics().inc_auth_failures();
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Connection rejected: node '{}' (key: {}) is REVOKED", logical_node_id, peer_public_key.fingerprint()),
                "error",
            );
            let close_frame = BinaryFrame::new(FrameMessageType::Close, vec![]);
            let _ = write_frame(&mut stream, &close_frame).await;
            return;
        }
        TrustEvaluation::IdentityMismatch { expected_key, actual_key } => {
            global_diagnostics().inc_auth_failures();
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!(
                    "Connection rejected: identity mismatch for '{}' (expected: {}, presented: {})",
                    logical_node_id, expected_key.fingerprint(), actual_key.fingerprint()
                ),
                "error",
            );
            let close_frame = BinaryFrame::new(FrameMessageType::Close, vec![]);
            let _ = write_frame(&mut stream, &close_frame).await;
            return;
        }
        TrustEvaluation::Trusted => {
            // Established cryptographically trusted peer
        }
        TrustEvaluation::Unknown | TrustEvaluation::PendingTrust => {
            // First contact / un-paired node
        }
    }

    let shared_session = Arc::new(Mutex::new(session));

    // 5. Register client in AppState with unique session generation
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let (tag, session_id) = {
        let mut st = state.lock().await;
        let tag = st.next_client_tag();
        let sid = st.next_session_id();
        let client_info = ClientInfo {
            tag: tag.clone(),
            hostname: handshake.hostname.clone(),
            os: handshake.os.clone(),
            os_version: handshake.os_version.clone(),
            ip: handshake.ip.clone(),
            arch: handshake.arch.clone(),
            sender: tx,
            connected_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            is_secure: true,
            peer_public_key: Some(peer_public_key.to_hex()),
            session_id: sid,
            node_id: Some(logical_node_id.to_string()),
            is_authoritative: true,
        };

        if let Some(superseded) = st.register_session(addr.clone(), client_info) {
            st.add_output(
                &tag,
                &format!(
                    "Superseding previous session [{}] (sid: {}) for node '{}'",
                    superseded.tag, superseded.session_id, logical_node_id
                ),
                "brand",
            );
        }

        st.add_output(
            &tag,
            &format!(
                "Client [{}] securely connected (Noise XX, fp: {}, sid: {}): {} ({} {}) at {}",
                tag, peer_public_key.fingerprint(), sid, handshake.hostname, handshake.os, handshake.os_version, handshake.ip
            ),
            "success",
        );
        (tag, sid)
    };

    global_diagnostics().inc_active_sessions();

    // 5b. Synchronize with authoritative NetworkState / ClusterManager
    let subsystem = crate::network::subsystem::global_network_subsystem();
    let mut node = crate::network::model::NetworkNode::new(
        logical_node_id.clone(),
        &handshake.hostname,
        &handshake.hostname,
        &handshake.os,
        &handshake.arch,
    );
    node.availability = crate::network::model::NodeAvailability::Connected;
    node.auth_state = crate::network::model::AuthenticationState::Authenticated;
    node.pairing_state = crate::network::model::PairingState::Paired;
    node.metadata.insert("terminal_tag".to_string(), tag.clone());
    node.metadata.insert("is_secure".to_string(), "true".to_string());
    node.metadata.insert("session_id".to_string(), session_id.to_string());
    node.ip_addresses.push(handshake.ip.clone());
    let _ = subsystem.cluster().register_node(node);
    let now_epoch_sec = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = subsystem.cluster().record_heartbeat(&logical_node_id, now_epoch_sec);

    // 6. Split TCP stream into reader and writer
    let (mut reader, mut writer) = stream.into_split();

    // Spawn secure writer task
    let session_for_writer = Arc::clone(&shared_session);
    let tag_for_writer = tag.clone();
    let addr_for_writer = addr.clone();
    let state_for_writer = Arc::clone(&state);
    let writer_handle = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let enc_res = {
                let mut sess = session_for_writer.lock().await;
                sess.encrypt(msg.as_bytes())
            };

            match enc_res {
                Ok(ciphertext) => {
                    let frame = BinaryFrame::new(FrameMessageType::EncryptedPayload, ciphertext);
                    if write_frame(&mut writer, &frame).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let mut st = state_for_writer.lock().await;
                    st.add_output(&tag_for_writer, &format!("Encryption failure: {}", e), "error");
                    break;
                }
            }
        }
        let mut st = state_for_writer.lock().await;
        let _ = st.remove_client_session(&addr_for_writer, session_id);
        st.add_output(
            &tag_for_writer,
            &format!("Secure client [{}] writer closed.", tag_for_writer),
            "warning",
        );
    });

    // Reader loop: read binary frames from client
    let session_for_reader = Arc::clone(&shared_session);
    let tag_for_reader = tag.clone();
    let state_for_reader = Arc::clone(&state);
    let logical_node_id_reader = logical_node_id.clone();

    loop {
        match read_frame(&mut reader).await {
            Ok(frame) => match frame.header.message_type {
                FrameMessageType::EncryptedPayload => {
                    let dec_res = {
                        let mut sess = session_for_reader.lock().await;
                        sess.decrypt(&frame.payload)
                    };

                    match dec_res {
                        Ok(plaintext) => {
                            let line = String::from_utf8_lossy(&plaintext).trim().to_string();
                            if line.is_empty() {
                                continue;
                            }

                            if let Ok(cap_res) = serde_json::from_str::<crate::terminal::protocol::ClientCapabilityResult>(&line) {
                                crate::network::admin::notify_remote_capability_result_by_id(cap_res.id, cap_res.response).await;
                            } else if let Ok(response) = serde_json::from_str::<ClientResponse>(&line) {
                                let mut st = state_for_reader.lock().await;
                                let color_tag = if response.success { "text" } else { "error" };
                                st.add_output(&tag_for_reader, &response.output, color_tag);
                            } else {
                                let mut st = state_for_reader.lock().await;
                                st.add_output(
                                    &tag_for_reader,
                                    &format!("Parse error from secure [{}]: unrecognized payload", tag_for_reader),
                                    "error",
                                );
                            }
                        }
                        Err(e) => {
                            let mut st = state_for_reader.lock().await;
                            st.add_output(&tag_for_reader, &format!("Decryption failure from [{}]: {}", tag_for_reader, e), "error");
                            break;
                        }
                    }
                }
                FrameMessageType::Heartbeat => {
                    let now_sec = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    {
                        let mut sess = session_for_reader.lock().await;
                        sess.last_activity_epoch_ms = (now_sec * 1000) as u64;
                    }
                    let subsystem = crate::network::subsystem::global_network_subsystem();
                    let _ = subsystem.cluster().record_heartbeat(&logical_node_id_reader, now_sec);
                }
                FrameMessageType::Close => {
                    let mut st = state_for_reader.lock().await;
                    st.add_output(&tag_for_reader, &format!("Client [{}] sent close frame.", tag_for_reader), "dim");
                    break;
                }
                _ => {}
            },
            Err(e) => {
                let mut st = state_for_reader.lock().await;
                st.add_output(
                    &tag_for_reader,
                    &format!("Framing/IO error from secure [{}]: {}", tag_for_reader, e),
                    "error",
                );
                break;
            }
        }
    }

    // Authoritative Session Disconnect Cleanup
    let removed_info = {
        let mut st = state.lock().await;
        let removed = st.remove_client_session(&addr, session_id);
        if let Some(ref c) = removed {
            st.add_output(
                &c.tag,
                &format!("Secure client [{}] disconnected.", c.tag),
                "warning",
            );
        }
        removed
    };

    global_diagnostics().dec_active_sessions();

    // If this was the active authoritative session, synchronize disconnect with NetworkState & fail in-flight commands
    if let Some(client) = removed_info {
        let subsystem = crate::network::subsystem::global_network_subsystem();
        let _ = subsystem.cluster().transition_node_availability(&logical_node_id, crate::network::model::NodeAvailability::Disconnected);
        let _ = crate::network::admin::fail_pending_for_tag(&client.tag, "Socket disconnected").await;
        let _ = crate::network::admin::fail_pending_for_node(logical_node_id.as_str(), "Socket disconnected").await;
    }

    writer_handle.abort();
}

/// Handle a legacy plaintext newline-delimited JSON client connection with downgrade prevention and bounded timeouts.
async fn handle_legacy_client(
    stream: tokio::net::TcpStream,
    addr: String,
    state: SharedState,
) {
    let (reader, writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut writer = writer;

    // Read handshake with bounded timeout (SEC-03)
    let mut handshake_line = String::new();
    match tokio::time::timeout(TCP_HANDSHAKE_TIMEOUT, reader.read_line(&mut handshake_line)).await {
        Ok(Ok(0)) => {
            return; // Client disconnected immediately
        }
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Handshake read error from {}: {}", addr, e),
                "error",
            );
            return;
        }
        Err(_) => {
            global_diagnostics().inc_handshake_timeouts();
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Legacy handshake timed out from {}", addr),
                "warning",
            );
            return;
        }
    }

    let handshake: ClientHandshake = match serde_json::from_str(handshake_line.trim()) {
        Ok(h) => h,
        Err(e) => {
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!("Invalid legacy handshake from {}: {}", addr, e),
                "error",
            );
            return;
        }
    };

    // Downgrade Protection Check:
    // If this node is paired as a trusted peer in TrustedPeerStore, reject plaintext legacy connection!
    let logical_node_id = NodeId::new(&handshake.hostname);
    let store = TrustedPeerStore::load_or_default(&TrustedPeerStore::default_store_path())
        .unwrap_or_default();
    if let Some(peer) = store.get(&logical_node_id) {
        if peer.status == crate::network::crypto::TrustStatus::Trusted {
            global_diagnostics().inc_auth_failures();
            let mut st = state.lock().await;
            st.add_output(
                "system",
                &format!(
                    "Downgrade rejected: Node '{}' is configured for secure transport but connected with plaintext legacy protocol.",
                    logical_node_id
                ),
                "error",
            );
            let _ = writer.shutdown().await;
            return;
        }
    }

    // Create channel for sending commands to this client
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Assign tag and register client with session generation
    let (tag, session_id) = {
        let mut st = state.lock().await;
        let tag = st.next_client_tag();
        let sid = st.next_session_id();
        let client_info = ClientInfo {
            tag: tag.clone(),
            hostname: handshake.hostname.clone(),
            os: handshake.os.clone(),
            os_version: handshake.os_version.clone(),
            ip: handshake.ip.clone(),
            arch: handshake.arch.clone(),
            sender: tx,
            connected_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            is_secure: false,
            peer_public_key: None,
            session_id: sid,
            node_id: Some(logical_node_id.to_string()),
            is_authoritative: true,
        };

        if let Some(superseded) = st.register_session(addr.clone(), client_info) {
            st.add_output(
                &tag,
                &format!(
                    "Superseding previous session [{}] (sid: {}) for node '{}'",
                    superseded.tag, superseded.session_id, logical_node_id
                ),
                "brand",
            );
        }

        st.add_output(
            &tag,
            &format!(
                "Client [{}] connected (legacy compatibility, sid: {}): {} ({} {}) at {}",
                tag, sid, handshake.hostname, handshake.os, handshake.os_version, handshake.ip
            ),
            "warning",
        );
        (tag, sid)
    };

    global_diagnostics().inc_active_sessions();

    // Spawn writer task: forwards commands from the channel to the TCP stream
    let tag_for_writer = tag.clone();
    let addr_for_writer = addr.clone();
    let state_for_writer = Arc::clone(&state);
    let writer_handle = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if writer
                .write_all(format!("{}\n", msg).as_bytes())
                .await
                .is_err()
            {
                break;
            }
            if writer.flush().await.is_err() {
                break;
            }
        }
        let mut st = state_for_writer.lock().await;
        let _ = st.remove_client_session(&addr_for_writer, session_id);
        st.add_output(
            &tag_for_writer,
            &format!("Client [{}] writer disconnected.", tag_for_writer),
            "warning",
        );
    });

    // Reader loop: read responses from the client
    let tag_for_reader = tag.clone();
    let state_for_reader = Arc::clone(&state);
    let mut line_buf = String::new();
    loop {
        line_buf.clear();
        match reader.read_line(&mut line_buf).await {
            Ok(0) => {
                break;
            }
            Ok(_) => {
                let line = line_buf.trim().to_string();
                if line.is_empty() {
                    continue;
                }

                if let Ok(cap_res) = serde_json::from_str::<crate::terminal::protocol::ClientCapabilityResult>(&line) {
                    crate::network::admin::notify_remote_capability_result_by_id(cap_res.id, cap_res.response).await;
                } else if let Ok(response) = serde_json::from_str::<ClientResponse>(&line) {
                    let mut st = state_for_reader.lock().await;
                    let color_tag = if response.success {
                        "text"
                    } else {
                        "error"
                    };
                    st.add_output(&tag_for_reader, &response.output, color_tag);
                } else {
                    let mut st = state_for_reader.lock().await;
                    st.add_output(
                        &tag_for_reader,
                        &format!("Parse error from [{}]: unrecognized message frame", tag_for_reader),
                        "error",
                    );
                }
            }
            Err(e) => {
                let mut st = state_for_reader.lock().await;
                st.add_output(
                    &tag_for_reader,
                    &format!("Read error from [{}]: {}", tag_for_reader, e),
                    "error",
                );
                break;
            }
        }
    }

    // Cleanup
    let removed_info = {
        let mut st = state.lock().await;
        let removed = st.remove_client_session(&addr, session_id);
        if let Some(ref c) = removed {
            st.add_output(
                &c.tag,
                &format!("Client [{}] disconnected.", c.tag),
                "warning",
            );
            if st.alter_target.as_ref() == Some(&c.tag) {
                st.alter_target = None;
                st.add_output(
                    "system",
                    &format!(
                        "Alter target [{}] disconnected. Returning to local mode.",
                        c.tag
                    ),
                    "warning",
                );
            }
        }
        removed
    };

    global_diagnostics().dec_active_sessions();

    if let Some(client) = removed_info {
        let subsystem = crate::network::subsystem::global_network_subsystem();
        let _ = subsystem.cluster().transition_node_availability(&logical_node_id, crate::network::model::NodeAvailability::Disconnected);
        let _ = crate::network::admin::fail_pending_for_tag(&client.tag, "Socket disconnected").await;
        let _ = crate::network::admin::fail_pending_for_node(logical_node_id.as_str(), "Socket disconnected").await;
    }

    writer_handle.abort();
}
