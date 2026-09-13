# Fluffy Integrated Assistant System

**Fluffy Integrated Assistant System** is a lightweight, privacy-focused system monitor, anomaly detection guardian, and intelligent operations workbench for **Windows and Linux**. It combines high-performance native system monitoring and capability execution (Rust Core), intelligent behavioral analysis and autonomous agent orchestration (Python Brain), and a modern desktop operations workbench (Tauri v2 / React 18 / TypeScript).

The platform provides real-time system observability, detects suspicious process behavior using baseline anomaly scoring, manages system health and resources, offers hands-free voice and multi-provider LLM interaction, and enables remote multi-machine administration over local networks.

---

## Key Features

- **Cross-Platform**: Unified codebase supporting Windows (with native ETW, Win32 registry hooks, and PowerShell integrations) and Linux (procfs, freedesktop, systemd).
- **Industrial Operations Workbench**: High-density, theme-aware desktop interface built with Tauri v2, React 18, Vite, TypeScript, and vector SVG iconography.
- **Security Guardian**: Signature-less behavioral anomaly engine establishing rolling baselines, evaluating process execution chains, detecting unauthorized spikes/persistence, and generating real-time risk verdicts.
- **Autonomous Agent & Tool Runtime**: Multi-stage intent parsing, tool execution runtime, policy validation, safe sandboxing, and dynamic self-improving plugin creation.
- **Multi-Provider AI Intelligence**: Local and cloud LLM routing (Groq, OpenRouter, OpenAI, Anthropic, Ollama) with SSE real-time streaming and parameter clarification.
- **Offline Voice Integration**: 100% local Speech-to-Text (Vosk) and Text-to-Speech (Piper) for hands-free queries and voice alert notifications.
- **Dual-Layer Memory**: Session memory for conversational context alongside persistent storage for user profiles, preferences, and trusted process whitelists.
- **LAN Remote Administration & Terminal**: Interactive terminal REPL with WebSocket streaming (Port 9003) and reverse TCP client administration (Port 9000) for managing remote nodes.
- **FTP File Sharing**: Built-in FTP server (Port 2121) with dynamic authentication, QR code pairing, active transfer metrics, and client session management.
- **System Normalization**: One-click cleanup operations, cache purging, RAM optimization, and comprehensive security re-scans.
- **Privacy-First**: 100% local processing by default with zero mandatory cloud telemetry or data exfiltration.

---

## System Architecture

The application is structured into three integrated tiers communicating via strict local IPC and network protocols:

```
+-------------------------------------------------------------------+
|               Tauri Desktop Operations Workbench                  |
|               (React 18 + TypeScript + Vite UI)                  |
+---------------------------------^---------------------------------+
                                  |
              HTTP REST & SSE Stream (Port 5123)
              WebSocket Terminal Bridge (Port 9003)
                                  |
+---------------------------------v---------------------------------+
|                      Python Brain Daemon                          |
|  (Guardian Engine, Agent, Knowledge, Tools, Memory, Web API)     |
+---------------------------------^---------------------------------+
                                  |
              Telemetry Ingestion TCP (Port 9001)
              Command Execution TCP (Port 9002)
                                  |
+---------------------------------v---------------------------------+
|                       Rust Native Core                            |
| (System Telemetry, Capability Dispatch, Safety, Terminal REPL)   |
+-------------------------------------------------------------------+
```

### 1. Rust Native Core (`core/`)
- Samples OS telemetry (CPU, RAM, per-process trees, network throughput, battery, bluetooth, startup registry keys) every 2 seconds.
- Broadcasts telemetry JSON payloads over TCP Port `9001`.
- Listens for command execution requests over TCP Port `9002` and enforces path and PID safety policies (`policy.rs`).
- Hosts the interactive Terminal REPL, WebSocket bridge (`ws://127.0.0.1:9003`), and LAN admin listener (TCP Port `9000`).
- Provides first-class capability dispatch for filesystem operations, application launching, process termination, and system normalization sweeps.

### 2. Python Brain Intelligence (`brain/`)
- Connects to Core telemetry on Port `9001` and evaluates system pressure signals.
- Runs the **Guardian Engine** (`brain/guardian/`): rolling baselines, anomaly detection, process fingerprinting, attack chain analysis, risk scoring, and audit logging.
- Runs the **Autonomous Agent & Tool Runtime** (`brain/agent/`, `brain/tools/`): two-stage intent classification, parameter extraction, and sandboxed tool execution.
- Manages **Semantic Memory & Knowledge** (`brain/memory/`, `brain/knowledge/`): session context, user preferences, trusted process memory, and vector retrieval.
- Serves the **Web API & SSE Server** on Port `5123` (`brain/web_api.py`) with token-based authentication (`X-Fluffy-Token`).
- Houses dynamic plugin self-improvement routines (`brain/extensions/`).

