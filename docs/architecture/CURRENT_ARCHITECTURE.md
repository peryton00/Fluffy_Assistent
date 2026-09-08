# Fluffy Assistant: Current Architecture Document (Pre-Refactor Baseline)

This document describes the state of the **Fluffy Assistant / Fluffy Desktop** architecture prior to the Phase 1 architectural refactor. All descriptions reflect the active, working codebase.

---

## 1. High-Level Architecture Overview

Fluffy Assistant is an integrated system monitor, anomaly detection guardian, and intelligent desktop assistant designed for Windows and Linux. The system is split into three primary layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop UI                         │
│         (Vite + TypeScript + HTML/CSS Frontend)             │
└──────────────────────────▲──────────────────────────────────┘
                           │
             HTTP REST & SSE (Port 5123)
             WebSocket Terminal (Port 9003)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Python Brain Daemon                       │
│    (Flask API, Telemetry Ingestion, LLM Agent, Guardian)    │
└──────────────────────────▲──────────────────────────────────┘
                           │
             Telemetry Ingestion TCP (Port 9001)
             Command Execution TCP (Port 9002)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Rust Native Core                         │
│  (System Metrics, Process Tree, Safety, Shell, WS Bridge)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Subsystems

### 2.1 Native Rust Core (`core/`)
* **Binary Entrypoint (`src/main.rs`)**:
  - Initializes the Tokio async runtime.
  - Starts Telemetry Broadcaster on TCP `127.0.0.1:9001`.
  - Starts Command Listener on TCP `127.0.0.1:9002`.
  - Starts WebSocket Terminal Bridge on WS `127.0.0.1:9003`.
  - Starts LAN Admin Listener on TCP `0.0.0.0:9000`.
  - Spawns sub-processes: Python daemon (`brain/listener.py`) and Tauri UI (`ui/tauri`).
  - Samples OS system metrics (CPU, RAM, per-process stats, network throughput, battery, bluetooth, startup registry entries) every 2 seconds and broadcasts JSON payloads.
* **Actions (`src/actions/`)**:
  - `filesystem.rs`: File and folder operations (create, delete, move, copy).
  - `launcher.rs`: Discovers installed apps in Windows Registry / Linux `/usr/bin` and launches binaries.
  - `safety.rs`: Validates paths against protected system directories (`C:\Windows`, `/etc`, etc.) and categorizes actions as `Safe`, `NeedsConfirmation`, or `Blocked`.
* **IPC Protocol (`src/ipc/`)**:
  - `server.rs`: Broadcasts `FluffyMessage` telemetry structures over TCP socket.
  - `receiver.rs`: Parses `Command` JSON commands from Python Brain, evaluates permissions, and dispatches actions.
* **Permissions (`src/permissions/`)**:
  - `policy.rs`: Enforces safety boundaries (e.g., protecting PID < 100, requiring confirmation for process termination, startup registry modification, or system cleanup).
* **Terminal (`src/terminal/`)**:
  - Interactive REPL and WebSocket bridge for frontend terminal streaming.
  - Agent manager for LAN remote machines running `fluffy-client`.

### 2.2 Python Brain Intelligence Layer (`brain/`, `ai/`, `fluffy/`, `services/`, `voice/`)
* **Runtime Loop (`brain/listener.py`)**:
  - Connects to Rust Core TCP socket `127.0.0.1:9001`.
  - Ingests telemetry, computes system health, updates global state (`brain/state.py`), and invokes Guardian engine analysis.
  - Starts Flask Web API daemon on port `5123`.
  - Generates or reads `FLUFFY_TOKEN` from `.env`.
* **Web API Server (`brain/web_api.py`)**:
  - Exposes REST API and Server-Sent Events (SSE) stream on port `5123`.
  - Requires `X-Fluffy-Token` header for authenticated endpoints.
  - Blueprints in `brain/routes/`: `voice_routes.py`, `ftp_routes.py`, `cluster_routes.py`, `network_routes.py`, `extension_routes.py`, `terminal_routes.py`.
