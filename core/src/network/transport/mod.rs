pub mod framing;
pub mod noise;
pub mod session;

pub use framing::{
    read_frame, write_frame, BinaryFrame, FrameHeader, FrameMessageType, FramingError, FRAME_MAGIC,
    MAX_FRAME_SIZE,
};
pub use noise::{
    perform_noise_handshake_initiator, perform_noise_handshake_responder, HandshakeError, NOISE_PATTERN,
};
pub use session::{SecureSession, SessionError, SharedSecureSession};
