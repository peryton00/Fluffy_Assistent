# Fluffy Network Architecture - N17.1 Key Storage & Authentication Hardening

## Overview

This document specifies the cryptographic key storage architecture, protected-at-rest envelope format, legacy migration semantics, and runtime token lifecycle for Fluffy Desktop following Phase N17.1 hardening.

---

## 1. Key Lifecycle Architecture

```text
NodeKeypair::generate()
  ↓ (Snow Noise_XX_25519_ChaChaPoly_SHA256 builder)
32-byte Public Key + 32-byte Private Key
  ↓
NodeKeypair::save_to_file()
  ↓
Platform Protection:
  - Windows: DPAPI CryptProtectData (CRYPTPROTECT_UI_FORBIDDEN)
  - Unix: POSIX 0600 (owner-only read/write)
  ↓
Envelope Assembly:
  [FLKEY (5B)] [0x01 (1B)] [Backend (1B)] [PublicKey (32B)] [PayloadLen (4B)] [Ciphertext (NB)]
  ↓
Atomic Write:
  - Write temporary file in target directory: .node_identity.key.tmp.<UUID>
  - Enforce permissions on temp file
  - Replace destination file atomically
  ↓
NodeKeypair::load_from_file()
  ↓
Decrypt & verify integrity -> Pass to Noise XX Handshake
```

---

## 2. Protected-at-Rest Envelope Format

All node identity keys stored at rest on disk follow the versioned binary envelope format:

| Offset (Bytes) | Field Name | Type / Length | Description |
| :--- | :--- | :--- | :--- |
| `0..5` | `Magic` | `[u8; 5]` | Fixed magic identifier: ASCII `b"FLKEY"` |
| `5` | `Version` | `u8` | Envelope specification version (`0x01`) |
| `6` | `Backend ID` | `u8` | Protection backend (`0x01` = Windows DPAPI, `0x02` = Unix Owner-Only) |
| `7..39` | `PublicKey` | `[u8; 32]` | 32-byte X25519 static public key |
| `39..43` | `PayloadLength` | `u32` (Big Endian) | Byte length $N$ of encrypted private key payload |
| `43..43+N` | `EncryptedPayload` | `[u8; N]` | Ciphertext produced by the platform protection backend |

### Minimum Envelope Size
The minimum valid envelope is $5 + 1 + 1 + 32 + 4 = 43$ bytes plus ciphertext length $N$. Any file smaller than 43 bytes or with an unmatching magic header is rejected immediately.

---

## 3. Windows DPAPI Implementation

On Windows targets, at-rest encryption uses Windows Data Protection API (DPAPI) via Direct Windows FFI to `crypt32.dll` and `kernel32.dll`:

1. **Encryption (`CryptProtectData`)**:
   - `dwFlags = CRYPTPROTECT_UI_FORBIDDEN (0x01)`
   - Uses the OS-managed master key derived from the active Windows user credential store.
   - Outputs a DPAPI ciphertext blob containing authenticated payload encryption.
   - Cleans up unmanaged buffers via `LocalFree`.
2. **Decryption (`CryptUnprotectData`)**:
   - `dwFlags = CRYPTPROTECT_UI_FORBIDDEN (0x01)`
   - Decrypts and authenticates ciphertext payload.
   - Verifies that recovered plaintext is exactly 32 bytes.
   - Decryption across different user accounts, corrupted blobs, or modified bytes triggers an immediate failure.

---

## 4. Unix & Non-Windows Target Handling

On Unix-like targets (Linux, macOS):
- File permissions are explicitly set to `0600` (`S_IRUSR | S_IWUSR`) on file creation and atomic replacement.
- Group and world permissions are strictly denied (`---`).

---

## 5. Legacy Key Migration & Identity Preservation

To ensure uninterrupted node identity, clustering, and pairing relationships:

1. **Detection**:
   - When loading `node_identity.key`, if the file length is exactly 64 bytes and does not start with `b"FLKEY"`, it is identified as a legacy plaintext key (`[PublicKey: 32B] [PrivateKey: 32B]`).
2. **Migration**:
   - The keypair is parsed.
   - The key is immediately and atomically rewritten to disk in the protected `FLKEY\x01` format.
   - An informational log is recorded: `[SEC-01] Detected legacy plaintext key file; migrating to protected format`.
3. **Identity Invariance**:
   - Node public key and `NodeId` derivation remain completely identical before and after migration.
   - No new keys are generated when an existing valid legacy identity is present.

---

## 6. Failure Modes & Fail-Closed Semantics

The key management subsystem enforces strict fail-closed semantics:
- **Corrupted Ciphertext**: Fails closed; returns structured error without falling back to plaintext or regenerating key.
- **Truncated Envelope**: Fails closed if length $< 43 + \text{PayloadLength}$.
- **Unsupported Version / Backend**: Fails closed if `Version != 0x01` or backend is unrecognized.
- **Atomic Persistence Failure**: If write or atomic rename fails, temporary files are immediately removed from disk and target identity remains unaffected.
- **Zero Secret Logging**: `NodeKeypair` implements `fmt::Debug` with `private: "[REDACTED_PRIVATE_KEY]"`. Key bytes are never printed to terminal or written to log sinks.

---

## 7. SEC-02 Authentication Token Hardening

### Previous Vulnerability
Earlier development builds accepted a hardcoded fallback string `"fluffy_dev_token"` across Python Brain API routes and Tauri IPC when `FLUFFY_TOKEN` environment variable was empty or absent.

### Hardened Architecture
1. **Dynamic Generation**:
   - When `FLUFFY_TOKEN` is not specified in `.env` or the process environment, the system dynamically generates a cryptographically secure token using `secrets.token_hex(32)` (Python) or two concatenated `Uuid::new_v4()` (Rust/Tauri) providing 256 bits of entropy.
2. **Session Persistence**:
   - The generated token is held in memory for the lifetime of the process session (or persisted safely to local `.env` during setup).
3. **Loopback & Timing-Safe Verification**:
   - Local Web API endpoints enforce loopback-only binding (`127.0.0.1` / `::1`).
   - Token comparison uses `hmac.compare_digest` in Python and constant-time comparison in Rust to resist timing side-channel attacks.
4. **Boundary Isolation**:
   - Local HTTP/IPC tokens apply exclusively to loopback UI/Brain communication.
   - Remote node communication remains strictly authenticated by Noise XX and `TrustedPeerStore`.

---

## 8. Audit Matrix

| Identifier | Finding | Hardened Implementation | Status |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Private key stored unencrypted on disk | Windows DPAPI + Unix 0600 + `FLKEY\x01` envelope + atomic write replacement | **FIXED** |
| **SEC-02** | Hardcoded `fluffy_dev_token` fallback | Dynamic 256-bit entropy runtime token + `hmac.compare_digest` + loopback enforcement | **FIXED** |
