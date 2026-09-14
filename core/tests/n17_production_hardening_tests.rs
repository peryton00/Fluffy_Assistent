use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, duplex};

use fluffy_core::network::admin::audit::AdminAuditLogger;
use fluffy_core::network::admin::types::AdminAuditEntry;
use fluffy_core::network::config::{default_audit_log_path, default_data_dir};
use fluffy_core::network::crypto::keys::NodeKeypair;
use fluffy_core::network::diagnostics::NetworkDiagnostics;
use fluffy_core::network::ids::{DeviceId, NodeId};
use fluffy_core::network::model::NetworkDevice;
use fluffy_core::network::state::NetworkState;
use fluffy_core::network::subsystem::NetworkSubsystem;
use fluffy_core::network::transport::noise::perform_noise_handshake_initiator;
use fluffy_core::network::transport::session::{SecureSession, SessionError};
use fluffy_core::terminal::app_state::{AppState, MAX_COMMAND_HISTORY_ENTRIES, MAX_TERMINAL_OUTPUT_LINES};
use fluffy_core::terminal::net::{MAX_CONCURRENT_TCP_CONNECTIONS, TCP_HANDSHAKE_TIMEOUT};

// ============================================================================
// 1. SEC-03: Handshake & Connection Peek Timeout Tests
// ============================================================================

#[tokio::test]
async fn test_sec03_handshake_timeout_constants_and_configuration() {
    assert_eq!(TCP_HANDSHAKE_TIMEOUT.as_secs(), 10);
    assert_eq!(MAX_CONCURRENT_TCP_CONNECTIONS, 128);
}

#[tokio::test]
async fn test_sec03_stalled_connection_timeout_handling() {
    // Verify that a reader wrapped in timeout returns error when peer stays silent
    let (mut client, _server) = duplex(1024);

    let short_timeout = Duration::from_millis(50);
    let mut buf = [0u8; 2];
    let res = tokio::time::timeout(short_timeout, client.read_exact(&mut buf)).await;

    assert!(res.is_err(), "Stalled peer must trigger timeout");
}

#[tokio::test]
async fn test_sec03_fast_handshake_succeeds_within_timeout() {
    let (mut client_stream, mut server_stream) = duplex(65536);
    let k1 = NodeKeypair::generate().unwrap();
    let k2 = NodeKeypair::generate().unwrap();

    let client_task = tokio::spawn(async move {
        tokio::time::timeout(
            TCP_HANDSHAKE_TIMEOUT,
            perform_noise_handshake_initiator(&mut client_stream, &k1),
        )
        .await
    });

    let server_task = tokio::spawn(async move {
        tokio::time::timeout(
            TCP_HANDSHAKE_TIMEOUT,
            fluffy_core::network::transport::noise::perform_noise_handshake_responder(&mut server_stream, &k2),
        )
        .await
    });

    let (c_res, s_res) = tokio::join!(client_task, server_task);
    let client_out = c_res.unwrap().expect("client handshake timed out");
    let server_out = s_res.unwrap().expect("server handshake timed out");

    assert!(client_out.is_ok());
    assert!(server_out.is_ok());
}

// ============================================================================
// 2. RES-01: Maximum Concurrent TCP Connection Limit Tests
// ============================================================================

#[tokio::test]
async fn test_res01_semaphore_capacity_and_rejection() {
    let max_connections = 3;
    let semaphore = Arc::new(tokio::sync::Semaphore::new(max_connections));

    let permit1 = semaphore.clone().try_acquire_owned().expect("permit 1 failed");
    let permit2 = semaphore.clone().try_acquire_owned().expect("permit 2 failed");
    let permit3 = semaphore.clone().try_acquire_owned().expect("permit 3 failed");

    // 4th connection fails to acquire permit
    let permit4 = semaphore.clone().try_acquire_owned();
    assert!(permit4.is_err(), "Connection exceeding capacity must be rejected");

    // Release one permit
    drop(permit2);

    // Now slot is available
    let permit_retry = semaphore.clone().try_acquire_owned();
    assert!(permit_retry.is_ok(), "Slot must be reusable after release");

    drop(permit1);
    drop(permit3);
    drop(permit_retry);
}

