# Fluffy Assistant: Complete Documentation Hub

Welcome to the comprehensive technical documentation for **Fluffy Assistant** — a lightweight, privacy-first system monitor, behavioral anomaly detection guardian, autonomous agent runtime, and industrial operations desktop workbench for **Windows and Linux**.

This directory houses exhaustive architectural specifications, subsystem implementation guides, operational workspace documentation, developer onboarding manuals, security threat models, and Smart India Hackathon (SIH) presentation deliverables.

---

## 1. System Overview & The Big Picture

Fluffy Assistant solves the modern computing dilemma: **How do we achieve autonomous AI-driven system administration, deep process observability, and behavioral malware protection without surrendering user privacy or sending sensitive system telemetry to the cloud?**

### Core Philosophy
- **100% Local-First by Default**: Native system monitoring, process tree tracking, behavioral threat analysis, speech recognition, and tool execution operate completely on-device without cloud dependencies.
- **Three-Tier Hexagonal Architecture**:
  1. **Frontend**: Tauri v2 + React 18 + TypeScript + Vite Desktop Operations Workbench.
  2. **Core Engine (Rust)**: High-speed native systems interface, telemetry broadcaster (TCP 9001), command receiver (TCP 9002), admin terminal REPL & WebSocket bridge (WS 9003), LAN listener (TCP 9000), capability dispatch, and safety policy enforcement.
  3. **Brain Daemon (Python)**: Intelligent orchestration engine, Guardian behavioral anomaly detector, Autonomous Agent, Knowledge/RAG vector store, Tool execution runtime, Semantic Memory subsystem, and Web API (HTTP/SSE 5123).
- **Signature-Less Security (Guardian)**: Detects zero-day threats, privilege escalation, and suspicious background persistence via continuous statistical baselining (EMA), process fingerprinting, and compound attack chain scoring.
- **Sovereign Multi-Machine Observability**: Peer-to-peer LAN clustering and reverse TCP terminal streaming for managing distributed fleets of workstations.

---

## 2. Documentation Sitemap

```text
docs/
|-- README.md                                 # This master documentation guide
|
|-- Workspaces & UI Modules:
|   |-- ui-shell.md                           # Main application workbench shell & navigation
|   |-- ui-foundation.md                      # Design tokens, themes, and UI primitives
|   |-- systems-workspace.md                  # Systems overview, processes, apps, startup, hardware
|   |-- terminal-workspace.md                 # Interactive console, WebSocket bridge, LAN cluster
|   |-- operations-workspace.md               # Normalization sweeps, cache cleaning, RAM optimization
|   |-- chat-voice-workspace.md               # Conversational AI interface & offline STT/TTS
|   |-- extensions-workspace.md               # Dynamic plugin runtime & self-improving tools
|   |-- analytics-workspace.md                # System throughput meters & historical telemetry
|   |-- settings-workspace.md                 # LLM keys, sovereignty controls, FTP server setup
|   |-- artifacts.md                          # Artifact creation, rendering, and lifecycle
|   |-- knowledge.md                          # RAG, document ingestion, and vector embeddings
|   |-- multimodal.md                         # Multi-modal vision, OCR, and audio pipelines
|   `-- sovereignty.md                        # Local-first data privacy and offline guarantees
|
|-- Architecture & Engineering:
|   |-- architecture/AGENT_ORCHESTRATION.md   # Agent planning, step execution, and feedback loops
|   |-- architecture/COMMUNICATION_CONTRACTS.md # Full IPC protocol specifications (JSON/TCP/WS)
|   |-- architecture/CURRENT_ARCHITECTURE.md  # Architectural baseline and system flow
|   |-- architecture/DIRECTORY_MIGRATION.md   # Migration taxonomy and module layout
|   |-- architecture/LOCAL_NETWORK_OBSERVABILITY.md # LAN network monitoring and discovery
|   |-- architecture/MCP_ARCHITECTURE.md      # Model Context Protocol client & server integration
|   |-- architecture/N8_PACKET_CAPTURE_EVALUATION.md # Network packet capture feasibility
|   |-- architecture/N9_ADVANCED_NETWORK_INTELLIGENCE.md # Advanced network threat detection
|   |-- architecture/RUST_CAPABILITY_ARCHITECTURE.md # First-class native Rust capability dispatch
|   |-- architecture/secure-code-sandbox.md   # Isolated Python execution sandbox
|   |-- architecture/UI_WORKBENCH_SPECIFICATION.md # React 18 frontend architecture spec
|   |-- architecture/UI_PRE_MIGRATION_AUDIT.md # Pre-migration capability audit
|   `-- architecture/UNIFIED_TOOL_RUNTIME.md  # Tool execution engine and schema definitions
|
|-- AI & Language Models:
|   |-- ai/README.md                          # AI subsystem overview & provider matrix
|   |-- ai/LOCAL_AI_RUNTIME.md                # On-device inference engines (Llama.cpp, Ollama)
|   `-- ai/MODEL_ROUTER.md                    # Multi-provider routing, fallbacks, and SSE streaming
|
|-- Security & Guardian Subsystem:
|   |-- security/README.md                    # Guardian behavioral engine, policies, auth
|   |-- security/sandbox-threat-model.md      # Sandboxing threat modeling and attack surfaces
|   `-- security/sandbox-limitations.md       # Sandbox boundaries and platform constraints
|
|-- Developer & Contributor Guide:
|   `-- development/README.md                 # Developer setup, port map, IPC debugging, testing
|
`-- Smart India Hackathon (SIH26117):
    |-- sih/README.md                         # SIH master innovation blueprint & hub
    |-- sih/PITCH_AND_PRESENTATION.md         # Hackathon pitch scripts, demo flows & judge Q&A
    |-- sih/PPT_SLIDES_CONTENT.md             # Complete 13-slide presentation deck content in .md
    `-- sih/ARCHITECTURE_AND_INNOVATION.md   # Deep-dive technical whitepaper on core innovations
