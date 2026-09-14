use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::network::crypto::keys::PublicKey;
use crate::network::ids::NodeId;

fn current_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Cryptographic trust classification for a cluster peer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustStatus {
    /// Peer is not known in the trusted store
    Unknown,
    /// First contact / pairing handshake initiated; awaiting manual or policy confirmation
    PendingTrust,
    /// Cryptographically verified and trusted static key
    Trusted,
    /// Explicitly revoked; connections must be rejected
    Revoked,
    /// NodeId matches existing record but presented static key is different (potential spoofing or rotated key)
    IdentityMismatch,
}

impl Default for TrustStatus {
    fn default() -> Self {
        TrustStatus::Unknown
    }
}

/// Representation of a trusted remote Fluffy cluster node and its bound static public key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrustedPeer {
    /// Canonical logical NodeId of the peer
    pub node_id: NodeId,
    /// Static X25519 public key bound to this NodeId
    pub static_public_key: PublicKey,
    /// Hex fingerprint string for visual verification
    pub fingerprint: String,
    /// Epoch timestamp (seconds) when trust was established
    pub trusted_at_epoch_s: u64,
    /// Monotonic key version for future key rotation
    pub key_version: u32,
    /// Current trust status
    pub status: TrustStatus,
}

impl TrustedPeer {
    pub fn new(node_id: NodeId, static_public_key: PublicKey) -> Self {
        let fingerprint = static_public_key.fingerprint();
        Self {
            node_id,
            static_public_key,
            fingerprint,
            trusted_at_epoch_s: current_epoch_seconds(),
            key_version: 1,
            status: TrustStatus::Trusted,
        }
    }
}

/// Result of evaluating a peer's presented static key against the trusted store.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrustEvaluation {
    /// Peer is recognized and public key matches exactly
    Trusted,
    /// Peer is not present in the trusted store
    Unknown,
    /// Peer static key was previously revoked
    Revoked,
    /// Peer NodeId is present in the store but presented static key does NOT match the trusted key
    IdentityMismatch {
        expected_key: PublicKey,
        actual_key: PublicKey,
    },
    /// Peer is in pending trust state
    PendingTrust,
}

/// Persistent store of trusted cluster peers and static key bindings.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrustedPeerStore {
    peers: HashMap<NodeId, TrustedPeer>,
}

impl TrustedPeerStore {
    pub fn new() -> Self {
        Self {
            peers: HashMap::new(),
        }
    }

    /// Retrieve default file path for the trusted peer store
    pub fn default_store_path() -> PathBuf {
        let base = dirs::data_local_dir()
            .map(|p| p.join("Fluffy"))
            .or_else(|| dirs::home_dir().map(|p| p.join(".fluffy")))
            .unwrap_or_else(|| PathBuf::from("."));
        base.join("cluster").join("paired_nodes.json")
    }

    /// Retrieve trusted peer record by NodeId
    pub fn get(&self, node_id: &NodeId) -> Option<&TrustedPeer> {
        self.peers.get(node_id)
    }

    /// Evaluate a presented public key for a given NodeId
    pub fn evaluate_peer(&self, node_id: &NodeId, reported_pubkey: &PublicKey) -> TrustEvaluation {
        match self.peers.get(node_id) {
            None => TrustEvaluation::Unknown,
            Some(peer) => match peer.status {
                TrustStatus::Revoked => TrustEvaluation::Revoked,
                TrustStatus::PendingTrust => TrustEvaluation::PendingTrust,
                TrustStatus::IdentityMismatch => TrustEvaluation::IdentityMismatch {
                    expected_key: peer.static_public_key,
                    actual_key: *reported_pubkey,
                },
                TrustStatus::Trusted => {
                    if peer.static_public_key == *reported_pubkey {
                        TrustEvaluation::Trusted
                    } else {
                        TrustEvaluation::IdentityMismatch {
                            expected_key: peer.static_public_key,
                            actual_key: *reported_pubkey,
                        }
                    }
                }
                TrustStatus::Unknown => TrustEvaluation::Unknown,
            },
        }
    }

    /// Add or update a trusted peer
    pub fn add_trusted_peer(&mut self, node_id: NodeId, public_key: PublicKey) {
        let peer = TrustedPeer::new(node_id.clone(), public_key);
        self.peers.insert(node_id, peer);
    }

    /// Explicitly mark a peer as revoked
    pub fn revoke_peer(&mut self, node_id: &NodeId) -> bool {
        if let Some(peer) = self.peers.get_mut(node_id) {
            peer.status = TrustStatus::Revoked;
            true
        } else {
            false
        }
    }

    /// Remove a peer from the store
    pub fn remove_peer(&mut self, node_id: &NodeId) -> bool {
        self.peers.remove(node_id).is_some()
    }

    /// List all trusted peers
    pub fn list_trusted_peers(&self) -> Vec<TrustedPeer> {
        self.peers.values().cloned().collect()
    }

    /// Save trusted peer store to JSON file
    pub fn save_to_file(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Serialization error: {}", e))?;
        fs::write(path, json).map_err(|e| format!("Failed to write trusted peers file: {}", e))?;
        Ok(())
    }

    /// Load trusted peer store from JSON file (or empty store if missing)
    pub fn load_or_default(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self::new());
        }
        let bytes = fs::read(path).map_err(|e| format!("Failed to read trusted peers file: {}", e))?;
        let store = serde_json::from_slice(&bytes)
            .map_err(|e| format!("Failed to parse trusted peers JSON: {}", e))?;
        Ok(store)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trusted_peer_store_lifecycle() {
        let mut store = TrustedPeerStore::new();
        let node_a = NodeId::new("node_alpha");
        let key_a = PublicKey::new([1u8; 32]);
        let key_a_other = PublicKey::new([2u8; 32]);

        // 1. Unknown initially
        assert_eq!(store.evaluate_peer(&node_a, &key_a), TrustEvaluation::Unknown);

        // 2. Add trusted peer
        store.add_trusted_peer(node_a.clone(), key_a);
        assert_eq!(store.evaluate_peer(&node_a, &key_a), TrustEvaluation::Trusted);

        // 3. Identity mismatch when same node presents different key
        match store.evaluate_peer(&node_a, &key_a_other) {
            TrustEvaluation::IdentityMismatch { expected_key, actual_key } => {
                assert_eq!(expected_key, key_a);
                assert_eq!(actual_key, key_a_other);
            }
            other => panic!("Expected IdentityMismatch, got {:?}", other),
        }

        // 4. Revoke peer
        assert!(store.revoke_peer(&node_a));
        assert_eq!(store.evaluate_peer(&node_a, &key_a), TrustEvaluation::Revoked);

        // 5. Remove peer
        assert!(store.remove_peer(&node_a));
        assert_eq!(store.evaluate_peer(&node_a, &key_a), TrustEvaluation::Unknown);
    }
}