// ============================================================================
// 3. RES-02: Bounded Terminal Output Buffer Tests
// ============================================================================

#[test]
fn test_res02_terminal_output_buffers_bounded_at_capacity() {
    let mut state = AppState::new();

    // 1. Output lines bound
    for i in 0..3000 {
        state.add_output("test", &format!("line {}", i), "text");
    }
    assert_eq!(state.output_lines.len(), MAX_TERMINAL_OUTPUT_LINES);
    assert_eq!(state.output_lines[0].text, "line 1000");
    assert_eq!(state.output_lines[MAX_TERMINAL_OUTPUT_LINES - 1].text, "line 2999");

    // 2. Client output lines bound
    for i in 0..2500 {
        state.add_client_output("f1", &format!("client {}", i), "brand");
    }
    assert_eq!(state.client_output.len(), MAX_TERMINAL_OUTPUT_LINES);
    assert_eq!(state.client_output[0].text, "client 500");

    // 3. Command history bound
    for i in 0..700 {
        state.add_history(format!("command {}", i));
    }
    assert_eq!(state.command_history.len(), MAX_COMMAND_HISTORY_ENTRIES);
    assert_eq!(state.command_history[0], "command 200");
}

// ============================================================================
// 4. RES-03 & WIN-01: Audit Log Rotation & Path Anchoring Tests
// ============================================================================