```

---

## 3. Communication Protocols & Port Map

Fluffy Assistant uses strict loopback and LAN network contracts:

| Port | Protocol | Binding Service | Connected Component | Purpose |
|:---|:---|:---|:---|:---|
| **9001** | TCP JSON | Rust Core (`ipc/server.rs`) | Python Brain (`runtime/listener.py`) | Real-time system telemetry broadcast (2s loop) |
| **9002** | TCP JSON | Rust Core (`ipc/receiver.rs`) | Python Brain (`runtime/commands.py`) | Native command execution & policy validation |
| **9003** | WebSocket | Rust Core (`terminal/ws_bridge.rs`) | Tauri UI (`features/terminal`) | Real-time REPL stdout streaming & terminal I/O |
| **9000** | TCP | Rust Core (`terminal/net.rs`) | Remote Nodes (`fluffy-client`) | LAN reverse TCP shell administration |
| **5123** | HTTP / SSE | Python Brain (`web_api.py`) | Tauri UI (`services/api.ts`) | REST endpoints, system polling, chat SSE stream |
| **2121** | FTP | Services (`ftp_service.py`) | Local LAN Clients | Dynamic credentials file transfer & QR pairing |

---

## 4. How to Navigate This Codebase

- **If you are developing or debugging code**: Start with [docs/development/README.md](./development/README.md) and [agent.md](../agent.md).
- **If you want to understand the UI layout and workspaces**: Review [docs/ui-shell.md](./ui-shell.md) and [docs/systems-workspace.md](./systems-workspace.md).
- **If you are reviewing security algorithms and threat models**: Read [docs/security/README.md](./security/README.md) and [docs/security/sandbox-threat-model.md](./security/sandbox-threat-model.md).
- **If you are preparing for the SIH Hackathon presentation**: Study [docs/sih/PITCH_AND_PRESENTATION.md](./sih/PITCH_AND_PRESENTATION.md) and [docs/sih/PPT_SLIDES_CONTENT.md](./sih/PPT_SLIDES_CONTENT.md).
