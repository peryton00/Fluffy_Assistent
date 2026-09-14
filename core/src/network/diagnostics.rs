use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use once_cell::sync::Lazy;

/// High-performance thread-safe atomic diagnostic counters for Fluffy Network subsystem (OBS-01).
/// All operations use relaxed or acquire/release ordering with zero hot-path serialization overhead.
#[derive(Debug, Default)]
pub struct NetworkDiagnostics {
    pub active_sessions: AtomicUsize,
    pub accepted_connections: AtomicU64,
    pub rejected_connections: AtomicU64,
    pub handshake_timeouts: AtomicU64,
    pub auth_failures: AtomicU64,
    pub reconnect_attempts: AtomicU64,
    pub successful_reconnects: AtomicU64,
    pub admin_commands_dispatched: AtomicU64,
    pub admin_commands_failed: AtomicU64,
    pub admin_commands_timed_out: AtomicU64,
    pub frames_dropped: AtomicU64,
}

/// Point-in-time serializable snapshot of network diagnostic counters
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NetworkDiagnosticsSnapshot {
    pub active_sessions: usize,
    pub accepted_connections: u64,
    pub rejected_connections: u64,
    pub handshake_timeouts: u64,
    pub auth_failures: u64,
    pub reconnect_attempts: u64,
    pub successful_reconnects: u64,
    pub admin_commands_dispatched: u64,
    pub admin_commands_failed: u64,
    pub admin_commands_timed_out: u64,
    pub frames_dropped: u64,
}

static GLOBAL_DIAGNOSTICS: Lazy<NetworkDiagnostics> = Lazy::new(NetworkDiagnostics::default);

/// Access the global shared NetworkDiagnostics instance
pub fn global_diagnostics() -> &'static NetworkDiagnostics {
    &GLOBAL_DIAGNOSTICS
}

impl NetworkDiagnostics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn inc_accepted_connections(&self) {
        self.accepted_connections.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_rejected_connections(&self) {
        self.rejected_connections.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_handshake_timeouts(&self) {
        self.handshake_timeouts.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_auth_failures(&self) {
        self.auth_failures.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_reconnect_attempts(&self) {
        self.reconnect_attempts.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_successful_reconnects(&self) {
        self.successful_reconnects.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_admin_commands_dispatched(&self) {
        self.admin_commands_dispatched.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_admin_commands_failed(&self) {
        self.admin_commands_failed.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_admin_commands_timed_out(&self) {
        self.admin_commands_timed_out.fetch_add(1, Ordering::Relaxed);
    }

    pub fn inc_frames_dropped(&self) {
        self.frames_dropped.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_active_sessions(&self, count: usize) {
        self.active_sessions.store(count, Ordering::Relaxed);
    }

    pub fn inc_active_sessions(&self) -> usize {
        self.active_sessions.fetch_add(1, Ordering::Relaxed) + 1
    }

    pub fn dec_active_sessions(&self) -> usize {
        self.active_sessions.fetch_sub(1, Ordering::Relaxed).saturating_sub(1)
    }

    /// Capture an atomic, lock-free snapshot of all counters
    pub fn snapshot(&self) -> NetworkDiagnosticsSnapshot {
        NetworkDiagnosticsSnapshot {
            active_sessions: self.active_sessions.load(Ordering::Relaxed),
            accepted_connections: self.accepted_connections.load(Ordering::Relaxed),
            rejected_connections: self.rejected_connections.load(Ordering::Relaxed),
            handshake_timeouts: self.handshake_timeouts.load(Ordering::Relaxed),
            auth_failures: self.auth_failures.load(Ordering::Relaxed),
            reconnect_attempts: self.reconnect_attempts.load(Ordering::Relaxed),
            successful_reconnects: self.successful_reconnects.load(Ordering::Relaxed),
            admin_commands_dispatched: self.admin_commands_dispatched.load(Ordering::Relaxed),
            admin_commands_failed: self.admin_commands_failed.load(Ordering::Relaxed),
            admin_commands_timed_out: self.admin_commands_timed_out.load(Ordering::Relaxed),
            frames_dropped: self.frames_dropped.load(Ordering::Relaxed),
        }
    }

    /// Reset all counters (for testing and lifecycle restarts)
    pub fn reset(&self) {
        self.active_sessions.store(0, Ordering::Relaxed);
        self.accepted_connections.store(0, Ordering::Relaxed);
        self.rejected_connections.store(0, Ordering::Relaxed);
        self.handshake_timeouts.store(0, Ordering::Relaxed);
        self.auth_failures.store(0, Ordering::Relaxed);
        self.reconnect_attempts.store(0, Ordering::Relaxed);
        self.successful_reconnects.store(0, Ordering::Relaxed);
        self.admin_commands_dispatched.store(0, Ordering::Relaxed);
        self.admin_commands_failed.store(0, Ordering::Relaxed);
        self.admin_commands_timed_out.store(0, Ordering::Relaxed);
        self.frames_dropped.store(0, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostics_counters_and_snapshot() {
        let diag = NetworkDiagnostics::new();
        diag.inc_accepted_connections();
        diag.inc_accepted_connections();
        diag.inc_rejected_connections();
        diag.inc_handshake_timeouts();
        diag.inc_auth_failures();
        diag.inc_reconnect_attempts();
        diag.inc_successful_reconnects();
        diag.inc_admin_commands_dispatched();
        diag.inc_admin_commands_failed();
        diag.inc_admin_commands_timed_out();
        diag.inc_frames_dropped();

        diag.inc_active_sessions();
        diag.inc_active_sessions();
        diag.dec_active_sessions();

        let snap = diag.snapshot();
        assert_eq!(snap.accepted_connections, 2);
        assert_eq!(snap.rejected_connections, 1);
        assert_eq!(snap.handshake_timeouts, 1);
        assert_eq!(snap.auth_failures, 1);
        assert_eq!(snap.reconnect_attempts, 1);
        assert_eq!(snap.successful_reconnects, 1);
        assert_eq!(snap.admin_commands_dispatched, 1);
        assert_eq!(snap.admin_commands_failed, 1);
        assert_eq!(snap.admin_commands_timed_out, 1);
        assert_eq!(snap.frames_dropped, 1);
        assert_eq!(snap.active_sessions, 1);
    }
}