#[test]
fn test_res03_audit_log_rotation_and_bounded_retention() {
    let temp_dir = std::env::temp_dir().join(format!(
        "fluffy_audit_test_{}",
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    ));
    let log_file = temp_dir.join("admin_actions.jsonl");
    let logger = AdminAuditLogger::new_with_limits(&log_file, 250, 3);

    for i in 0..20 {
        let entry = AdminAuditEntry {
            timestamp_epoch_ms: 1726000000000 + i,
            request_id: format!("req-{}", i),
            target_node_id: "node-1".into(),
            capability_id: "Process.List".into(),
            caller_type: "LocalUser".into(),
            authorization_decision: "Allow".into(),
            success: true,
            duration_ms: 5,
            error_code: None,
        };
        logger.record(entry);
    }

    assert!(log_file.exists());
    let arc1 = temp_dir.join("admin_actions.1.jsonl");
    let arc2 = temp_dir.join("admin_actions.2.jsonl");
    let arc3 = temp_dir.join("admin_actions.3.jsonl");
    let arc4 = temp_dir.join("admin_actions.4.jsonl");

    assert!(arc1.exists());
    assert!(arc2.exists());
    assert!(arc3.exists());
    assert!(!arc4.exists(), "Retained archives must not exceed max_rotated_files limit of 3");

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_win01_canonical_data_path_resolution() {
    let data_dir = default_data_dir();
    let audit_path = default_audit_log_path();

    assert!(data_dir.to_string_lossy().len() > 0);
    assert!(audit_path.to_string_lossy().ends_with("admin_actions.jsonl"));
    assert!(audit_path.starts_with(&data_dir));
}

// ============================================================================
// 5. RES-04: Bounded RequestId Replay Cache Tests
// ============================================================================

#[tokio::test]
async fn test_res04_bounded_replay_cache_sliding_window() {
    let (mut client_stream, mut server_stream) = duplex(65536);
    let k1 = NodeKeypair::generate().unwrap();
    let k2 = NodeKeypair::generate().unwrap();
    let client_pub = k1.public;

    let client_task = tokio::spawn(async move {
        perform_noise_handshake_initiator(&mut client_stream, &k1).await
    });
    let server_task = tokio::spawn(async move {
        fluffy_core::network::transport::noise::perform_noise_handshake_responder(&mut server_stream, &k2).await
    });

    let (_, s_res) = tokio::join!(client_task, server_task);
    let (transport, _) = s_res.unwrap().unwrap();

    let mut session = SecureSession::new_with_replay_limit(
        NodeId::new("client_node"),
        client_pub,
        transport,
        5,
    );

    for i in 1..=5 {
        assert!(session.record_request_id(&format!("req-{}", i)).is_ok());
    }

    // Replay of active window IDs rejected
    assert!(matches!(
        session.record_request_id("req-1"),
        Err(SessionError::DuplicateRequestId(_))
    ));
    assert!(matches!(
        session.record_request_id("req-5"),
        Err(SessionError::DuplicateRequestId(_))
    ));

    // Insert 6th ID -> evicts req-1
    assert!(session.record_request_id("req-6").is_ok());

    // req-1 is now evicted and can be re-recorded; req-2 is still in window
    assert!(session.record_request_id("req-1").is_ok());
    assert!(session.record_request_id("req-6").is_err());
}

// ============================================================================
// 6. RES-05: Inactive Discovered Device Aging & Pruning Tests
// ============================================================================

#[test]
fn test_res05_device_pruning_and_invariance() {
    let mut state = NetworkState::new();

    let mut d1 = NetworkDevice::new(DeviceId::new("dev-1"), "192.168.1.10");
    d1.last_seen_epoch = 1000;

    let mut d2 = NetworkDevice::new(DeviceId::new("dev-2"), "192.168.1.11");
    d2.last_seen_epoch = 200;

    let mut d_self = NetworkDevice::new(DeviceId::new("dev-self"), "127.0.0.1");
    d_self.last_seen_epoch = 100;
    d_self.is_self = true;

    state.upsert_device(d1).unwrap();
    state.upsert_device(d2).unwrap();
    state.upsert_device(d_self).unwrap();

    assert_eq!(state.list_devices().len(), 3);

    // Prune stale devices older than 500s at current epoch 1000s
    let pruned = state.prune_stale_devices(500, 1000);
    assert_eq!(pruned, 1);
    assert_eq!(state.list_devices().len(), 2);

    assert!(state.get_device(&DeviceId::new("dev-1")).is_some());
    assert!(state.get_device(&DeviceId::new("dev-2")).is_none());
    assert!(state.get_device(&DeviceId::new("dev-self")).is_some());
}

// ============================================================================
// 7. REL-01: Network Subsystem Lifecycle & Shutdown Tests
// ============================================================================

#[tokio::test]
async fn test_rel01_subsystem_shutdown_and_restart_lifecycle() {
    let mut subsystem = NetworkSubsystem::default();
    let mut rx = subsystem.shutdown_receiver();

    assert!(!*rx.borrow());
    assert!(subsystem.start().is_ok());
    assert!(subsystem.is_running());

    // Stop signals shutdown
    assert!(subsystem.stop().is_ok());
    assert!(!subsystem.is_running());
    assert!(*rx.borrow_and_update());

    // Restart resets shutdown signal
    assert!(subsystem.start().is_ok());
    assert!(subsystem.is_running());
    assert!(!*rx.borrow_and_update());

    assert!(subsystem.stop().is_ok());
}

// ============================================================================
// 8. OBS-01: Diagnostics Counters Tests
// ============================================================================

#[test]
fn test_obs01_diagnostics_counters_concurrent_increments() {
    let diag = Arc::new(NetworkDiagnostics::new());
    let mut handles = Vec::new();

    for _ in 0..10 {
        let d = diag.clone();
        handles.push(std::thread::spawn(move || {
            for _ in 0..100 {
                d.inc_accepted_connections();
                d.inc_admin_commands_dispatched();
                d.inc_successful_reconnects();
            }
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    let snap = diag.snapshot();
    assert_eq!(snap.accepted_connections, 1000);
    assert_eq!(snap.admin_commands_dispatched, 1000);
    assert_eq!(snap.successful_reconnects, 1000);
}
