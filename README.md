# Fluffy Integrated Assistant System 🐰

**Fluffy Integrated Assistant System** is a lightweight, privacy-focused system monitor and security guardian for **Windows and Linux (Kali Linux)**. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

The goal is to provide users with real-time insights into their system's health, detect suspicious behavior (malware-like patterns), and offer quick "normalization" tools to optimize their environment.

## 🚀 Features

-   **Cross-Platform**: Works on Windows and Linux (Kali Linux) with a unified codebase.
-   **Premium "Industrial" UI**: A high-fidelity, theme-aware dashboard built with Tauri and vectorized Lucide icons.
-   **Security Guardian**: Real-time behavioral analysis detecting suspicious process chains, spikes, and persistence.
-   **Memory System**: Persistent user preferences and trusted processes that survive restarts.
-   **Voice & LLM Chat**: Offline voice commands (Vosk STT, Piper TTS) + multi-provider LLM (OpenAI, Anthropic, Groq, Ollama).
-   **Self-Improving Extensions**: AI-generated plugins with syntax validation loop.
-   **Admin-Client Networking**: Remote monitoring of multiple machines over LAN.
-   **FTP File Sharing**: Built-in FTP server with QR code pairing and client management.
-   **Multi-Step Commands**: Chain multiple actions (e.g., "open notepad and write hello world").
-   **Interrupt Commands**: Cancel pending actions with natural commands (stop, cancel, abort, etc.).
-   **Hybrid Telemetry**: Professional network tracking using high-precision Kbps for live monitoring and Mbps for broadband benchmarking.
-   **Process Hierarchy**: Advanced process tree visualization with pinning, sorting, running indicators, and deep-link actions.
-   **Enhanced Normalization**: Cache cleaning, RAM optimization, temp purge, security scan.
-   **Privacy-First**: 100% local processing; no cloud dependencies or data exfiltration.


## 🏗️ Architecture

The application follows a Hexagonal Architecture split into three services:

1.  **Core (Rust)**: Handles low-level system interactions (monitoring, process management, volume/brightness).
2.  **Brain (Python)**: The intelligence layer. Analyzes telemetry for threats, manages state, and exposes a Web API.
3.  **Frontend (Tauri/TypeScript)**: The user interface. Displays data and sends user commands to the Brain.

For a deep dive into the architecture, please refer to [`agent.md`](./documentation/agent.md).

## 🛠️ Prerequisites

Ensure you have the following installed:

-   **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
-   **Python**: [Install Python](https://www.python.org/downloads/) (3.8+)
-   **Node.js & npm**: [Install Node.js](https://nodejs.org/)
-   **Tauri CLI**: `npm install -g @tauri-apps/cli` (Optional, but recommended)

## 📦 Installation & Setup

### One-Click Setup (Recommended)
Clone the repository and run the appropriate setup script:

**Windows:**
```bash
setup_env.bat
# or
powershell -File setup_env.ps1
```

**Linux (Kali/Debian/Ubuntu):**
```bash
chmod +x setup_env.sh && ./setup_env.sh
```

The setup script handles everything: Python venv, pip dependencies, Node.js modules, Rust toolchain check, and `.env` configuration.

### Manual Setup

If you prefer manual setup:

```bash
# 1. Python venv + dependencies
python -m venv .venv
.venv/Scripts/activate   # Windows
source .venv/bin/activate # Linux
pip install -r brain/requirements.txt

# 2. Node.js dependencies (Tauri UI)
cd ui/tauri && npm install && cd ../..

# 3. Rust core
cd core && cargo build --release && cd ..
```

## 🚀 Running the Application

Start all three components (or let the Core auto-spawn Brain + UI):

**Terminal 1: Start Core**
```bash
cd core && cargo run
```
*Listens on port 9002 for commands, broadcasts telemetry on port 9001, auto-spawns Brain + UI.*

**Terminal 2: Start Brain** (if not auto-spawned)
```bash
cd brain && python listener.py
```
*Connects to Core, starts Security Monitor, serves Web API on port 5123.*

**Terminal 3: Start UI** (if not auto-spawned)
```bash
cd ui/tauri && npm run tauri dev
```
*Launches the desktop application window.*

## ✨ Key Features (February 2026)

### Cross-Platform Support
- Full Windows + Linux (Kali Linux) compatibility
- Platform abstraction layer (`brain/platform_utils.py`) centralizes all OS-specific operations
- Rust core uses `#[cfg(target_os)]` for conditional compilation
- One-click setup scripts for both platforms

### Admin-Client Remote Monitoring
- Connect to and monitor multiple machines over LAN
- Full process list view from remote machines
- Client notification when admin connects

### FTP File Sharing
- Built-in FTP server with secure password generation
- QR code for mobile pairing
- Client disconnect management

### Self-Improving Extensions
- AI-generated plugins with syntax validation loop
- Created: Bluetooth control (Windows + Linux), WiFi scanner

### Memory System
- Persistent preferences and trusted processes across restarts
- Session memory for multi-step conversations

### Multi-Step Commands
- Chain actions: "open notepad and write hello world"
- Sequential execution with configurable delays

For detailed documentation, see the [`documentation/`](./documentation/) folder:
- [`agent.md`](./documentation/agent.md) — Architecture overview & AI agent briefing
- [`information.md`](./documentation/information.md) — Complete project dossier
- [`FUNCTIONALITY_GUIDE.md`](./documentation/FUNCTIONALITY_GUIDE.md) — Core features
- [`CODE_EXPLANATIONS.md`](./documentation/CODE_EXPLANATIONS.md) — Implementation details
- [`VOICE_SETUP.md`](./documentation/VOICE_SETUP.md) — Voice & Audio configuration
- [`LLM_SETUP.md`](./documentation/LLM_SETUP.md) — AI Brain configuration

## 📝 Development Notes

-   **API Security**: Uses a token-based handshake (`X-Fluffy-Token`) for all inter-service communication.
-   **Platform Utils**: Always use `brain/platform_utils.py` for OS-specific operations — never add bare `taskkill`, `explorer`, or `os.startfile()` calls.
-   **Precision Telemetry**: The "Internet Speed Test" runs for a rigorous 10 seconds to ensure ISP-grade Mbps accuracy.
-   **Theme Engine**: Automatically detects system theme preferences while offering a manual override.

> [!TIP]
> **Complete Project Dossier**: For a single, consolidated document, refer to [**`documentation/information.md`**](./documentation/information.md).

## 📄 License

