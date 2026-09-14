use std::fmt;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// Magic header bytes for Fluffy binary framing ("FL").
pub const FRAME_MAGIC: [u8; 2] = [0x46, 0x4C];

/// Fixed header length in bytes (2 magic + 1 major + 1 minor + 1 msg_type + 1 flags + 4 length).
pub const FIXED_HEADER_SIZE: usize = 10;

/// Maximum allowable frame payload size (16 MiB). Prevents unbounded allocation DoS.
pub const MAX_FRAME_SIZE: usize = 16 * 1024 * 1024;

/// Message types supported in the binary frame header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum FrameMessageType {
    /// Noise handshake message (message 1, 2, or 3)
    Handshake = 1,
    /// Encrypted Noise transport payload (ChaCha20-Poly1305 AEAD ciphertext)
    EncryptedPayload = 2,
    /// Authenticated session heartbeat / ping
    Heartbeat = 3,
    /// Graceful session close notification
    Close = 4,
    /// Unrecognized / custom message type
    Unknown(u8),
}

impl From<u8> for FrameMessageType {
    fn from(byte: u8) -> Self {
        match byte {
            1 => FrameMessageType::Handshake,
            2 => FrameMessageType::EncryptedPayload,
            3 => FrameMessageType::Heartbeat,
            4 => FrameMessageType::Close,
            other => FrameMessageType::Unknown(other),
        }
    }
}

impl From<FrameMessageType> for u8 {
    fn from(msg_type: FrameMessageType) -> Self {
        match msg_type {
            FrameMessageType::Handshake => 1,
            FrameMessageType::EncryptedPayload => 2,
            FrameMessageType::Heartbeat => 3,
            FrameMessageType::Close => 4,
            FrameMessageType::Unknown(b) => b,
        }
    }
}

/// Binary frame header structure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrameHeader {
    pub magic: [u8; 2],
    pub version_major: u8,
    pub version_minor: u8,
    pub message_type: FrameMessageType,
    pub flags: u8,
    pub payload_len: u32,
}

impl FrameHeader {
    pub fn new(version_major: u8, version_minor: u8, message_type: FrameMessageType, payload_len: u32) -> Self {
        Self {
            magic: FRAME_MAGIC,
            version_major,
            version_minor,
            message_type,
            flags: 0,
            payload_len,
        }
    }

    pub fn to_bytes(&self) -> [u8; FIXED_HEADER_SIZE] {
        let mut buf = [0u8; FIXED_HEADER_SIZE];
        buf[0..2].copy_from_slice(&self.magic);
        buf[2] = self.version_major;
        buf[3] = self.version_minor;
        buf[4] = self.message_type.into();
        buf[5] = self.flags;
        buf[6..10].copy_from_slice(&self.payload_len.to_be_bytes());
        buf
    }

    pub fn from_bytes(buf: &[u8; FIXED_HEADER_SIZE]) -> Result<Self, FramingError> {
        if buf[0..2] != FRAME_MAGIC {
            return Err(FramingError::InvalidMagic([buf[0], buf[1]]));
        }
        let version_major = buf[2];
        let version_minor = buf[3];
        if version_major != 1 {
            return Err(FramingError::UnsupportedVersion {
                major: version_major,
                minor: version_minor,
            });
        }
        let message_type = FrameMessageType::from(buf[4]);
        let flags = buf[5];
        let payload_len = u32::from_be_bytes([buf[6], buf[7], buf[8], buf[9]]);

        if payload_len as usize > MAX_FRAME_SIZE {
            return Err(FramingError::FrameTooLarge {
                declared: payload_len as usize,
                max: MAX_FRAME_SIZE,
            });
        }

        Ok(Self {
            magic: [buf[0], buf[1]],
            version_major,
            version_minor,
            message_type,
            flags,
            payload_len,
        })
    }
}

/// Structured binary frame containing header and payload bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BinaryFrame {
    pub header: FrameHeader,
    pub payload: Vec<u8>,
}

impl BinaryFrame {
    pub fn new(message_type: FrameMessageType, payload: Vec<u8>) -> Self {
        let header = FrameHeader::new(1, 1, message_type, payload.len() as u32);
        Self { header, payload }
    }
}

/// Errors encountered during binary frame decoding and encoding.
#[derive(Debug)]
pub enum FramingError {
    InvalidMagic([u8; 2]),
    UnsupportedVersion { major: u8, minor: u8 },
    FrameTooLarge { declared: usize, max: usize },
    TruncatedFrame { expected: usize, actual: usize },
    ConnectionClosed,
    Io(std::io::Error),
}

