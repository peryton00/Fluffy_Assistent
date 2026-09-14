use std::fmt;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::network::crypto::keys::{NodeKeypair, PublicKey};
use crate::network::transport::framing::{read_frame, write_frame, BinaryFrame, FrameMessageType, FramingError};

pub const NOISE_PATTERN: &str = "Noise_XX_25519_ChaChaPoly_SHA256";

/// Error types occurring during Noise_XX cryptographic handshake.
#[derive(Debug)]
pub enum HandshakeError {
    Noise(snow::Error),
    Framing(FramingError),
    ProtocolMismatch(String),
    MissingRemoteStaticKey,
    InvalidKeyLength,
    Io(std::io::Error),
}

impl fmt::Display for HandshakeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HandshakeError::Noise(e) => write!(f, "Noise handshake error: {:?}", e),
            HandshakeError::Framing(e) => write!(f, "Framing error during handshake: {}", e),
            HandshakeError::ProtocolMismatch(s) => write!(f, "Protocol mismatch: {}", s),
            HandshakeError::MissingRemoteStaticKey => write!(f, "Handshake completed without peer static public key"),
            HandshakeError::InvalidKeyLength => write!(f, "Remote public key has invalid byte length"),
            HandshakeError::Io(e) => write!(f, "IO error during handshake: {}", e),
        }
    }
}

impl std::error::Error for HandshakeError {}

impl From<snow::Error> for HandshakeError {
    fn from(e: snow::Error) -> Self {
        HandshakeError::Noise(e)
    }
}

impl From<FramingError> for HandshakeError {
    fn from(e: FramingError) -> Self {
        HandshakeError::Framing(e)
    }
}

impl From<std::io::Error> for HandshakeError {
    fn from(e: std::io::Error) -> Self {
        HandshakeError::Io(e)
    }
}

/// Perform mutual Noise_XX handshake as the initiator (client / connecting peer).
/// Returns the initialized `snow::TransportState` and the verified remote static `PublicKey`.
pub async fn perform_noise_handshake_initiator<S>(
    stream: &mut S,
    local_keypair: &NodeKeypair,
) -> Result<(snow::TransportState, PublicKey), HandshakeError>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let params: snow::params::NoiseParams = NOISE_PATTERN.parse().map_err(snow::Error::from)?;
    let mut handshake = snow::Builder::new(params)
        .local_private_key(local_keypair.private_bytes())
        .build_initiator()?;

    let mut msg_buf = vec![0u8; 65535];

    // 1. Initiator -> Message 1 (-> e)
    let len1 = handshake.write_message(&[], &mut msg_buf)?;
    let frame1 = BinaryFrame::new(FrameMessageType::Handshake, msg_buf[..len1].to_vec());
    write_frame(stream, &frame1).await?;

    // 2. Initiator <- Message 2 (<- e, ee, s, es)
    let frame2 = read_frame(stream).await?;
    if frame2.header.message_type != FrameMessageType::Handshake {
        return Err(HandshakeError::ProtocolMismatch(format!(
            "Expected Handshake message type (1), received {:?}",
            frame2.header.message_type
        )));
    }
    let mut payload_buf = vec![0u8; 65535];
    handshake.read_message(&frame2.payload, &mut payload_buf)?;

    // 3. Initiator -> Message 3 (-> s, se)
    let len3 = handshake.write_message(&[], &mut msg_buf)?;
    let frame3 = BinaryFrame::new(FrameMessageType::Handshake, msg_buf[..len3].to_vec());
    write_frame(stream, &frame3).await?;

    // Extract remote static key
    let remote_static = handshake.get_remote_static().ok_or(HandshakeError::MissingRemoteStaticKey)?;
    if remote_static.len() != 32 {
        return Err(HandshakeError::InvalidKeyLength);
    }
    let mut pub_bytes = [0u8; 32];
    pub_bytes.copy_from_slice(remote_static);

    let transport = handshake.into_transport_mode()?;
    Ok((transport, PublicKey(pub_bytes)))
}

/// Perform mutual Noise_XX handshake as the responder (server / listening node).
/// Returns the initialized `snow::TransportState` and the verified remote static `PublicKey`.
pub async fn perform_noise_handshake_responder<S>(
    stream: &mut S,
    local_keypair: &NodeKeypair,
) -> Result<(snow::TransportState, PublicKey), HandshakeError>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let params: snow::params::NoiseParams = NOISE_PATTERN.parse().map_err(snow::Error::from)?;
    let mut handshake = snow::Builder::new(params)
        .local_private_key(local_keypair.private_bytes())
        .build_responder()?;

    let mut msg_buf = vec![0u8; 65535];
    let mut payload_buf = vec![0u8; 65535];

    // 1. Responder <- Message 1 (-> e)
    let frame1 = read_frame(stream).await?;
    if frame1.header.message_type != FrameMessageType::Handshake {
        return Err(HandshakeError::ProtocolMismatch(format!(
            "Expected Handshake message type (1), received {:?}",
            frame1.header.message_type
        )));
    }
    handshake.read_message(&frame1.payload, &mut payload_buf)?;

    // 2. Responder -> Message 2 (<- e, ee, s, es)
    let len2 = handshake.write_message(&[], &mut msg_buf)?;
    let frame2 = BinaryFrame::new(FrameMessageType::Handshake, msg_buf[..len2].to_vec());
    write_frame(stream, &frame2).await?;

    // 3. Responder <- Message 3 (-> s, se)
    let frame3 = read_frame(stream).await?;
    if frame3.header.message_type != FrameMessageType::Handshake {
        return Err(HandshakeError::ProtocolMismatch(format!(
            "Expected Handshake message type (1), received {:?}",
            frame3.header.message_type
        )));
    }
    handshake.read_message(&frame3.payload, &mut payload_buf)?;

    // Extract remote static key
    let remote_static = handshake.get_remote_static().ok_or(HandshakeError::MissingRemoteStaticKey)?;
    if remote_static.len() != 32 {
        return Err(HandshakeError::InvalidKeyLength);
    }
    let mut pub_bytes = [0u8; 32];
    pub_bytes.copy_from_slice(remote_static);

    let transport = handshake.into_transport_mode()?;
    Ok((transport, PublicKey(pub_bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn test_noise_xx_handshake_end_to_end() {
        let (mut client_stream, mut server_stream) = duplex(65536);

        let client_keys = NodeKeypair::generate().expect("client key generation failed");
        let server_keys = NodeKeypair::generate().expect("server key generation failed");

        let client_pub = client_keys.public;
        let server_pub = server_keys.public;

        let client_task = tokio::spawn(async move {
            perform_noise_handshake_initiator(&mut client_stream, &client_keys).await
        });

        let server_task = tokio::spawn(async move {
            perform_noise_handshake_responder(&mut server_stream, &server_keys).await
        });

        let (client_res, server_res) = tokio::join!(client_task, server_task);

        let (mut client_transport, remote_server_pub) = client_res.unwrap().expect("client handshake failed");
        let (mut server_transport, remote_client_pub) = server_res.unwrap().expect("server handshake failed");

        assert_eq!(remote_server_pub, server_pub);
        assert_eq!(remote_client_pub, client_pub);

        // Test transport encryption/decryption between peers
        let plaintext = b"fluffy authenticated payload";
        let mut ciphertext = vec![0u8; plaintext.len() + 16];
        let len = client_transport.write_message(plaintext, &mut ciphertext).unwrap();

        let mut decrypted = vec![0u8; len];
        let dec_len = server_transport.read_message(&ciphertext[..len], &mut decrypted).unwrap();

        assert_eq!(&decrypted[..dec_len], plaintext);
    }
}
