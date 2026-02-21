# Fluffy Assistant: Ultimate Information Dossier 🐰

This document serves as the single source of truth for the **Fluffy Integrated Assistant System** project. It consolidates all architectural, functional, and technical documentation.

---

## 📖 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Deep-Dive](#architecture-deep-dive)
3. [Core Systems & Features](#core-systems--features)
4. [Security Guardian Analysis](#security-guardian-analysis)
5. [Voice & AI Intelligence](#voice--ai-intelligence)
6. [Self-Improvement & Extension](#self-improvement--extension)
7. [Cross-Platform Support](#cross-platform-support)
8. [Networking & Remote Monitoring](#networking--remote-monitoring)
9. [Technical File Structure](#technical-file-structure)
10. [Setup & Configuration](#setup--configuration)
11. [Roadmap & Future Growth](#roadmap--future-growth)

---

## 1. Project Overview
**Fluffy Integrated Assistant System** is a lightweight, privacy-focused system monitor and security guardian for **Windows and Linux (Kali Linux)**. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

### Key Principles:
- **100% Local Processing**: All telemetry and analysis stay on the machine.
- **Privacy-First**: No data exfiltration or cloud dependencies for core functions.
- **High Performance**: Rust core ensures minimal system overhead during monitoring.
- **Intelligent Interaction**: Voice and LLM chat integration for hands-free control.
- **Cross-Platform**: Runs on both Windows and Linux with a shared codebase.

---

## 2. Architecture Deep-Dive
The system follows a **Three-Tier Hexagonal Architecture**, separating performance, intelligence, and interface.

### The Three Services:
1. **Core Service (Rust)**: The "Nervous System". Collects low-level metrics (CPU, RAM, Disk, Network) and executes hardware commands (Volume, Brightness).
   - **Port 9001**: Telemetry Broadcast (JSON over TCP).
   - **Port 9002**: Command Receiver.
2. **The Brain (Python)**: The "Frontal Lobe". Analyzes telemetry for threats, manages persistent memory, handles voice processing, and hosts the Web API.
   - **Port 5123**: Flask Web API.
3. **Frontend (Tauri/TS)**: The "Face". Modern desktop dashboard that visualizes data and sends user intents to the Brain.

### Communication Flow:
- **Telemetry**: Core → Brain (Persistent TCP stream every 2s).
- **Control**: UI → Brain (HTTP REST) → Core (TCP JSON).
- **Status**: UI ← Brain (REST Polling with token-based handshake).

---

## 3. Core Systems & Features

### System Monitoring
- **Real-Time Dashboards**: Interactive charts for CPU and RAM usage.
- **Process Hierarchy**: Full parent-child tree visualization with pinning, sorting, and search.
- **Precision Telemetry**: 10-second rigorous speed tests and ETW-based per-process network tracking (Windows).
- **App Running Indicators**: Green dot on installed apps that are currently running.

### Memory & Persistence
- **Dual-Layer Memory**:
  - **Long-Term**: Persistent JSON storage for user profiles and trusted process whitelists.
  - **Session-Based**: Context-aware buffers for multi-turn conversations.
- **Trusted Processes**: Learn once, trust forever. Guardian skips analysis for whitelisted processes.

### System Normalization (Enhanced)
- **One-Click Fix**: Resets Volume (50%), Brightness (70%).
- **Cache Cleaning**: Browser caches, system temp directories, package manager caches.
- **RAM Optimization**: Identifies unused services consuming memory.
- **Security Scan**: Triggers a global re-verification of all active processes.

### Application Management
- **Windows**: Registry-based discovery with icon extraction via PowerShell.
- **Linux**: `.desktop` file scanning with freedesktop icon lookup.
- **App Cache**: `fluffy_data/apps.json` with 24-hour auto-refresh and manual scan button.
- **Launch/Uninstall**: Direct app launching; uninstall triggers native uninstaller (Windows only).

### Multi-Step Command Execution
- LLM parser detects chained commands (e.g., "open notepad and write hello world").
- Sequential execution with configurable delays between steps.

---

## 4. Security Guardian Analysis
The Guardian is a behavioral security engine that uses historical baselines to detect anomalies without signatures.

### The 5 Pillars of Detection:
1. **Path Integrity**: Execution from suspicious directories — `%TEMP%` (Windows), `/tmp/`, `/dev/shm/` (Linux). (+30 Risk)
2. **Resource Anomalies**: CPU/RAM usage exceeding 3x the historical average. (+20 Risk)
3. **Child Spawning**: Rapid creation of command-line sub-processes. (+25 Risk)
4. **Persistence**: Unauthorized monitoring of Registry startups (Windows). (+40 Risk)
5. **Background Activity**: Disk I/O while UI idle. (+15 Risk)

### Learning Phase:
- On first run, the system enters a **5-minute Learning Phase**.
- It establishes behavioral baselines (EMA-based) for every process.
- Alerts are suppressed during this phase to prevent false positives.

---

## 5. Voice & AI Intelligence

### Voice System
- **Offline STT**: Uses the **Vosk** engine for zero-cloud speech recognition.
- **Neural TTS**: Uses **Piper** for high-quality, natural-sounding audio feedback.
- **Confirmation Flow**: Potentially dangerous commands require verbal confirmation.
- **Interrupt Commands**: "Shut up", "Stop", "Cancel" instantly stops TTS and clears pending actions.

### LLM Chat
- **Multi-Provider**: Support for OpenAI, Claude (Anthropic), Groq, and local Ollama instances.
- **Intent Classification**: Classifier determines if the user wants to execute a command or just chat.
- **Context Awareness**: Remembers the last 10 exchanges for conversational continuity.
- **Self-Healing Code Generation**: Extension code is validated in a loop; syntax errors are sent back to the LLM for fixing.

---

## 6. Self-Improvement & Extension

### The Self-Improvement Cycle:
1. **Observation**: Detects when it cannot handle a user request.
2. **Architecture**: Designs a new Python extension to handle the missing logic.
3. **Generation**: `CodeGenerator` writes a compliant extension file with syntax validation.
4. **Integration**: `ExtensionLoader` dynamically loads the new capability into the Brain.

### Created Extensions:
- **Bluetooth Control**: Toggle Bluetooth on/off (Windows PowerShell + Linux rfkill/bluetoothctl).
- **WiFi Scanner**: Scan available WiFi networks (cross-platform: `netsh`/`iwlist`/`airport`).

---

## 7. Cross-Platform Support

### Platform Abstraction Layer (`brain/platform_utils.py`)
All OS-specific operations are centralized in one module:

| Operation | Windows | Linux |
|-----------|---------|-------|
| Kill process | `taskkill /IM` | `pkill -f` |
| Open file | `os.startfile()` | `xdg-open` |
| Open folder | `explorer` | `xdg-open` |
| System commands | `shutdown /s`, `rundll32` | `systemctl`, `loginctl` |
| App discovery | Registry scan | `.desktop` file scan |
| Suspicious paths | `\temp\`, `\appdata\` | `/tmp/`, `/dev/shm/` |

### Rust Core
- Windows-only crates (`windows-sys`, `ferrisetw`) scoped under `[target.'cfg(windows)'.dependencies]`.
- `#[cfg(target_os)]` branches for process killing, startup management, battery, Bluetooth.
- Linux uses `kill -9` instead of `taskkill`; startup management returns "not supported" stubs.

---

## 8. Networking & Remote Monitoring

### Admin-Client Architecture
- **Available Mode**: Machine broadcasts availability on a configurable port.
- **Admin Mode**: Admin connects to available machines, polls their system data.
- **Client Notifications**: Clients are notified when an admin connects and monitors them.
- **Full Process View**: Admin sees complete process list from connected clients.

### FTP File Sharing
- Built-in FTP server with secure numeric password generation.
- QR code for mobile pairing.
- Client connection management with disconnect capability.
- Real-time transfer speed and activity monitoring.

---

## 9. Technical File Structure

```text
/
├── core/                  # Rust Core (telemetry, IPC, commands)
│   └── src/
│       ├── main.rs        # Entry point, system stats, spawn helpers
│       ├── ipc/receiver.rs # KillProcess, Startup, Normalize
│       └── etw.rs         # Network monitoring (Windows ETW)
├── brain/                 # Python Intelligence Layer
│   ├── listener.py        # IPC client, main entry
│   ├── web_api.py         # Flask API (port 5123)
│   ├── platform_utils.py  # Cross-platform abstraction
│   ├── app_utils.py       # App discovery (registry / .desktop)
│   ├── command_executor.py # Voice/chat command execution
│   ├── security_monitor.py # Behavioral threat scoring
│   ├── guardian/          # Baseline, anomaly, chain, scorer
│   ├── memory/            # Long-term + session memory
│   └── extensions/        # Dynamic plugins (bluetooth, wifi)
├── ai/                    # LLM service, intent classification
├── voice/                 # Vosk STT + Piper TTS
├── ui/tauri/              # Tauri frontend (TypeScript + Vite)
├── fluffy/network/        # Admin-client & FTP services
├── services/              # Background services
├── setup_env.bat          # Windows setup (batch)
├── setup_env.ps1          # Windows setup (PowerShell)
├── setup_env.sh           # Linux setup (bash)
└── documentation/         # All project docs
```

---

## 10. Setup & Configuration

### One-Click Setup
- **Windows**: Run `setup_env.bat` or `setup_env.ps1`
- **Linux**: Run `chmod +x setup_env.sh && ./setup_env.sh`

Both scripts handle:
1. Python venv creation + `brain/requirements.txt` install
2. Node.js `npm install` for Tauri UI
3. Rust `cargo check` for the core
4. `.env.example` → `.env` copy (for API keys)
5. Linux system packages (webkit2gtk, gtk3, libssl, bluez, rfkill)

### Prerequisites:
- Rust (Cargo), Python 3.8+, Node.js 18+ (for Tauri)

### Quick Start:
1. **Core**: `cd core && cargo run`
2. **Brain**: `cd brain && python listener.py`
3. **UI**: `cd ui/tauri && npm run tauri dev`

### LLM Configuration:
- Create a `.env` file in the root (or let setup script copy `.env.example`).
- Add `OPENROUTER_API_KEY` and choose your model (e.g., `openai/gpt-3.5-turbo`).

---

## 11. Roadmap & Future Growth
- **Cross-Platform**: ✅ Windows + Linux (Kali) support implemented
- **Mobile**: Companion app for remote system monitoring
- **Network Fortress**: Deep packet inspection and domain-level firewalling
- **Collaborative Intelligence**: Peer-to-peer sharing of threat baselines
- **Multi-Device Monitoring**: ✅ Admin-client architecture implemented
- **AI-Driven Self-Improvement**: ✅ Auto-extension generation with syntax validation
- **Voice & AI Integration**: ✅ Multi-step command execution
- **System Normalization**: ✅ Enhanced with cache cleaning and RAM optimization
- **Performance Optimization**: Continuous optimization and scaling
- **Becomes an OS**: Long-term vision — Fluffy Assistant as a full operating system

---
*Last Updated: February 21, 2026 | Fluffy Assistant Documentation Project*
