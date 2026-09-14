# Phase N14: Protocol & Security Hardening
## Security, Transport, Authentication & Cryptographic Protocol Audit

---

## 1. Executive Summary

Phase N13 established the authoritative, Rust-owned administrative control plane (`AdminCommandController`, `PermissionPolicy`, `CapabilityRegistry`, `AdminAuditLogger`, and `NetworkEventBus`). Under N13, administrative execution decisions are strictly governed by backend permission policies with explicit confirmation gates.

However, remote administrative transport in the current codebase relies on unauthenticated, plaintext legacy compatibility mechanisms:
1. **Rust Terminal Mesh (TCP 9000)**: Transmits newline-delimited JSON over unencrypted TCP sockets without mutual authentication, cryptographic handshake, message authentication codes (MAC), or replay protection.
2. **Python HTTP Cluster Transport (Port 9000 / HTTP)**: Exposes unauthenticated HTTP endpoints (`/data`, `/ping`, `/connections`, `/action`) without TLS, bearer authentication, or cryptographic origin verification.
3. **Local IPC (TCP 9001 / TCP 9002 / WS 9003 / HTTP 5123)**: Operates on loopback without encryption; HTTP 5123 uses local JWT bearer tokens, while raw TCP/WS sockets carry unencrypted JSON.

The objective of **Phase N14 (Protocol & Security Hardening)** is to establish a secure, mutually authenticated, encrypted session transport layer for peer-to-peer and cluster node communications while preserving the exact N13 authorization, capability, state, and audit boundaries.