### 3. Tauri Desktop UI (`ui/tauri/`)
- Desktop client built with Tauri v2, React 18, TypeScript, and modular CSS/Tailwind tokens.
- Organizes features into dedicated operational workspaces:
  - **Systems Overview & Hardware**: Live CPU/RAM/Disk metrics, battery state, process tree hierarchy, startup entries.
  - **Guardian & Security**: Behavioral risk scores, anomaly detections, incident audit history, and learning phase status.
  - **Operations & Normalization**: Process management, cache cleaning, RAM optimization, application launcher.
  - **Terminal & Remote Cluster**: Interactive console, remote client nodes management, and client binary deployment.
  - **Chat & Voice**: Multi-modal AI conversation, voice interaction controls, tool execution artifacts, and session history.
  - **Knowledge & Artifacts**: Generated code viewing, RAG query inspection, and persistent document storage.
  - **Extensions & Tools**: Dynamic plugin status, manifest inspection, and capability hot-reloading.
  - **Analytics & Observability**: Real-time throughput metrics, historical utilization charts, and network logs.
  - **Settings & Sovereignty**: API keys configuration, model selection, voice model settings, FTP server controls.

---

## Workspace Directory Map

```text
FluffyAssistent/
|-- .agents/                    # Workspace agent guidelines and workflow rules
|-- .env / .env.example         # System credentials, ports, and model configurations
|-- assets/                     # Icons, Piper TTS binaries, Vosk speech models
|-- brain/                      # Python Intelligence, Guardian, Agent & API Layer
|   |-- agent/                  # Intent classification, parser, planner, dispatcher
|   |-- ai/                     # Multi-provider LLM clients, prompt schemas, router
|   |-- context/                # Context injection and conversation window managers
|   |-- extensions/             # Dynamic plugin runtime, self-improver, code generator
|   |-- guardian/               # Anomaly detection, baselines, risk scorer, audit logs
|   |-- knowledge/              # Embeddings, vector storage, document ingestion
|   |-- mcp/                    # Model Context Protocol registry, client, transports
|   |-- memory/                 # Session history, user profiles, trusted entities
|   |-- routes/                 # Flask Blueprints (voice, ftp, cluster, terminal, etc.)
|   |-- runtime/                # Ingest daemon (listener.py), global state, TCP clients
|   |-- sandbox/                # Restricted Python execution sandbox
|   |-- security/               # ActionValidator policy guards and auth decorators
|   |-- tools/                  # Tool registry, filesystem/app tools, interrupt handler
|   |-- listener.py             # Brain daemon entrypoint
|   `-- web_api.py              # REST API and SSE stream server (Port 5123)
|-- core/                       # Rust Native Core Engine
|   |-- Cargo.toml              # Dependencies (sysinfo, tokio, windows-sys, tungstenite)
|   `-- src/
|       |-- actions/            # Native OS execution actions (files, launcher, safety)
|       |-- capabilities/       # First-class system capability registry and dispatch
|       |-- ipc/                # TCP 9001 broadcaster and TCP 9002 command receiver
|       |-- permissions/        # Safety policies and path traversal guards
|       |-- terminal/           # WS 9003 bridge, TCP 9000 admin listener, REPL
|       `-- main.rs             # Core entrypoint and telemetry loop
|-- docs/                       # Comprehensive Architecture & Subsystem Documentation
|   |-- ai/                     # Local AI runtime and model router specifications
|   |-- architecture/           # Agent orchestration, contracts, capability runtime
|   |-- development/            # Developer setup, IPC debugging, contribution guide
|   |-- security/               # Guardian threat models, sandbox limitations, policies
|   |-- sih/                    # SIH project blueprint and capability matrix
|   `-- *.md                    # Workspace-specific specifications
|-- fluffy/                     # Distributed networking and LAN role management
|-- installer/                  # Inno Setup scripts and Windows installer build pipeline
|-- services/                   # Background services (FTP server, QR code generator)
|-- ui/tauri/                   # Tauri v2 + React 18 Desktop Application
|   |-- src/                    # React components, features, stores, services, styles
|   `-- src-tauri/              # Rust Tauri shell configuration and window hooks
|-- voice/                      # Offline Vosk STT engine and Piper TTS speaker pipeline
`-- agent.md                    # Master developer and AI agent technical guide
```

