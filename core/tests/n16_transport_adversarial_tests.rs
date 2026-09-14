//! Phase N16: Noise XX & Binary Framing Adversarial Tests
//!
//! Validates:
//! - Malformed frame headers, magic mismatch, oversized frames (> 16 MiB)
//! - Truncated frames, zero-length allocations, stream corruption
//! - ChaCha20-Poly1305 ciphertext tampering and tag verification failure
//! - TrustedPeerStore adversarial rejection (revoked keys, identity mismatches, un-paired attackers)

use std::io::Cursor;
use fluffy_core::network::crypto::{NodeKeypair, TrustEvaluation, TrustedPeerStore};
use fluffy_core::network::ids::NodeId;
use fluffy_core::network::transport::framing::{
    read_frame, FramingError, FRAME_MAGIC, MAX_FRAME_SIZE,
};
use fluffy_core::network::transport::noise::{perform_noise_handshake_initiator, perform_noise_handshake_responder};
use fluffy_core::network::transport::SecureSession;

#[tokio::test]
async fn test_adversarial_framing_magic_mismatch_rejected() {
    let mut bad_magic_bytes = vec![0x99, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0x04, 0x01, 0x02, 0x03, 0x04];
    let mut cursor = Cursor::new(&mut bad_magic_bytes);

    let res = read_frame(&mut cursor).await;
    assert!(matches!(res, Err(FramingError::InvalidMagic([0x99, 0x99]))));
}

#[tokio::test]
async fn test_adversarial_framing_oversized_payload_rejected_before_buffer_allocation() {
    // Construct frame header claiming 32 MiB payload (> 16 MiB max allowed)
    let payload_len: u32 = 32 * 1024 * 1024;
    let mut header_bytes = vec![
        FRAME_MAGIC[0], FRAME_MAGIC[1],
        0x01, // Version 1
        0x00, // Minor 0
        0x02, // EncryptedPayload
        0x00, // Flags 0
    ];
    header_bytes.extend_from_slice(&payload_len.to_be_bytes());

    let mut cursor = Cursor::new(header_bytes);
    let res = read_frame(&mut cursor).await;

    match res {
        Err(FramingError::FrameTooLarge { declared, max }) => {
            assert_eq!(declared, payload_len as usize);
            assert_eq!(max, MAX_FRAME_SIZE);
        }
        other => panic!("Expected FrameTooLarge error, got {:?}", other),
    }
}

#[tokio::test]
async fn test_adversarial_framing_truncated_stream_handled_cleanly() {
    // Only 4 bytes of an 8-byte header
    let truncated_bytes = vec![FRAME_MAGIC[0], FRAME_MAGIC[1], 0x01, 0x01];
    let mut cursor = Cursor::new(truncated_bytes);

    let res = read_frame(&mut cursor).await;
    assert!(matches!(res, Err(FramingError::ConnectionClosed)));
}

#[tokio::test]
async fn test_adversarial_tampered_ciphertext_fails_decryption_without_panic() {
    let server_keypair = NodeKeypair::generate().unwrap();
    let client_keypair = NodeKeypair::generate().unwrap();

    let (mut client_io, mut server_io) = tokio::io::duplex(65536);

    // Handshake
    let client_task = tokio::spawn(async move {
        perform_noise_handshake_initiator(&mut client_io, &client_keypair).await
    });
    let server_task = tokio::spawn(async move {
        perform_noise_handshake_responder(&mut server_io, &server_keypair).await
    });

    let (client_transport, _server_pub) = client_task.await.unwrap().unwrap();
    let (server_transport, _client_pub) = server_task.await.unwrap().unwrap();

    let mut client_session = SecureSession::new(NodeId::new("server"), _server_pub, client_transport);
    let mut server_session = SecureSession::new(NodeId::new("client"), _client_pub, server_transport);

    // Client encrypts message
    let plaintext = b"AdminCommand: sensitive operation";
    let mut ciphertext = client_session.encrypt(plaintext).unwrap();

    // Attacker tampers with 1 byte of the ciphertext
    if let Some(byte) = ciphertext.get_mut(5) {
        *byte ^= 0xFF;
    }

    // Server attempts decryption -> Poly1305 MAC tag failure
    let dec_res = server_session.decrypt(&ciphertext);
    assert!(dec_res.is_err(), "Tampered ciphertext must fail authentication");
}

#[test]
fn test_trusted_peer_store_adversarial_identity_mismatch_and_revocation() {
    let mut store = TrustedPeerStore::new();

    let node_id = NodeId::new("target-node-alpha");
    let genuine_key = NodeKeypair::generate().unwrap().public;
    let attacker_key = NodeKeypair::generate().unwrap().public;

    // 1. Initial pairing binds genuine key to target-node-alpha
    store.add_trusted_peer(node_id.clone(), genuine_key.clone());

    // 2. Genuine peer evaluated -> Trusted
    assert_eq!(
        store.evaluate_peer(&node_id, &genuine_key),
        TrustEvaluation::Trusted
    );

    // 3. Attacker presents different key for target-node-alpha -> Identity Mismatch
    match store.evaluate_peer(&node_id, &attacker_key) {
        TrustEvaluation::IdentityMismatch { expected_key, actual_key } => {
            assert_eq!(expected_key, genuine_key);
            assert_eq!(actual_key, attacker_key);
        }
        other => panic!("Expected IdentityMismatch, got {:?}", other),
    }

    // 4. Revoke genuine peer -> Revoked
    assert!(store.revoke_peer(&node_id));
    assert_eq!(
        store.evaluate_peer(&node_id, &genuine_key),
        TrustEvaluation::Revoked
    );

    // 5. Unknown node ID -> Unknown
    let unknown_node = NodeId::new("stranger-node");
    assert_eq!(
        store.evaluate_peer(&unknown_node, &genuine_key),
        TrustEvaluation::Unknown
    );
}