* **Agent & Command Pipeline**:
  - `brain/llm_command_parser.py`: Two-stage LLM parser (Stage 1 fast classification -> Stage 2 parameter extraction).
  - `brain/intent_router.py`: Deterministic intent routing (pending validations -> self-improvement -> system commands -> extensions -> chat).
  - `brain/command_executor.py`: Dispatches commands to Rust Core (port 9002) or native Python handlers.
  - `brain/action_validator.py`: Validates command safety before execution.
* **Guardian Engine (`brain/guardian/`)**:
  - Continuous behavioral analysis: process fingerprinting (`fingerprint.py`), rolling baselines (`baseline.py`), anomaly detection (`anomaly.py`), attack chain analysis (`chain.py`), risk scoring (`scorer.py`), and incident audit logging (`audit.py`).
* **Memory Subsystem**:
  - `brain/chat_history.py`: Conversation persistence in `data/sessions/*.json` with `data/chat_index.json`.
  - `brain/memory/session_memory.py`: In-flight action memory, pending confirmations, and self-improvement state.
  - `brain/memory/long_term_memory.py`: Persistent user preferences, trusted processes, and habits in `fluffy_data/memory/long_term.json`.
  - `brain/guardian/memory.py`: Known process behavior and trust records in `fluffy_data/guardian/memory.json`.
* **AI Provider Client (`ai/src/`)**:
  - Multi-provider LLM interface (`llm_client.py`, `llm_config.py`, `llm_service.py`) supporting Groq, OpenRouter, OpenAI, Anthropic, and Ollama.
* **Voice Engine (`voice/`)**:
  - Offline Vosk Speech-to-Text (`voice/stt/stt_engine.py`) and Piper Text-to-Speech (`voice/tts/speaker.py`).
* **Self-Improving Extensions (`brain/`)**:
  - `extension_creator.py`, `extension_loader.py`, `code_generator.py`, `code_validator.py`, `self_improver.py`: Generates Python plugins on demand, performs AST validation, and hot-loads into `brain/extensions/`.
* **FTP File Sharing (`services/ftp_service.py`)**:
  - Local network `pyftpdlib` server on port `2121` with dynamic random credentials, QR code generation (`services/utils/qr_generator.py`), and speed tracking.
* **LAN P2P Network (`fluffy/network/`)**:
  - Node role manager (`standalone`, `available`, `admin`) for cross-machine monitoring.

### 2.3 Desktop User Interface (`ui/tauri/`)
* **Tauri v2 Shell (`ui/tauri/src-tauri/`)**:
  - Window management, system tray integration, and native process lifecycle hooks.
* **Frontend Dashboard (`ui/tauri/src/`)**:
  - Single-page application rendered with TypeScript (`main.ts`) and CSS (`styles.css`, `styles-enhanced.css`, `chat-styles.css`, `ftp-styles.css`, `network-styles.css`, `terminal.css`).
  - Connects to Flask API (port 5123) for state polling and SSE chat streaming.
  - Connects to Core WebSocket (port 9003) for interactive terminal streaming.

---

## 3. Persistent Storage and Data Assets

| Location | Purpose | Format |
|:---|:---|:---|
| `data/sessions/*.json` | Individual chat conversation logs | JSON |
| `data/chat_index.json` | Index of chat sessions and active session ID | JSON |
| `fluffy_data/apps.json` | Cache of installed software discovered via registry/filesystem | JSON |
| `fluffy_data/guardian/baselines.json` | 5-minute rolling metrics and process usage baselines | JSON |
| `fluffy_data/guardian/memory.json` | Trusted processes and historical anomaly scores | JSON |
| `fluffy_data/guardian/audit.json` | Audit log of security alerts and verdicts | JSON |
| `fluffy_data/memory/long_term.json` | Persistent user preferences and habits | JSON |
| `brain/extensions/registry.json` | Dynamic extension registry and active patterns | JSON |
| `.env` | Environment configuration (`PYTHON_PATH`, `FLUFFY_TOKEN`, API keys) | Key=Value |