---

## Prerequisites

Ensure the following prerequisites are installed on your system:

- **Rust toolchain** (Cargo & rustc 1.75+): [Install Rust](https://www.rust-lang.org/tools/install)
- **Python** (3.10 or 3.11 recommended): [Install Python](https://www.python.org/downloads/)
- **Node.js** (v18 or v20 LTS) & npm: [Install Node.js](https://nodejs.org/)
- **C++ Build Tools**: Required on Windows for compiling native dependencies.

---

## Installation & Setup

### Automated Setup (Recommended)

Run the setup script for your operating system from the repository root:

**Windows (PowerShell):**
```powershell
powershell -File setup_env.ps1
```

**Windows (Command Prompt):**
```cmd
setup_env.bat
```

**Linux (Debian / Ubuntu / Kali):**
```bash
chmod +x setup_env.sh && ./setup_env.sh
```

The script configures the Python virtual environment (`.venv`), installs all backend dependencies, installs frontend Node modules in `ui/tauri`, verifies the Rust toolchain, and initializes your `.env` configuration.

### Manual Setup

If you prefer step-by-step installation:

```bash
# 1. Initialize Python virtual environment & install requirements
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux:
source .venv/bin/activate
pip install -r brain/requirements.txt

# 2. Install Frontend Node modules
cd ui/tauri
npm install
cd ../..

# 3. Verify Rust Core build
cd core
cargo check
cd ..
```

---

## Running the Application

### Option A: Standard Launch (Rust Core Auto-Spawn)

Starting the Rust Core automatically initializes the background Python daemon and the Tauri desktop dashboard:

```bash
cd core
cargo run
```

- Telemetry Broadcaster runs on TCP `127.0.0.1:9001`.
- Command Receiver listens on TCP `127.0.0.1:9002`.
- WebSocket Bridge listens on WS `127.0.0.1:9003`.
- Admin LAN server listens on TCP `0.0.0.0:9000`.
- Python Brain auto-spawns and serves Web API on HTTP `127.0.0.1:5123`.
- Tauri Desktop Workbench opens automatically.

### Option B: Multi-Terminal Launch (Development Mode)

For granular debugging, run each component in a separate terminal:

**Terminal 1: Rust Core**
```bash
cd core
cargo run
```

**Terminal 2: Python Brain**
```bash
# Activate virtual environment first
.venv\Scripts\activate   # Windows
source .venv/bin/activate # Linux
cd brain
python listener.py
```

**Terminal 3: Tauri React Workbench**
```bash
cd ui/tauri
npm run tauri dev
```

---

## Configuration & Environment Variables

Copy `.env.example` to `.env` in the root directory to configure services:

```env
# System Token for IPC Authentication
FLUFFY_TOKEN=your_secure_random_token_here

# Python Runtime Path
PYTHON_PATH=.venv/Scripts/python.exe

# LLM Providers (Optional for cloud models)
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Local Ollama Configuration (Optional)
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

---

## Documentation Index

Comprehensive documentation for all subsystems is maintained in the [`docs/`](./docs/) directory and [`agent.md`](./agent.md):

- [**Master Developer & Agent Guide**](./agent.md): Complete architectural breakdown, function-to-file mappings, IPC contracts, and execution flows.
- [**Development & Debugging Guide**](./docs/development/README.md): Environment setup, IPC tracing, testing strategies, and build guidelines.
- [**Security & Guardian Architecture**](./docs/security/README.md): Threat models, anomaly scoring algorithms, sandbox constraints, and policy enforcement.
- [**AI & LLM Architecture**](./docs/ai/README.md): Model routing, local runtime specs, and prompt pipelines.
- [**System Workspaces**](./docs/systems-workspace.md): Specifications for hardware, process hierarchy, and telemetry.
- [**Terminal & Remote Administration**](./docs/terminal-workspace.md): Reverse TCP shell, WebSocket bridge, and LAN node clustering.
- [**Operations & Normalization**](./docs/operations-workspace.md): Normalization sweeps, application discovery, and file operations.
- [**Chat & Voice Subsystem**](./docs/chat-voice-workspace.md): Multi-modal conversational interface and offline STT/TTS.
- [**SIH Project Blueprint**](./docs/sih/README.md): Innovation overview, system capabilities matrix, and roadmap.

---

## License

This project is licensed under the MIT License.
