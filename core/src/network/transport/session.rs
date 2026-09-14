use std::collections::{HashSet, VecDeque};
use std::fmt;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::network::api::version::NetworkProtocolVersion;
use crate::network::crypto::keys::PublicKey;
use crate::network::ids::NodeId;

/// Default capacity for bounded sliding-window RequestId replay cache (RES-04)
pub const DEFAULT_MAX_SEEN_REQUEST_IDS: usize = 10_000;

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Errors occurring within an active secure cryptographic session.
#[derive(Debug)]
pub enum SessionError {
    EncryptionFailed(snow::Error),
    DecryptionFailed(snow::Error),
    DuplicateRequestId(String),
    SessionExpired,
    Closed,
}

impl fmt::Display for SessionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SessionError::EncryptionFailed(e) => write!(f, "AEAD encryption failed: {:?}", e),
            SessionError::DecryptionFailed(e) => write!(f, "AEAD decryption failed: {:?}", e),
            SessionError::DuplicateRequestId(id) => write!(f, "Duplicate request ID within session rejected: {}", id),
            SessionError::SessionExpired => write!(f, "Secure session has expired due to inactivity"),
            SessionError::Closed => write!(f, "Secure session has been closed"),
        }
    }
}

impl std::error::Error for SessionError {}

/// Authoritative representation of an active, cryptographically authenticated peer transport session.
pub struct SecureSession {
    pub session_id: String,
    pub node_id: NodeId,
    pub peer_public_key: PublicKey,
    pub protocol_version: NetworkProtocolVersion,
    pub transport_mode: String,
    pub authenticated: bool,
    pub cryptographically_verified: bool,
    pub established_at_epoch_ms: u64,
    pub last_activity_epoch_ms: u64,
    transport: snow::TransportState,
    seen_request_ids: HashSet<String>,
    seen_request_order: VecDeque<String>,
    max_seen_request_ids: usize,
}

impl fmt::Debug for SecureSession {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SecureSession")
            .field("session_id", &self.session_id)
            .field("node_id", &self.node_id)
            .field("peer_public_key", &self.peer_public_key)
            .field("protocol_version", &self.protocol_version)
            .field("transport_mode", &self.transport_mode)
            .field("authenticated", &self.authenticated)
            .field("cryptographically_verified", &self.cryptographically_verified)
            .field("established_at_epoch_ms", &self.established_at_epoch_ms)
            .field("last_activity_epoch_ms", &self.last_activity_epoch_ms)
            .finish()
    }
}

impl SecureSession {
    /// Create a new active secure session with default bounded replay window (10,000 IDs)
    pub fn new(
        node_id: NodeId,
        peer_public_key: PublicKey,
        transport: snow::TransportState,
    ) -> Self {
        Self::new_with_replay_limit(node_id, peer_public_key, transport, DEFAULT_MAX_SEEN_REQUEST_IDS)
    }

    /// Create a new active secure session with custom replay window capacity
    pub fn new_with_replay_limit(
        node_id: NodeId,
        peer_public_key: PublicKey,
        transport: snow::TransportState,
        max_seen_request_ids: usize,
    ) -> Self {
        let now = current_epoch_ms();
        Self {
            session_id: format!("sess_noise_{}", Uuid::new_v4()),
            node_id,
            peer_public_key,
            protocol_version: NetworkProtocolVersion::new(1, 1),
            transport_mode: "authenticated_secure".into(),
            authenticated: true,
            cryptographically_verified: true,
            established_at_epoch_ms: now,
            last_activity_epoch_ms: now,
            transport,
            seen_request_ids: HashSet::new(),
            seen_request_order: VecDeque::new(),
            max_seen_request_ids: max_seen_request_ids.max(1),
        }
    }

