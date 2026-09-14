//! Phase N16: NetworkState Invariants & High-Concurrency Validation Tests
//!
//! Validates:
//! - Strict monotonic revision guarantees under massive parallel contention
//! - Snapshot isolation and internal coherence under concurrent reader/writer churn
//! - No revision churn on no-op / unchanged state updates
//! - Entity removal persistence and identity stability

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;

use fluffy_core::network::ids::{ConnectionId, DeviceId, NodeId};
use fluffy_core::network::model::{
    ConnectionKind, NetworkConnection, NetworkDevice, NetworkNode, NodeAvailability,
};
use fluffy_core::network::state::SharedNetworkState;
use fluffy_core::network::types::{FlowProtocol, FlowState};

#[test]
fn test_concurrent_readers_and_writers_monotonic_revision_integrity() {
    let state = SharedNetworkState::new();
    let num_readers = 100;
    let num_writers = 8;
    let iterations_per_writer = 150;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let last_observed_revision = Arc::new(AtomicU64::new(0));

    // Spawn 100 concurrent reader threads
    let mut reader_handles = Vec::new();
    for _ in 0..num_readers {
        let state_clone = state.clone();
        let stop_clone = Arc::clone(&stop_flag);
        let max_rev = Arc::clone(&last_observed_revision);

        reader_handles.push(thread::spawn(move || {
            let mut local_max = 0;
            while !stop_clone.load(Ordering::Relaxed) {
                let snapshot = state_clone.get_snapshot();
                assert!(
                    snapshot.revision >= local_max,
                    "Revision regressed: local_max={}, snapshot.revision={}",
                    local_max,
                    snapshot.revision
                );
                local_max = snapshot.revision;
                max_rev.fetch_max(local_max, Ordering::Relaxed);

                // Verify snapshot internal coherence
                for node in &snapshot.nodes {
                    assert!(!node.id.as_str().is_empty(), "Node ID cannot be empty in snapshot");
                }
                for dev in &snapshot.devices {
                    assert!(!dev.id.as_str().is_empty(), "Device ID cannot be empty in snapshot");
                }
                for conn in &snapshot.connections {
                    assert!(!conn.id.as_str().is_empty(), "Connection ID cannot be empty in snapshot");
                }

                thread::yield_now();
            }
        }));
    }

    // Spawn 8 concurrent writer threads
    let mut writer_handles = Vec::new();
    for writer_id in 0..num_writers {
        let state_clone = state.clone();

        writer_handles.push(thread::spawn(move || {
            for i in 0..iterations_per_writer {
                let node_id = NodeId::new(format!("node-w{}-i{}", writer_id, i));
                let dev_id = DeviceId::new(format!("dev-w{}-i{}", writer_id, i));
                let conn_id = ConnectionId::new(format!("conn-w{}-i{}", writer_id, i));

                // 1. Upsert node
                let mut node = NetworkNode::new(
                    node_id.clone(),
                    format!("Node {}-{}", writer_id, i),
                    "HOST",
                    "linux",
                    "x86_64",
                );
                node.availability = NodeAvailability::Connected;
                state_clone.write(|s| s.upsert_node(node)).unwrap();

                // 2. Upsert device
                let dev = NetworkDevice::new(dev_id.clone(), "192.168.1.50");
                state_clone.write(|s| s.upsert_device(dev)).unwrap();

                // 3. Upsert connection
                let conn = NetworkConnection::new(
                    conn_id.clone(),
                    ConnectionKind::LocalSocketFlow,
                    FlowProtocol::Tcp,
                    "192.168.1.50",
                    9000,
                    FlowState::Established,
                );
                state_clone.write(|s| s.upsert_connection(conn)).unwrap();

                // 4. Remove connection and device occasionally
                if i % 3 == 0 {
                    let _ = state_clone.write(|s| {
                        let _ = s.remove_connection(&conn_id);
                        let _ = s.remove_device(&dev_id);
                    });
                }
            }
        }));
    }

    // Await writers completion
    for w in writer_handles {
        w.join().expect("Writer thread panicked");
    }

    // Stop readers
    stop_flag.store(true, Ordering::Relaxed);
    for r in reader_handles {
        r.join().expect("Reader thread panicked");
    }

    // Final validation
    let final_snap = state.get_snapshot();
    assert!(final_snap.revision > 0, "Revision should have incremented");
    assert!(
        final_snap.revision >= last_observed_revision.load(Ordering::Relaxed),
        "Final revision must be >= observed reader revisions"
    );
}

#[test]
fn test_no_revision_churn_on_identical_state_upserts() {
    let state = SharedNetworkState::new();
    let initial_rev = state.revision();

    let node_id = NodeId::new("stable-node-1");
    let node = NetworkNode::new(
        node_id.clone(),
        "Stable Node",
        "STABLE-HOST",
        "windows",
        "x86_64",
    );

    // Initial insert increments revision
    state.write(|s| s.upsert_node(node.clone())).unwrap();
    let rev_after_first = state.revision();
    assert!(rev_after_first > initial_rev);

    // Identical upsert MUST NOT increment revision
    state.write(|s| s.upsert_node(node.clone())).unwrap();
    let rev_after_second = state.revision();
    assert_eq!(
        rev_after_first, rev_after_second,
        "Identical node upsert must not cause revision churn"
    );

    // Mutating a field increments revision
    let mut modified_node = node;
    modified_node.availability = NodeAvailability::Connected;
    state.write(|s| s.upsert_node(modified_node)).unwrap();
    assert!(state.revision() > rev_after_second);
}

#[test]
fn test_entity_removal_persistence_and_isolated_snapshots() {
    let state = SharedNetworkState::new();

    let node_id = NodeId::new("removable-node");
    let node = NetworkNode::new(node_id.clone(), "Removable", "HOST", "linux", "x86_64");
    state.write(|s| s.upsert_node(node)).unwrap();

    // Capture snapshot before removal
    let snap1 = state.get_snapshot();
    assert!(snap1.nodes.iter().any(|n| n.id == node_id));

    // Remove node
    let removed = state.write(|s| s.remove_node(&node_id)).unwrap();
    assert!(removed.is_some());

    // Capture snapshot after removal
    let snap2 = state.get_snapshot();
    assert!(!snap2.nodes.iter().any(|n| n.id == node_id));

    // snap1 remains immutable and untouched
    assert!(snap1.nodes.iter().any(|n| n.id == node_id));
    assert!(snap2.revision > snap1.revision);

    // Removing again returns None and does not change state revision
    let rev_before = state.revision();
    let removed_again = state.write(|s| s.remove_node(&node_id)).unwrap();
    assert!(removed_again.is_none());
    assert_eq!(state.revision(), rev_before);
}