```text
┌─────────────────────────────────────────────────────────────┐
│                      Identity Layer                         │
│  Cryptographic Static Keypairs (Ed25519 / X25519)           │
│  Canonical NodeId bound to Public Key                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Secure Session / Transport                  │
│  Mutually Authenticated Key Exchange (Noise Protocol XX)    │
│  Symmetric Session Keys (ChaCha20-Poly1305 AEAD)            │
│  Monotonic Nonces & Replay Window (Zero Plaintext on Wire)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Protocol Validation                      │
│  Length-prefixed Binary Frames (Max 16MB)                   │
│  Typed Frame Headers, Version Negotiation (1.0 -> 1.1)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             N13 Authorization & Control Plane               │
│  CallerContext Validation & PermissionPolicy Checks         │
│  SecurityTier Enforcement (ConfirmationRequired, HighRisk)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Capability Execution                     │
│  CapabilityRegistry Native Dispatch                         │
│  Audit Logger + NetworkEventBus                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Current Transport Inventory

The following table documents every active and legacy network transport in the repository:

| Transport Name | Location | Protocol | Port | Client | Server | Purpose | Auth Mechanism | Encryption | Cryptographic Peer Verification | Replay Protection | Request Correlation | Protocol Versioning | Status & N14 Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Rust Terminal Mesh** | `core/src/terminal/` | Raw TCP | 9000 | `client_agent/` | `net.rs` | Remote agent admin REPL & capability dispatch | None (Plain JSON `ClientHandshake`) | None (Plaintext) | None (Spoofable hostname/IP) | None | Request ID (`u64`) only | None | **Legacy Compatibility** -> Upgrade to Hardened Noise XX Transport in N14 |
| **Python HTTP Cluster** | `fluffy/network/` | HTTP 1.1 | 9000 (or dynamic) | `client.py` (`AdminClient`) | `server.py` (`HTTPServer`) | Node monitoring (`/data`) & legacy actions (`/action`) | None ("No authentication required") | None (Plaintext HTTP) | None | None | None | None | **Legacy Insecure** -> Retain strictly as legacy compatibility shim; block sensitive N13 admin mutations over this transport |
| **Telemetry Ingestion IPC** | `core/src/ipc/`, `brain/listener.py` | Raw TCP | 9001 | `brain/listener.py` | `core/src/ipc/server.rs` | Local high-frequency system stats (CPU, RAM, ETW) | Loopback only | None (Loopback plaintext) | N/A (Localhost only) | None | None | None | **Local IPC** -> Retain unchanged (Loopback boundary) |
| **Rust Command Receiver IPC** | `core/src/ipc/` | Raw TCP | 9002 | `brain/` | `core/src/ipc/` | Local Brain-to-Core capability execution | Loopback only | None (Loopback plaintext) | N/A (Localhost only) | None | Request ID | None | **Local IPC** -> Retain unchanged (Loopback boundary) |
| **Terminal WebSocket Bridge** | `core/src/terminal/ws.rs` | WebSocket | 9003 | Local UI / browser | `core/src/terminal/` | Terminal console bridge for web/UI REPL | Loopback only | None (ws://) | None | None | None | None | **Local UI Bridge** -> Retain unchanged on loopback; reject non-loopback connections |
| **Python FTP Server** | `brain/tools/` | FTP | 2121 | External / Local FTP clients | `pyftpdlib` | Tooling & file sharing | Static/User credentials | None | None | None | None | None | **Ancillary Tool** -> Retain unchanged (tooling only) |
| **Python Brain REST / SSE API** | `brain/` | HTTP 1.1 | 5123 | Tauri Frontend UI | Flask | REST API and SSE event streams for UI | JWT Bearer Token (`@token_required`) | None (Localhost HTTP) | None (Shared secret token) | Token expiration | Request ID | Versioned routes | **Local UI REST** -> Retain unchanged (Loopback boundary) |

---

## 3. Current Authentication Mechanisms

Inspection of `core/src/terminal/`, `fluffy/network/auth.py`, `fluffy/network/server.py`, and `core/src/network/cluster/adapters.rs` reveals the following:

1. **Rust Terminal Mesh (TCP 9000)**:
   - Handshake consists of a plaintext JSON `ClientHandshake` payload containing `hostname`, `os`, `os_version`, `ip`, and `arch`.
   - The server accepts any incoming TCP connection immediately upon receiving this JSON string and assigns a tag (`f1`, `f2`).
   - There are no tokens, passwords, digital signatures, or challenge-response exchanges.
   - Authentication is classified in domain models as `AuthenticationState::Authenticated` solely based on TCP socket establishment.
2. **Python AuthManager (`fluffy/network/auth.py`)**:
   - Implements Bcrypt password hashing and UUID session tokens for web/REST logins.
   - Stores credentials in `fluffy/network/credentials.json`.
   - Implements rate limiting (5 attempts per IP with 5-minute cooldown).
   - **Crucial finding**: This authentication manager is **not used** by `fluffy/network/server.py` or `fluffy/network/client.py`. The HTTP availability server explicitly runs with "No authentication required".
3. **Session Binding**:
   - Neither the Rust Terminal Mesh nor the Python HTTP cluster transport binds sessions to cryptographic keys.
   - Any client on the network can establish a connection and declare arbitrary identities.

---

## 4. Current Identity Model

1. **Node Identity (`NodeId`)**:
   - Represented as `NodeId(String)` (`core/src/network/ids.rs`).
   - Normal instances: `node_<uuid4>`.
   - Ephemeral instances: `node_ephem_<uuid4>`.
   - In the current code, `NodeId` is generated dynamically in memory or configured locally. It is **not** cryptographically derived from or bound to a public key.
2. **Device Identity (`DeviceId`)**:
   - Canonical anchor: `dev_mac_<hex>` derived from normalized physical MAC addresses.
   - Ephemeral fallback: `dev_ephem_<uuid4>` when MAC is absent or malformed.
3. **Identity Vulnerabilities**:
   - **Identity Spoofing**: An unauthenticated peer can send a `ClientHandshake` claiming any hostname, IP, or architecture.
   - **Reconnect Collision**: When a disconnected node reconnects on TCP 9000, the server assigns a new ephemeral `NodeId` and tag unless correlated by IP/hostname. An attacker can hijack an IP address and impersonate a previously trusted node.
   - **Binding Requirement for N14**: Canonical `NodeId` must be derived from or cryptographically bound to the node's static public key (e.g. `node_pk_<hex_encoded_32byte_pubkey>`).

---

## 5. Current Protocol & Framing Model

1. **Framing Mechanism**:
   - Newline-delimited JSON (`\n` terminated utf-8 strings) over raw TCP stream (`core/src/terminal/net.rs` and `client_agent/mod.rs`).
   - Read using `tokio::io::BufReader::read_line(&mut buf)`.
2. **Message Envelopes**:
   - `AdminCapabilityInvoke { id: u64, request: CapabilityRequest }`
   - `ClientCapabilityResult { id: u64, response: CapabilityResponse }`
   - `AdminCommand { id: u64, command: Command }`
   - `ClientResponse { id: u64, client_id: String, tag: String, output: String, success: bool }`
3. **Framing Limitations**:
   - **No Frame Length Header**: Buffer allocation depends on scanning for newline bytes. An attacker sending unbounded streams without newlines can cause memory exhaustion (DoS).
   - **No Integrity Check / Checksum**: Bit flips or injected TCP segments cannot be detected.
   - **No Binary Efficiency**: Large JSON serialization adds significant serialization and CPU overhead.
   - **Maximum Message Limit**: No explicit ceiling enforced on `read_line`, creating vulnerability to memory starvation.

---

## 6. Current Security Guarantees & Deficiencies

| Security Property | Current Status | Current Mechanism | Risk / Deficiency |
| :--- | :--- | :--- | :--- |
| **Peer Authentication** | **Absent** | None (Unverified JSON handshake) | Anyone on the LAN can connect as an admin or worker node. |
| **Confidentiality** | **Absent** | Plaintext TCP / HTTP | All capability requests, arguments, parameters, and results are exposed to passive network sniffers. |
| **Message Integrity** | **Absent** | Plaintext TCP | Packets can be intercepted and modified in transit via active MITM. |
| **Replay Protection** | **Absent** | Monotonic Request ID (`u64`) only | Request ID is local to the connection and easily forged; captured frames can be replayed. |
| **Authorization** | **Robust** (Local) | `PermissionPolicy` + `CallerContext` (N13) | Backend authorization works correctly, but relies on trust in the unauthenticated transport layer. |
| **Audit Logging** | **Robust** | `AdminAuditLogger` + `NetworkEventBus` (N13) | Actions are recorded, but caller identity metadata can be spoofed by remote nodes. |

---

## 7. Security Gaps

1. **Gap 1: Eavesdropping on Sensitive Capabilities**: Remote execution of capabilities (e.g. process inspection, file queries, terminal output) sends raw data across the LAN unencrypted.
2. **Gap 2: Remote Node Impersonation**: A rogue node on the local subnet can pose as a worker node or admin node without credentials.
3. **Gap 3: Command Injection & Tampering**: Without message authentication codes (AEAD), commands in transit over TCP 9000 can be altered.
4. **Gap 4: Replay Attacks**: An adversary recording an authorized `AdminCapabilityInvoke` frame could resubmit it over a fresh TCP connection.
5. **Gap 5: Unbounded Frame Buffering**: Lack of explicit 4-byte frame length prefixes and max-size checks allows stream flooding.

---

## 8. Threat Model (Current vs N14)

| Threat | Current Protection | Gap | N14 Mitigation | Residual Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Passive Network Sniffing** | None | High: All telemetry and capability payloads visible | End-to-end AEAD encryption (ChaCha20-Poly1305) on all remote traffic | Traffic analysis / timing metadata |
| **Active MITM (Tampering)** | None | Critical: Commands and parameters can be modified | Authenticated session keys with Poly1305 MAC per frame | Host compromise |
| **Node Impersonation** | None | Critical: Any host can claim any NodeId | Mutual cryptographic handshake (Noise XX) binding NodeId to Static Public Key | Physical theft of private key file |
| **Replayed Admin Command** | Request ID (`u64`) | High: Request ID is easily reused across connections | Monotonic frame sequence numbers + session-unique nonces + timestamp freshness | Clock skew within freshness window |
| **Forged Handshake / Spoofing** | None | High: JSON handshake is forged easily | Cryptographic proof of static private key possession via Diffie-Hellman ephemeral exchange | Malicious pre-paired node |
| **Protocol Downgrade Attack** | `NetworkProtocolVersion` | Medium: No integrity protection on version negotiation | Version and capability negotiation embedded inside encrypted/authenticated payload | Legacy compatibility mode explicitly enabled |
| **Malformed Frame Flooding** | None | Medium: `read_line` vulnerable to memory exhaustion | Strict 4-byte length prefix with 16MB ceiling check before buffer allocation | Resource starvation from socket exhaustion |

---

## 9. Evaluation of Security Architecture Options

### Option A: TLS / mTLS (X.509)
- **Mechanism**: Transport Layer Security via `rustls` or `native-tls` with mutual certificate authentication.
- **Pros**: Industry-standard, widely understood, broad tooling.
- **Cons**:
  - Requires public key infrastructure (PKI), Certificate Authority (CA) management, self-signed certificate generation, Subject Alternative Name (SAN) validation, and CRL/revocation logic.
  - Excessive complexity and operational fragility for decentralized desktop peer-to-peer mesh clustering.
  - High friction for local desktop users (pairing via certificate exchange is clumsy).

### Option B: Noise Protocol Framework (Noise_XX / Noise_IK)
- **Mechanism**: Modern cryptographic handshake framework (used by WireGuard, Tailscale, Signal, Lightning Network) using Curve25519 (X25519), ChaCha20-Poly1305, and BLAKE2s/SHA-256.
- **Noise_XX**: 3-message mutual authentication handshake where neither party needs prior knowledge of the other's static public key; both transmit their static keys under ephemeral encryption with mutual verification.
- **Pros**:
  - Zero PKI or ASN.1 parsing overhead.
  - Perfect forward secrecy (ephemeral Diffie-Hellman keys per session).
  - Node identity (`NodeId`) is directly derived from static public key (`node_pk_<hex_encoded_32byte_pubkey>`).
  - High performance, minimal binary overhead, pure Rust crate ecosystem (`snow`).
  - Native AEAD framing with built-in 64-bit nonces.
  - Fits directly into the Fluffy Pairing workflow (`Available -> Pairing -> Authenticating -> Connected`).
- **Cons**: Requires standard Rust crate `snow` or standard cryptographic primitives.

### Option C: Custom Application-Level AEAD Framing
- **Mechanism**: Ad-hoc challenge-response handshake with shared pre-shared keys (PSK) and ChaCha20-Poly1305 framing.
- **Pros**: Minimal dependencies.
- **Cons**: High security risk of custom protocol design errors (roll-your-own crypto), potential nonce reuse bugs, lack of formal verification.

---

## 10. Recommended Architecture: Noise Protocol (Noise_XX)

**Selected Architecture**: **Noise_XX Pattern using `snow` (X25519 + ChaCha20-Poly1305 + SHA256)**

### Rationale:
1. **Direct Identity Binding**: A Fluffy node's permanent identity is its static X25519 public key. No CA or third-party certs are required.
2. **Mutual Authentication**: Both Admin and Worker nodes authenticate each other during the 3-step handshake.
3. **Forward Secrecy**: Ephemeral Diffie-Hellman keys ensure past captured traffic cannot be decrypted even if static keys are compromised later.
4. **Clean Framing**: Snow provides standard message encapsulation that drops directly onto the existing TCP 9000 stream without modifying ports or introducing new daemon processes.

---

## 11. Key & Credential Management Design

### 11.1 Key Generation & Storage
- Each Fluffy node generates a static 25519 keypair upon first startup.
- **File Location**:
  - Windows: `%APPDATA%\Fluffy\keys\node_identity.key` (protected with OS filesystem permissions).
  - Linux/macOS: `~/.config/fluffy/keys/node_identity.key` (mode `0600`).
- **Identity Derivation**:
  - `NodeId` = `node_pk_<hex_encoded_32byte_pubkey>`
- **No Hardcoded Secrets**: Secrets are never hard-coded in source code or repository assets.

### 11.2 Pairing & Trust Store (`paired_nodes.json`)
- During the user-initiated pairing workflow (`PairingState::PairingRequested` -> `PairingState::Paired`):
  1. The user verifies the 6-character short authentication string (SAS) / fingerprint derived from the mutual public keys.
  2. Upon approval, the remote node's static public key, display name, and assigned role are saved to the persistent trust store:
     `%APPDATA%\Fluffy\cluster\paired_nodes.json`.
  3. Subsequent handshakes automatically match the remote static key against the trust store. Unpaired or unknown static keys are rejected with `AuthFailureReason::InvalidCredentials` or routed to `PairingRequested`.

---

## 12. Frame Layer & Protocol Specification (Version 1.1)

All frames over TCP 9000 under N14 use a length-prefixed binary framing envelope:

```text
┌─────────────────┬─────────────────┬───────────────────────────────┬─────────────────┐
│ Length (4 B)    │ Magic (2 B)     │ Protocol Version (2 B)        │ Payload (N B)   │
│ Big-Endian u32  │ 0x46 0x4C ("FL")│ Major (u8) Minor (u8) [1, 1]   │ Ciphertext / Msg│
└─────────────────┴─────────────────┴───────────────────────────────┴─────────────────┘
```

- **Maximum Frame Size**: 16 MB (`16,777,216` bytes) enforced on read.
- **Handshake Phase**: Frames 1, 2, 3 carry raw Noise handshake messages.
- **Transport Phase**: All subsequent frames carry ChaCha20-Poly1305 AEAD ciphertexts containing serialized JSON command/response envelopes.

---

## 13. Replay Protection Design

1. **Session-Level Monotonic Nonces**:
   - Every transmitted AEAD frame increments a 64-bit integer nonce (`0, 1, 2, ...`).
   - The receiver validates that incoming nonces are strictly monotonically increasing, preventing frame reordering or duplication within a session.
2. **Session Randomness & Ephemeral Keys**:
   - Every TCP connection performs a fresh Noise handshake generating unique ephemeral keys and random IV material.
   - Handshake replays from prior sessions fail cryptographic verification during the Diffie-Hellman key agreement phase.
3. **Timestamp Freshness Check**:
   - `AdminCommandRequest` carries `timestamp_epoch_ms`.
   - The receiving agent verifies `|current_time - timestamp_epoch_ms| <= MAX_COMMAND_SKEW_MS` (default 30,000 ms).
   - Clock-skewed or stale commands are rejected immediately with `permission_denied: command_expired`.

---

## 14. Protocol Versioning & Downgrade Prevention

Building on `NetworkProtocolVersion` (`core/src/network/api/version.rs`):
- **Canonical N14 Version**: `1.1` (indicates Noise_XX authenticated framing support).
- **Legacy Compatibility Version**: `1.0` (unauthenticated newline-delimited JSON).
- **Downgrade Guard**:
  - If a node is recorded in `paired_nodes.json` as supporting `1.1`, any connection attempt from that node proposing `1.0` is rejected with `NetworkEventType::AuthViolation` (`"Protocol downgrade attempt detected"`).

---

## 15. Legacy Compatibility Strategy

1. **Rust Terminal Mesh (TCP 9000)**:
   - Default mode: Attempt N14 Noise_XX handshake on connection.
   - Fallback mode: If remote node fails magic byte negotiation or reports `1.0`, the session is classified as `transport_mode = "legacy_compatibility"` and `auth_mode = "compatibility"`.
2. **N13 Admin Restrictions on Legacy Transports**:
   - Read-only capabilities (`System.GetHardware`, `Process.List`, `Network.ListInterfaces`, `Filesystem.SafePathCheck`) are permitted on legacy compatibility transport.
   - Mutating capabilities with security tiers `ConfirmationRequired` (e.g. `Process.Terminate`) or `HighRisk` **require** `auth_mode = "authenticated_secure"`. When attempted over legacy compatibility transport, `PermissionPolicy` returns:
     `PermissionDecision::Deny { reason: "Mutating administrative capabilities require cryptographically authenticated session (N14)" }`.
3. **Python HTTP Cluster Transport**:
   - Retained strictly for legacy monitoring data polling (`/data`).
   - Administrative actions (`/action`) on the legacy Python HTTP server remain restricted to legacy nodes and are scheduled for deprecation in N16.

---

## 16. N13 Authorization Preservation

N14 strictly hardens the transport and proves peer identity without altering N13 authorization:
- `CallerContext::RemoteNode` is updated to include `auth_mode`:
  ```rust
  CallerContext::RemoteNode {
      node_id: NodeId,
      role: NodeRole,
      auth_state: AuthenticationState,
      transport_mode: String,
      is_cryptographically_verified: bool,
  }
  ```
- `PermissionPolicy` validates both `role` and `is_cryptographically_verified`.
- `CapabilityRegistry` remains the sole execution engine.
- `AdminAuditLogger` and `NetworkEventBus` record cryptographic session events.

---

## 17. Security Events & Audit Integration

The following strongly typed event types are integrated into `NetworkEventType`:
- `NetworkEventType::SecureSessionEstablished`
- `NetworkEventType::SecureSessionClosed`
- `NetworkEventType::CryptographicHandshakeFailed`
- `NetworkEventType::ReplayRejected`
- `NetworkEventType::ProtocolDowngradeRejected`
- `NetworkEventType::LegacyTransportWarning`

**Audit Privacy Invariant**: All audit entries and event payloads are sanitized: private keys, session keys, tokens, and raw handshake nonces are strictly forbidden from entering event payloads or logs.

---

## 18. Performance & Reliability Impact

- **Handshake Latency**: 3 round-trips over TCP (sub-millisecond on LAN).
- **Throughput**: ChaCha20-Poly1305 hardware-accelerated / SIMD throughput exceeds 2 GB/s on modern x86_64/ARM64 CPUs.
- **Memory Footprint**: Less than 4 KB state per active connection session.
- **Brain Independence**: Transport encryption and handshake are implemented entirely within the Rust Core nervous system; zero dependency on Python Brain runtime.

---

## 19. Staged Implementation Plan (N14.1 → N14.7)

1. **N14.1: Cryptographic Dependencies & Key Store**:
   - Integrate `snow` (Noise Protocol) and `ring` / `ed25519-dalek` / `x25519-dalek` into `core/Cargo.toml`.
   - Implement node key generation and local filesystem keystore (`core/src/network/crypto/`).
2. **N14.2: Binary Length-Prefixed Framing**:
   - Implement `FramedCodec` for length-prefixed binary frames (magic bytes, version, payload ceiling).
3. **N14.3: Noise_XX Handshake Engine**:
   - Implement client and server handshake state machines over async TCP stream.
4. **N14.4: Replay & Nonce Tracker**:
   - Implement monotonic nonce validation and command timestamp freshness checks.
5. **N14.5: ClusterManager & Adapter Integration**:
   - Wire secure sessions into `ClusterManager`, updating `NetworkNode.auth_state` and `NetworkConnection`.
6. **N14.6: Policy Enforcement for Transport Security**:
   - Update `PermissionPolicy` to guard `ConfirmationRequired` capabilities against unauthenticated legacy sessions.
7. **N14.7: Verification & Test Suite**:
   - Comprehensive unit and integration test coverage for handshake, replay rejection, framing limits, and policy gating.

---

## 20. Explicitly Deferred Work

- **N15**: Production Multi-Node Cluster Mesh & Dynamic Topology Discovery.
- **N16**: Complete Retirement of Legacy Python HTTP Availability Server.
- **N17**: Distributed Guardian Consensus & Threat Sharing.
- **N18**: Zero-Trust Network Fabric & Production Hardening.

---

## 21. Summary

Phase N14 transforms Fluffy's remote administration transport from an unauthenticated, plaintext legacy socket into a modern, cryptographically authenticated, AEAD-encrypted session channel using the Noise Protocol Framework (Noise_XX). It preserves all N13 administrative boundaries, enforces strict replay protection, guards against protocol downgrade, and maintains seamless, transparent backward compatibility for legacy monitoring.
