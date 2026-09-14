pub mod error;
pub mod executor;
pub mod handlers;
pub mod platform;

use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use crate::terminal::protocol::{AdminCommand, ClientHandshake};
use crate::terminal::app_state::{SharedState, ClientServiceStatus};

pub async fn run_client_agent(state: SharedState, admin_ip: String) {
    let admin_addr = if admin_ip.contains(':') {
        admin_ip.clone()
    } else {
        format!("{}:{}", admin_ip, 9000)
    };

    let mut backoff = crate::network::cluster::heartbeat::ReconnectBackoff::default();
    let mut is_first_attempt = true;

    loop {
        if !is_first_attempt {
            // Check if explicitly stopped by user
            let st = state.lock().await;
            if let ClientServiceStatus::Stopped = st.client_service_status {
                break;
            }
        }
        is_first_attempt = false;

        {
            let mut st = state.lock().await;
            st.client_service_status = ClientServiceStatus::Connecting(admin_ip.clone());
            st.add_client_output("client", &format!("Connecting to admin at {}...", admin_addr), "dim");
        }

        let mut stream = match TcpStream::connect(&admin_addr).await {
            Ok(s) => s,
            Err(e) => {
                let delay = backoff.next_delay();
                {
                    let mut st = state.lock().await;
                    st.client_service_status = ClientServiceStatus::Error(e.to_string());
                    st.add_client_output("client", &format!("Failed to connect to {}: {}. Retrying in {:?}...", admin_addr, e, delay), "error");
                }
                tokio::time::sleep(delay).await;
                continue;
            }
        };

        // Prepare client static identity keypair
        let local_keypair = match crate::network::crypto::NodeKeypair::load_or_generate(&crate::network::crypto::NodeKeypair::default_key_path()) {
            Ok(k) => k,
            Err(_) => match crate::network::crypto::NodeKeypair::generate() {
                Ok(k) => k,
                Err(e) => {
                    let mut st = state.lock().await;
                    st.add_client_output("client", &format!("Key generation error: {}", e), "error");
                    let delay = backoff.next_delay();
                    tokio::time::sleep(delay).await;
                    continue;
                }
            },
        };

        // Prepare ClientHandshake metadata
        let handshake = ClientHandshake {
            hostname: hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "unknown".to_string()),
            os: std::env::consts::OS.to_string(),
            os_version: get_os_version(),
            ip: get_local_ip(),
            arch: std::env::consts::ARCH.to_string(),
        };

        let handshake_json = match serde_json::to_string(&handshake) {
            Ok(j) => j,
            Err(e) => {
                let mut st = state.lock().await;
                st.add_client_output("client", &format!("Failed to serialize handshake: {}", e), "error");
                let delay = backoff.next_delay();
                tokio::time::sleep(delay).await;
                continue;
            }
        };

        // Attempt Noise XX handshake as initiator
        let handshake_res = crate::network::transport::noise::perform_noise_handshake_initiator(&mut stream, &local_keypair).await;

        match handshake_res {
            Ok((transport_state, remote_admin_pubkey)) => {
                // Establish SecureSession
                let mut session = crate::network::transport::SecureSession::new(
                    crate::network::ids::NodeId::new("admin_node"),
                    remote_admin_pubkey,
                    transport_state,
                );

                // Send encrypted ClientHandshake frame
                let enc_handshake = match session.encrypt(handshake_json.as_bytes()) {
                    Ok(c) => c,
                    Err(e) => {
                        let mut st = state.lock().await;
                        st.add_client_output("client", &format!("Handshake encryption error: {}", e), "error");
                        let delay = backoff.next_delay();
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                };

                let frame = crate::network::transport::framing::BinaryFrame::new(
                    crate::network::transport::framing::FrameMessageType::EncryptedPayload,
                    enc_handshake,
                );

                if let Err(e) = crate::network::transport::framing::write_frame(&mut stream, &frame).await {
                    let mut st = state.lock().await;
                    st.add_client_output("client", &format!("Failed to write handshake frame: {}", e), "error");
                    let delay = backoff.next_delay();
                    tokio::time::sleep(delay).await;
                    continue;
                }

                // Successful secure handshake -> reset backoff counter
                backoff.reset();

                {
                    let mut st = state.lock().await;
                    st.client_service_status = ClientServiceStatus::Running(admin_ip.clone());
                    st.add_client_output(
                        "client",
                        &format!(
                            "Secure session established (Noise XX, admin fp: {}). Ready for commands.",
                            remote_admin_pubkey.fingerprint()
                        ),
                        "success",
                    );
                }

                let shared_session = Arc::new(Mutex::new(session));
                let (mut reader, writer) = stream.into_split();
                let writer = Arc::new(Mutex::new(writer));
                let executor_state = Arc::new(Mutex::new(executor::ExecutorState::new()));

                // Session-bound periodic heartbeat sender
                let writer_heartbeat = Arc::clone(&writer);
                let heartbeat_abort = Arc::new(tokio::sync::Notify::new());
                let heartbeat_abort_clone = Arc::clone(&heartbeat_abort);
                let heartbeat_handle = tokio::spawn(async move {
                    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(5));
                    loop {
                        tokio::select! {
                            _ = ticker.tick() => {
                                let hb_frame = crate::network::transport::framing::BinaryFrame::new(
                                    crate::network::transport::framing::FrameMessageType::Heartbeat,
                                    vec![],
                                );
                                let mut w = writer_heartbeat.lock().await;
                                if crate::network::transport::framing::write_frame(&mut *w, &hb_frame).await.is_err() {
                                    break;
                                }
                            }
                            _ = heartbeat_abort_clone.notified() => {
                                break;
                            }
                        }
                    }
                });

                // Secure Binary Frame Reader Loop
                loop {
                    // Check shutdown signal
                    {
                        let st = state.lock().await;
                        if let ClientServiceStatus::Stopped = st.client_service_status {
                            let _ = crate::network::transport::framing::write_frame(
                                &mut *writer.lock().await,
                                &crate::network::transport::framing::BinaryFrame::new(
                                    crate::network::transport::framing::FrameMessageType::Close,
                                    vec![],
                                ),
                            ).await;
                            break;
                        }
                    }

                    match tokio::time::timeout(std::time::Duration::from_millis(500), crate::network::transport::framing::read_frame(&mut reader)).await {
                        Ok(Ok(frame)) => match frame.header.message_type {
                            crate::network::transport::framing::FrameMessageType::EncryptedPayload => {
                                let decrypted = {
                                    let mut sess = shared_session.lock().await;
                                    sess.decrypt(&frame.payload)
                                };

                                let plaintext_bytes = match decrypted {
                                    Ok(b) => b,
                                    Err(e) => {
                                        let mut st = state.lock().await;
                                        st.add_client_output("client", &format!("Decryption failure: {}", e), "error");
                                        break;
                                    }
                                };

                                let line = String::from_utf8_lossy(&plaintext_bytes).trim().to_string();
                                if line.is_empty() {
                                    continue;
                                }

                                // 1. Try parsing as AdminCapabilityInvoke
                                if let Ok(cap_invoke) = serde_json::from_str::<crate::terminal::protocol::AdminCapabilityInvoke>(&line) {
                                    let cmd_id = cap_invoke.id;
                                    let writer_clone = Arc::clone(&writer);
                                    let session_clone = Arc::clone(&shared_session);
                                    tokio::spawn(async move {
                                        let response = crate::capabilities::dispatch_capability(&cap_invoke.request);
                                        let result = crate::terminal::protocol::ClientCapabilityResult {
                                            id: cmd_id,
                                            response,
                                        };
                                        if let Ok(result_json) = serde_json::to_string(&result) {
                                            let enc = {
                                                let mut sess = session_clone.lock().await;
                                                sess.encrypt(result_json.as_bytes())
                                            };
                                            if let Ok(ciphertext) = enc {
                                                let frame = crate::network::transport::framing::BinaryFrame::new(
                                                    crate::network::transport::framing::FrameMessageType::EncryptedPayload,
                                                    ciphertext,
                                                );
                                                let mut w = writer_clone.lock().await;
                                                let _ = crate::network::transport::framing::write_frame(&mut *w, &frame).await;
                                            }
                                        }
                                    });
                                    continue;
                                }

                                // 2. Fall back to legacy AdminCommand inside encrypted channel
                                if let Ok(admin_cmd) = serde_json::from_str::<AdminCommand>(&line) {
                                    let cmd_id = admin_cmd.id;
                                    let executor_state_clone = Arc::clone(&executor_state);
                                    let writer_clone = Arc::clone(&writer);
                                    let session_clone = Arc::clone(&shared_session);

                                    tokio::spawn(async move {
                                        let response = executor::execute(
                                            cmd_id,
                                            admin_cmd.command,
                                            "client",
                                            "",
                                            &executor_state_clone,
                                        )
                                        .await;

                                        if let Ok(response_json) = serde_json::to_string(&response) {
                                            let enc = {
                                                let mut sess = session_clone.lock().await;
                                                sess.encrypt(response_json.as_bytes())
                                            };
                                            if let Ok(ciphertext) = enc {
                                                let frame = crate::network::transport::framing::BinaryFrame::new(
                                                    crate::network::transport::framing::FrameMessageType::EncryptedPayload,
                                                    ciphertext,
                                                );
                                                let mut w = writer_clone.lock().await;
                                                let _ = crate::network::transport::framing::write_frame(&mut *w, &frame).await;
                                            }
                                        }
                                    });
                                }
                            }
                            crate::network::transport::framing::FrameMessageType::Heartbeat => {
                                let mut sess = shared_session.lock().await;
                                sess.last_activity_epoch_ms = chrono::Utc::now().timestamp_millis() as u64;
                            }
                            crate::network::transport::framing::FrameMessageType::Close => {
                                let mut st = state.lock().await;
                                st.add_client_output("client", "Admin closed secure connection.", "dim");
                                break;
                            }
                            _ => {}
                        },
                        Ok(Err(e)) => {
                            let mut st = state.lock().await;
                            st.add_client_output("client", &format!("Secure transport error: {}", e), "error");
                            break;
                        }
                        Err(_) => {
                            continue;
                        }
                    }
                }

                heartbeat_abort.notify_waiters();
                heartbeat_handle.abort();
            }
            Err(noise_err) => {
                // Strict Security Invariant:
                // NEVER silently downgrade to plaintext if this node is configured for secure transport!
                let delay = backoff.next_delay();
                {
                    let mut st = state.lock().await;
                    st.add_client_output(
                        "client",
                        &format!("Noise XX handshake failed: {}. Retrying secure connection in {:?}...", noise_err, delay),
                        "error",
                    );
                }
                tokio::time::sleep(delay).await;
                continue;
            }
        }

        // Check if stopped before initiating reconnect loop iteration
        {
            let st = state.lock().await;
            if let ClientServiceStatus::Stopped = st.client_service_status {
                break;
            }
        }

        let delay = backoff.next_delay();
        {
            let mut st = state.lock().await;
            st.client_service_status = ClientServiceStatus::Connecting(admin_ip.clone());
            st.add_client_output("client", &format!("Disconnected from admin. Reconnecting in {:?}...", delay), "warning");
        }
        tokio::time::sleep(delay).await;
    }

    {
        let mut st = state.lock().await;
        st.client_service_status = ClientServiceStatus::Stopped;
        st.add_client_output("client", "Client agent stopped.", "dim");
    }
}

fn get_os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_OperatingSystem).Version",
            ])
            .output();
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            Err(_) => "Unknown".to_string(),
        }
    }
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|l| l.starts_with("VERSION="))
                    .map(|l| l.trim_start_matches("VERSION=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "Unknown".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sw_vers")
            .args(["-productVersion"])
            .output();
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            Err(_) => "Unknown".to_string(),
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        "Unknown".to_string()
    }
}

fn get_local_ip() -> String {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0");
    match socket {
        Ok(s) => {
            if s.connect("8.8.8.8:80").is_ok() {
                if let Ok(addr) = s.local_addr() {
                    return addr.ip().to_string();
                }
            }
            "127.0.0.1".to_string()
        }
        Err(_) => "127.0.0.1".to_string(),
    }
}
