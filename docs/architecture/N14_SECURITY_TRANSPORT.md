# Phase N14: Protocol & Security Hardening - Implementation Specification

## Executive Summary

Phase N14 implements cryptographic protocol and security hardening for remote cluster operations in Fluffy Desktop. It establishes mutual authentication, perfect forward secrecy, and AEAD-encrypted transport sessions using the Noise Protocol Framework (`Noise_XX_25519_ChaChaPoly_SHA256`) over length-prefixed binary frames, while preserving all N13 administrative boundaries, permission policies, and audit guarantees.

---

## 1. Target Architecture & Boundary Enforcement

```text
React / Tauri UI
        ↓ (IPC: network_execute_admin_command)
Network API (contracts.rs)
        ↓
AdminCommandController (Rust Control Plane)
        ↓
PermissionPolicy (Authoritative Authorization)
        ↓
ClusterManager (Active Node & Secure Session Resolution)
        ↓
Noise XX Secure Session (ChaCha20-Poly1305 AEAD + Monotonic Nonces)
        ↓
Authenticated Binary Framing (Protocol Version 1.1, Length-Prefixed)
        ↓
TCP 9000 Transport
        ↓
Remote Node CapabilityRegistry Dispatch
        ↓
CapabilityResponse Envelope
        ↓
AdminAuditLogger (admin_actions.jsonl) + NetworkEventBus
```

---

## 2. Implemented Modules

### 2.1 Cryptographic Identity & Keystore (`core/src/network/crypto/`)
- **`keys.rs`**:
  - `PublicKey`: 32-byte X25519 static public key representation with hex serialization and 16-char visual fingerprinting (`<8_hex>:<8_hex>`).
  - `NodeKeypair`: Manages static keypair generation and secure filesystem persistence (`%APPDATA%/Fluffy/keys/node_identity.key` on Windows, `~/.config/fluffy/keys/node_identity.key` on Unix). Private keys are never serialized or exposed over public API boundaries.
  - `derive_sas(&key_a, &key_b)`: Deterministic, order-invariant 6-digit Short Authentication String (SAS) for visual verification during first-contact pairing.
- **`trusted.rs`**:
  - `TrustedPeer`: Binds logical `NodeId` to its verified static `PublicKey`, fingerprint, timestamp, and `TrustStatus` (`Unknown`, `PendingTrust`, `Trusted`, `Revoked`, `IdentityMismatch`).
  - `TrustedPeerStore`: Persistent store of trusted peers (`%APPDATA%/Fluffy/cluster/paired_nodes.json`). Detects and reports `IdentityMismatch` if an existing `NodeId` presents a changed public key.

### 2.2 Binary Length-Prefixed Framing (`core/src/network/transport/framing.rs`)
- **Fixed Header Format (10 bytes)**:
  - Magic (2 bytes): `0x46, 0x4C` (`"FL"`).
  - Version (2 bytes): Major `1`, Minor `1`.
  - Message Type (1 byte): `Handshake (1)`, `EncryptedPayload (2)`, `Heartbeat (3)`, `Close (4)`.
  - Flags (1 byte): Reserved (`0`).
  - Length (4 bytes, Big-Endian `u32`): Declared payload length.
- **Critical Safety Guard**: Fixed header is parsed and validated BEFORE allocating payload buffers. Frames declaring length exceeding `MAX_FRAME_SIZE = 16 MiB` are rejected immediately.

### 2.3 Noise_XX Mutual Handshake (`core/src/network/transport/noise.rs`)
- Standard Noise pattern: `Noise_XX_25519_ChaChaPoly_SHA256` via pure-Rust `snow` crate.
- 3-step handshake:
  1. Initiator -> Responder: `-> e`
  2. Responder -> Initiator: `<- e, ee, s, es`
  3. Initiator -> Responder: `-> s, se`
- Derives mutual static public keys and transitions to `snow::TransportState` with ephemeral symmetric session keys and forward secrecy.

### 2.4 Secure Session & Replay Protection (`core/src/network/transport/session.rs`)
- `SecureSession`: Holds `session_id`, `node_id`, `peer_public_key`, `protocol_version`, `transport_mode = "authenticated_secure"`, `authenticated = true`, and `cryptographically_verified = true`.
- Transport-level replay protection is enforced by Noise 64-bit monotonic sequence numbers.
- Application-level request replay protection tracks observed `RequestId`s within the session and rejects duplicate submissions.
- Freshness checks in `AdminCommandController` validate `deadline_epoch_ms` and `created_at_epoch_ms` with bounded clock-skew tolerances.

### 2.5 N13 Policy Hardening (`core/src/permissions/policy.rs`)
- `CallerContext::RemoteNode` includes `is_cryptographically_verified: bool` and `transport_mode: String`.
- `PermissionPolicy` strictly denies mutating administrative capabilities (`SecurityTier::ConfirmationRequired` such as `Process.Terminate`, and `SecurityTier::HighRisk`) over unauthenticated legacy compatibility transports (`transport_mode == "legacy_compatibility"`).
- `Process.Terminate` remains `SecurityTier::ConfirmationRequired`. Over an authenticated secure session, it evaluates to `PermissionDecision::RequireConfirmation`.

---

## 3. Security Invariants & Guarantees

1. **Identity Invariant**: `NodeId` remains the logical node identity. A static public key is cryptographically bound to that `NodeId`.
2. **Authentication Invariant**: TCP socket connection or hostname/IP claims do not constitute authentication. Authentication succeeds only after mutual Noise_XX handshake and trusted peer store validation.
3. **Authorization Invariant**: An authenticated peer is not automatically an administrator. All commands must pass N13 `PermissionPolicy` and explicit confirmation gates.
4. **Confidentiality & Integrity**: All remote administrative traffic over secure sessions is encrypted with ChaCha20-Poly1305 AEAD. Tampered ciphertexts fail authentication and are dropped.
5. **No Secret Leakage**: Private keys, session keys, tokens, and raw handshake nonces are never logged or exported in network events or audit records.

---

## 4. Verification Summary

- **Library Tests**: 164 passed, 0 failed.
- **Integration Tests (`core/tests/n14_security_transport_tests.rs`)**: 13 passed, 0 failed.
- **Binary Tests**: 11 passed, 0 failed.
- **Frontend Tests (`vitest`)**: 323 passed, 4 skipped.
- **Frontend Production Build**: Built successfully in 4.40s with 0 errors.