    /// Encrypt plaintext using ChaCha20-Poly1305 session cipher. Updates activity timestamp.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, SessionError> {
        let mut ciphertext = vec![0u8; plaintext.len() + 16]; // Poly1305 MAC tag overhead = 16 bytes
        let len = self.transport
            .write_message(plaintext, &mut ciphertext)
            .map_err(SessionError::EncryptionFailed)?;
        ciphertext.truncate(len);
        self.last_activity_epoch_ms = current_epoch_ms();
        Ok(ciphertext)
    }

    /// Decrypt ciphertext using ChaCha20-Poly1305 session cipher. Updates activity timestamp.
    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, SessionError> {
        let mut plaintext = vec![0u8; ciphertext.len()];
        let len = self.transport
            .read_message(ciphertext, &mut plaintext)
            .map_err(SessionError::DecryptionFailed)?;
        plaintext.truncate(len);
        self.last_activity_epoch_ms = current_epoch_ms();
        Ok(plaintext)
    }

    /// Record a RequestId for replay detection within a bounded sliding window. Rejects duplicate IDs.
    pub fn record_request_id(&mut self, request_id: &str) -> Result<(), SessionError> {
        if self.seen_request_ids.contains(request_id) {
            return Err(SessionError::DuplicateRequestId(request_id.to_string()));
        }

        if self.seen_request_order.len() >= self.max_seen_request_ids {
            if let Some(oldest) = self.seen_request_order.pop_front() {
                self.seen_request_ids.remove(&oldest);
            }
        }

        self.seen_request_ids.insert(request_id.to_string());
        self.seen_request_order.push_back(request_id.to_string());
        Ok(())
    }

    /// Check if session has timed out due to idle duration exceeding threshold
    pub fn is_expired(&self, max_idle_ms: u64) -> bool {
        let now = current_epoch_ms();
        now.saturating_sub(self.last_activity_epoch_ms) > max_idle_ms
    }
}

/// Shared thread-safe handle for a SecureSession
pub type SharedSecureSession = Arc<Mutex<SecureSession>>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::crypto::keys::NodeKeypair;
    use crate::network::transport::noise::{perform_noise_handshake_initiator, perform_noise_handshake_responder};
    use tokio::io::duplex;

    #[tokio::test]
    async fn test_secure_session_encryption_and_replay_detection() {
        let (mut client_stream, mut server_stream) = duplex(65536);

        let k1 = NodeKeypair::generate().unwrap();
        let k2 = NodeKeypair::generate().unwrap();

        let client_pub = k1.public;
        let server_pub = k2.public;

        let client_task = tokio::spawn(async move {
            perform_noise_handshake_initiator(&mut client_stream, &k1).await
        });
        let server_task = tokio::spawn(async move {
            perform_noise_handshake_responder(&mut server_stream, &k2).await
        });

        let (client_res, server_res) = tokio::join!(client_task, server_task);
        let (client_transport, _) = client_res.unwrap().unwrap();
        let (server_transport, _) = server_res.unwrap().unwrap();

        let mut client_session = SecureSession::new(NodeId::new("server_node"), server_pub, client_transport);
        let mut server_session = SecureSession::new(NodeId::new("client_node"), client_pub, server_transport);

        // 1. Test Encrypt/Decrypt
        let secret_msg = b"execute Process.List";
        let ciphertext = client_session.encrypt(secret_msg).expect("encryption failed");
        assert_ne!(&ciphertext, secret_msg);

        let decrypted = server_session.decrypt(&ciphertext).expect("decryption failed");
        assert_eq!(&decrypted, secret_msg);

        // 2. Test RequestId replay detection within session
        let req_id = "req_12345";
        assert!(server_session.record_request_id(req_id).is_ok());
        // Duplicate submission of same request ID fails
        assert!(matches!(
            server_session.record_request_id(req_id),
            Err(SessionError::DuplicateRequestId(_))
        ));
    }

    #[tokio::test]
    async fn test_bounded_replay_cache_eviction() {
        let (mut client_stream, mut server_stream) = duplex(65536);
        let k1 = NodeKeypair::generate().unwrap();
        let k2 = NodeKeypair::generate().unwrap();

        let client_pub = k1.public;
        let client_task = tokio::spawn(async move {
            perform_noise_handshake_initiator(&mut client_stream, &k1).await
        });
        let server_task = tokio::spawn(async move {
            perform_noise_handshake_responder(&mut server_stream, &k2).await
        });

        let (_, server_res) = tokio::join!(client_task, server_task);
        let (server_transport, _) = server_res.unwrap().unwrap();

        // Create session with capacity of 3 request IDs
        let mut session = SecureSession::new_with_replay_limit(
            NodeId::new("client_node"),
            client_pub,
            server_transport,
            3,
        );

        assert!(session.record_request_id("req-1").is_ok());
        assert!(session.record_request_id("req-2").is_ok());
        assert!(session.record_request_id("req-3").is_ok());

        // Duplicate req-1 is rejected while in sliding window
        assert!(session.record_request_id("req-1").is_err());

        // Insert 4th request ID -> pushes out oldest ("req-1")
        assert!(session.record_request_id("req-4").is_ok());

        // "req-1" is now evicted from the sliding window
        assert!(session.record_request_id("req-1").is_ok());
        // "req-2", "req-3", "req-4" were present, now "req-2" was pushed out by re-inserting "req-1"
        assert!(session.record_request_id("req-4").is_err());
    }
}