impl fmt::Display for FramingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FramingError::InvalidMagic(m) => write!(f, "Invalid frame magic: [0x{:02x}, 0x{:02x}]", m[0], m[1]),
            FramingError::UnsupportedVersion { major, minor } => {
                write!(f, "Unsupported protocol version: {}.{}", major, minor)
            }
            FramingError::FrameTooLarge { declared, max } => {
                write!(f, "Frame payload declared {} bytes, exceeds maximum {} bytes", declared, max)
            }
            FramingError::TruncatedFrame { expected, actual } => {
                write!(f, "Truncated frame: expected {} payload bytes, read {}", expected, actual)
            }
            FramingError::ConnectionClosed => write!(f, "Connection closed while reading frame"),
            FramingError::Io(e) => write!(f, "IO error: {}", e),
        }
    }
}

impl std::error::Error for FramingError {}

impl From<std::io::Error> for FramingError {
    fn from(e: std::io::Error) -> Self {
        FramingError::Io(e)
    }
}

/// Read a single length-validated binary frame from an asynchronous stream.
/// Strict invariant: Fixed header is read and validated BEFORE any payload buffer is allocated.
pub async fn read_frame<R: AsyncRead + Unpin>(reader: &mut R) -> Result<BinaryFrame, FramingError> {
    let mut header_buf = [0u8; FIXED_HEADER_SIZE];
    match reader.read_exact(&mut header_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Err(FramingError::ConnectionClosed),
        Err(e) => return Err(FramingError::Io(e)),
    }

    // Validate header and declared length BEFORE allocating payload
    let header = FrameHeader::from_bytes(&header_buf)?;

    let payload_len = header.payload_len as usize;
    let mut payload = vec![0u8; payload_len];

    if payload_len > 0 {
        match reader.read_exact(&mut payload).await {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                return Err(FramingError::TruncatedFrame {
                    expected: payload_len,
                    actual: 0,
                });
            }
            Err(e) => return Err(FramingError::Io(e)),
        }
    }

    Ok(BinaryFrame { header, payload })
}

/// Write a single binary frame to an asynchronous stream.
pub async fn write_frame<W: AsyncWrite + Unpin>(writer: &mut W, frame: &BinaryFrame) -> Result<(), FramingError> {
    let header_bytes = frame.header.to_bytes();
    writer.write_all(&header_bytes).await?;
    if !frame.payload.is_empty() {
        writer.write_all(&frame.payload).await?;
    }
    writer.flush().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_frame_encode_decode_roundtrip() {
        let payload = b"hello secure world".to_vec();
        let frame = BinaryFrame::new(FrameMessageType::EncryptedPayload, payload.clone());

        let mut buffer = Vec::new();
        write_frame(&mut buffer, &frame).await.expect("write_frame failed");

        let mut cursor = std::io::Cursor::new(buffer);
        let read = read_frame(&mut cursor).await.expect("read_frame failed");

        assert_eq!(read.header.magic, FRAME_MAGIC);
        assert_eq!(read.header.version_major, 1);
        assert_eq!(read.header.version_minor, 1);
        assert_eq!(read.header.message_type, FrameMessageType::EncryptedPayload);
        assert_eq!(read.payload, payload);
    }

    #[tokio::test]
    async fn test_invalid_magic_rejected() {
        let mut corrupted = [0u8; FIXED_HEADER_SIZE];
        corrupted[0] = 0xFF; // Invalid magic
        corrupted[1] = 0xFF;

        let res = FrameHeader::from_bytes(&corrupted);
        assert!(matches!(res, Err(FramingError::InvalidMagic(_))));
    }

    #[tokio::test]
    async fn test_oversized_frame_rejected_before_allocation() {
        let mut header = [0u8; FIXED_HEADER_SIZE];
        header[0..2].copy_from_slice(&FRAME_MAGIC);
        header[2] = 1; // Major version
        header[3] = 1; // Minor version
        header[4] = 2; // EncryptedPayload
        let oversized: u32 = (32 * 1024 * 1024) as u32; // 32 MiB > 16 MiB
        header[6..10].copy_from_slice(&oversized.to_be_bytes());

        let res = FrameHeader::from_bytes(&header);
        assert!(matches!(res, Err(FramingError::FrameTooLarge { .. })));
    }
}
