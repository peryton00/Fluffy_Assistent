use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::network::ids::NodeId;

/// Heartbeat configuration parameters for cluster node health tracking.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeartbeatConfig {
    /// Expected interval between heartbeats (in seconds)
    pub interval_sec: u64,
    /// Threshold (in seconds) after which a node is marked Disconnected or Recovering
    pub timeout_sec: u64,
    /// Number of consecutive missed heartbeats before marking Disconnected
    pub missed_threshold: u32,
}

impl Default for HeartbeatConfig {
    fn default() -> Self {
        Self {
            interval_sec: 5,
            timeout_sec: 15,
            missed_threshold: 3,
        }
    }
}

/// Metadata recorded for an active cluster node's heartbeat.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeHeartbeatRecord {
    /// Epoch timestamp (seconds) of the most recent heartbeat
    pub last_heartbeat_epoch_sec: u64,
    /// Number of consecutive heartbeat check cycles that saw no new signal
    pub missed_count: u32,
}

/// Local runtime tracker for node heartbeats.
///
/// Note: This is an auxiliary tracker that aids `ClusterManager` in calculating timeouts;
/// the authoritative node availability state resides inside `NetworkState`.
#[derive(Debug, Clone, Default)]
pub struct HeartbeatTracker {
    records: HashMap<NodeId, NodeHeartbeatRecord>,
}

impl HeartbeatTracker {
    /// Create a new empty HeartbeatTracker
    pub fn new() -> Self {
        Self {
            records: HashMap::new(),
        }
    }

    /// Record a received heartbeat for a node
    pub fn record_heartbeat(&mut self, node_id: &NodeId, observed_at_sec: u64) {
        self.records.insert(
            node_id.clone(),
            NodeHeartbeatRecord {
                last_heartbeat_epoch_sec: observed_at_sec,
                missed_count: 0,
            },
        );
    }

    /// Remove a node from heartbeat tracking (e.g. when unregistered)
    pub fn remove_node(&mut self, node_id: &NodeId) {
        self.records.remove(node_id);
    }

    /// Retrieve the epoch timestamp of the last recorded heartbeat for a node
    pub fn get_last_heartbeat(&self, node_id: &NodeId) -> Option<u64> {
        self.records.get(node_id).map(|r| r.last_heartbeat_epoch_sec)
    }

    /// Check all tracked nodes against the timeout threshold.
    ///
    /// Returns a list of `(NodeId, elapsed_seconds)` for all nodes whose last heartbeat
    /// is older than `timeout_sec`.
    pub fn check_timeouts(&mut self, now_sec: u64, timeout_sec: u64) -> Vec<(NodeId, u64)> {
        let mut timed_out = Vec::new();

        for (node_id, record) in self.records.iter_mut() {
            let elapsed = now_sec.saturating_sub(record.last_heartbeat_epoch_sec);
            if elapsed >= timeout_sec {
                record.missed_count = record.missed_count.saturating_add(1);
                timed_out.push((node_id.clone(), elapsed));
            }
        }

        timed_out
    }
}

/// Exponential backoff calculator with bounded duration and jitter (±20%).
#[derive(Debug, Clone, PartialEq)]
pub struct ReconnectBackoff {
    pub min_delay_ms: u64,
    pub max_delay_ms: u64,
    pub multiplier: f64,
    pub jitter_factor: f64,
    pub current_delay_ms: u64,
    pub attempt_count: u32,
}

impl Default for ReconnectBackoff {
    fn default() -> Self {
        Self {
            min_delay_ms: 1000,
            max_delay_ms: 60000,
            multiplier: 2.0,
            jitter_factor: 0.20,
            current_delay_ms: 1000,
            attempt_count: 0,
        }
    }
}

impl ReconnectBackoff {
    pub fn new(min_delay_ms: u64, max_delay_ms: u64) -> Self {
        Self {
            min_delay_ms,
            max_delay_ms,
            multiplier: 2.0,
            jitter_factor: 0.20,
            current_delay_ms: min_delay_ms,
            attempt_count: 0,
        }
    }

    pub fn reset(&mut self) {
        self.current_delay_ms = self.min_delay_ms;
        self.attempt_count = 0;
    }

    /// Calculate next sleep duration with ±20% jitter and advance backoff.
    pub fn next_delay(&mut self) -> std::time::Duration {
        let base = self.current_delay_ms as f64;
        // Pseudo-random jitter between -20% and +20%
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0);
        let ratio = (nanos % 1000) as f64 / 1000.0; // 0.0 to 1.0
        let jitter = (ratio * 2.0 - 1.0) * (base * self.jitter_factor);
        let final_delay = ((base + jitter).round() as u64).max(self.min_delay_ms).min(self.max_delay_ms);

        self.attempt_count += 1;
        self.current_delay_ms = ((self.current_delay_ms as f64 * self.multiplier).round() as u64).min(self.max_delay_ms);

        std::time::Duration::from_millis(final_delay)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_heartbeat_tracker_lifecycle() {
        let mut tracker = HeartbeatTracker::new();
        let node_id = NodeId::new("node-alpha");

        // 1. Record heartbeat at t=100
        tracker.record_heartbeat(&node_id, 100);
        assert_eq!(tracker.get_last_heartbeat(&node_id), Some(100));

        // 2. Check timeouts at t=110 with 15s timeout -> not timed out
        let timeouts = tracker.check_timeouts(110, 15);
        assert!(timeouts.is_empty());

        // 3. Check timeouts at t=120 with 15s timeout -> timed out (elapsed 20s)
        let timeouts = tracker.check_timeouts(120, 15);
        assert_eq!(timeouts.len(), 1);
        assert_eq!(timeouts[0].0, node_id);
        assert_eq!(timeouts[0].1, 20);

        // 4. Remove node
        tracker.remove_node(&node_id);
        assert!(tracker.get_last_heartbeat(&node_id).is_none());
    }

    #[test]
    fn test_reconnect_backoff_growth_and_bounds() {
        let mut backoff = ReconnectBackoff::default();
        assert_eq!(backoff.current_delay_ms, 1000);

        let d1 = backoff.next_delay();
        assert!(d1.as_millis() >= 800 && d1.as_millis() <= 1200);
        assert_eq!(backoff.current_delay_ms, 2000);

        let d2 = backoff.next_delay();
        assert!(d2.as_millis() >= 1600 && d2.as_millis() <= 2400);
        assert_eq!(backoff.current_delay_ms, 4000);

        // Advance to ceiling
        for _ in 0..10 {
            backoff.next_delay();
        }
        assert_eq!(backoff.current_delay_ms, 60000);
        let capped = backoff.next_delay();
        assert!(capped.as_millis() <= 60000);

        // Reset
        backoff.reset();
        assert_eq!(backoff.current_delay_ms, 1000);
        assert_eq!(backoff.attempt_count, 0);
    }
}
