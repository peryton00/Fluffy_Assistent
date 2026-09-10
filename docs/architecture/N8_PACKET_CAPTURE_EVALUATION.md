# N8: Passive Packet Monitoring Architecture & SIH Implementation Plan

## 1. Executive Summary & SIH26117 Requirement Context

This document defines the formal architecture and security specifications for **N8: Passive Packet Monitoring** in the Fluffy Desktop ecosystem.

### **Context: SIH26117 Mission Requirements**
Fluffy is engineered for **SIH26117** (*Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work*). In air-gapped and sovereign industrial environments, real-time packet monitoring is an essential verification and auditing capability:
1. **Air-Gap Egress Verification**: Providing live, verifiable packet-level proof that zero outbound packets escape the sovereign perimeter.
2. **Local Broadcast & Subnet Chatter Auditing**: Observing broadcast (ARP, mDNS) and unicast chatter on industrial LANs without intrusive scanning.
3. **Forensic & Diagnostic Demonstration**: Supplying interactive, user-authorized packet observation windows for network troubleshooting during SIH demonstrations.

### **Evolution from Initial N8 Evaluation to Controlled Implementation**
- **Original Evaluation Concern**: Continuous, promiscuous full-payload packet sniffing introduces severe privacy risks (credential/payload ingestion), high CPU/battery drain, and cross-platform kernel driver friction (Npcap on Windows, root on Linux).
- **SIH Resolution — Controlled, Safe Implementation**:
  - We do **NOT** implement unconstrained continuous promiscuous packet capture.
  - We implement a **controlled, user-authorized, bounded, metadata-only packet monitoring subsystem** within Rust Core.
  - **Metadata-Only Invariant**: Capture headers, packet sizes, timestamps, protocols, 5-tuples, and TCP flags. Never capture, parse, or store application payloads.
  - **Zero Credential Exposure**: No password extraction, TLS decryption, or MITM interception.
  - **Bounded Memory & Rate Limiting**: In-memory ring buffer (up to 200 packets) with explicit drop counters and diagnostic timeouts.

---

## 2. Telemetry Invariants: What N8 Captures vs Does NOT Capture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        N8 Captured Fields                              │
│  • Timestamp (RFC 3339 microsecond timestamp)                          │
│  • Network Interface Binding                                           │
│  • IP Version (IPv4 / IPv6) & Transport Protocol (TCP / UDP / ICMP)     │
│  • Source IP & Port / Destination IP & Port                            │
│  • Packet Length (Bytes)                                               │
│  • TCP Flags (SYN, ACK, FIN, RST, PSH, URG)                            │
│  • Flow Direction (INBOUND, OUTBOUND, LOCAL, UNKNOWN)                  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STRICTLY PROHIBITED (EXCLUDED)                       │
│  ❌ Application Payloads / Message Bodies (HTTP, TLS, SSH data)        │
│  ❌ Payload Storage on Disk / Long-Term Persistence                   │
│  ❌ Cleartext Credentials / Passwords / Tokens                         │
│  ❌ Packet Injection / Spoofing / Promiscuous MITM                     │
│  ❌ Firewall Modification / Connection Termination                     │
│  ❌ Uncontrolled / Unbounded LLM Context Ingestion                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. End-to-End Architecture

```text
       ┌─────────────────────────────────────────────────────────┐
       │             Host Network Interface Adapter              │
       └────────────────────────────┬────────────────────────────┘
                                    │ (Native Raw Socket / Tap / Simulation Engine)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │              Rust Core Packet Monitor Engine            │
       │  • State: IDLE / ACTIVE (User-Controlled Session)       │
       │  • Parser: Header & Metadata Normalizer                 │
       │  • Zero-Payload Slicer: Drops payload immediately       │
       │  • Bounded Ring Buffer (Max 200 items)                  │
       │  • Dropped Packet & Rate Counter (PPS)                  │
       └────────────────────────────┬────────────────────────────┘
                                    │ Structured Capability IPC (Port 9002)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │               LocalNetworkService (Python)              │
       │  • Capability Dispatch: Start / Stop / GetStatus        │
       │  • Bounded JSON Serialization                           │
       └────────────────────────────┬────────────────────────────┘
                                    │ REST API (/local_network/capture/*)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │             Tauri Desktop UI (LocalNetworkView)         │
       │  • Status Badge (OFF / ACTIVE)                          │
       │  • Metric Cards (Observed, Dropped, Rate PPS, Duration) │
       │  • Bounded Metadata Table                               │
       │  • Start / Stop Capture Controls                        │
       └─────────────────────────────────────────────────────────┘
```

---

## 4. Platform & Privilege Strategy

1. **Standard & Diagnostic Modes**:
   - The monitor operates in on-demand sessions (e.g. 30s to 300s configurable windows).
   - On Windows, uses native sockets or diagnostic capture providers with non-elevated fallbacks.
   - On Linux, utilizes standard raw sockets when `CAP_NET_RAW` is available, falling back gracefully to simulated/socket-table diagnostic telemetry if unprivileged.
2. **Zero-Panic Fallback**:
   - If low-level raw socket initialization fails due to OS privilege constraints, the engine reports `error: "privilege_required"` or transitions to diagnostic observation mode rather than crashing.

---

## 5. Security & Privacy Controls

1. **Strict Capability Boundary**:
   - `Network.StartPacketCapture`, `Network.StopPacketCapture`, and `Network.GetPacketCaptureStatus` are registered in the Rust `CapabilityRegistry` under `SecurityTier::Controlled`.
   - Cannot be triggered arbitrarily without user awareness.
2. **LLM Safety**:
   - The LLM receives pre-aggregated packet statistics (e.g., total packets, protocol breakdown, top peers), never raw packet streams.

---

## 6. Performance & Storage Limits

- **Maximum Packets in Buffer**: 200 observations.
- **Maximum Session Duration**: Default 60 seconds (max 300 seconds).
- **Dropped Packet Handling**: High-rate bursts increment `packets_dropped` and protect CPU/memory.
- **RAM Footprint**: $< 1\text{ MB}$ total memory for packet buffers.

---

## 7. Implementation Roadmap

- **N8.1**: Rust Core Data Models (`core/src/network/types.rs`) & Packet Monitor Engine (`core/src/network/capture.rs`).
- **N8.2**: Rust Capability Handlers (`Network.StartPacketCapture`, `Network.StopPacketCapture`, `Network.GetPacketCaptureStatus`) & Dispatcher registration.
- **N8.3**: Python Service Integration (`brain/runtime/local_network_service.py`) & Routes (`brain/routes/local_network_routes.py`).
- **N8.4**: UI State Store & Visualizers (`localNetworkStore.ts` & `LocalNetworkView.tsx`).
- **N8.5**: Exhaustive Rust, Python, and UI test suites.

---
