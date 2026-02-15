# Fluffy Integrated Assistant System 🐰

**Fluffy Integrated Assistant System** is a lightweight, privacy-focused system monitor and security guardian for Windows. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

The goal is to provide users with real-time insights into their system's health, detect suspicious behavior (malware-like patterns), and offer quick "normalization" tools to optimize their environment.

## 🚀 Features

-   **Premium "Industrial" UI**: A high-fidelity, theme-aware dashboard built with Tauri and vectorized Lucide icons.
-   **Security Guardian**: Real-time behavioral analysis detecting suspicious process chains, spikes, and persistence.
-   **Memory System** (NEW): Persistent user preferences and trusted processes that survive restarts.
-   **Interrupt Commands** (NEW): Cancel pending actions with natural commands (stop, cancel, abort, etc.).
-   **Hybrid Telemetry**: Professional network tracking using high-precision Kbps for live monitoring and Mbps for broadband benchmarking.
-   **Process Hierarchy**: Advanced process tree visualization with pinning, sorting, and deep-link actions (Folder/Google search).
-   **Customizable Layout**: Reorderable dashboard components saved instantly to local state.
-   **Normalization Engine**: One-click system optimization and optimization routines.
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

Clone the repository and follow these steps to set up each component.

### 1. Core (Rust)

Navigate to the `core` directory and build the project:

```bash
cd core
cargo build --release
```

### 2. Brain (Python)

Navigate to the `brain` directory and install dependencies:

```bash
cd brain
pip install flask
# If other dependencies are needed, install them (e.g., standard libraries usually sufficent)
```

### 3. Frontend (UI)

Navigate to the `ui` directory (specifically `ui/tauri` where `package.json` resides) and install dependencies:

```bash
cd ui/tauri
npm install
```

## 🚀 Running the Application

To run the full system, you need to start all three components. It is recommended to use separate terminal windows.

**Terminal 1: Start Core**

```bash
cd core
cargo run
```

*The Core service listens on port 9002 for commands and broadcasts telemetry on port 9001.*

**Terminal 2: Start Brain**

```bash
cd brain
python listener.py
```

*The Brain connects to the Core, starts the Security Monitor, and serves the Web API on port 5123.*

**Terminal 3: Start UI**

```bash
cd ui/tauri
npm run tauri dev
```

*This will launch the desktop application window.*

## ✨ New Features (February 2026)

### Memory System
Fluffy now remembers your preferences and trusted processes across restarts:
- **Persistent Storage**: User preferences saved to `fluffy_data/memory/long_term.json`
- **Trusted Processes**: Whitelist processes permanently (no more re-trusting after restart)
- **Session Memory**: Track multi-step conversations and pending actions
- **API Endpoints**: 8 new endpoints for memory management

### Interrupt Commands
Take control of pending actions with natural commands:
- **Keywords**: `stop`, `cancel`, `abort`, `quit`, `exit`, `mute`, `quiet`, `shut up`, `never mind`, `forget it`
- **Multi-Action Cancellation**: Stops TTS, clears pending intents, removes confirmations
- **API Endpoints**: 3 new endpoints for interrupt handling

For detailed documentation, see the following in the [`documentation/`](./documentation/) folder:
- [`FUNCTIONALITY_GUIDE.md`](./documentation/FUNCTIONALITY_GUIDE.md) - Core features
- [`CODE_EXPLANATIONS.md`](./documentation/CODE_EXPLANATIONS.md) - Implementation details
- [`VOICE_SETUP.md`](./documentation/VOICE_SETUP.md) - Voice & Audio configuration
- [`STT_SETUP.md`](./documentation/STT_SETUP.md) - Speech-to-Text setup
- [`LLM_SETUP.md`](./documentation/LLM_SETUP.md) - AI Brain configuration
- [`LEARNING_PHASE.md`](./documentation/LEARNING_PHASE.md) - Guardian behavior details
- [`agent.md`](./documentation/agent.md) - Technical architecture overview

## 📝 Development Notes


-   **API Security**: Uses a token-based handshake (`X-Fluffy-Token`) for all inter-service communication.
---

> [!TIP]
> **Complete Project Dossier**: For a single, consolidated document containing all technical, architectural, and setup information, refer to [**`documentation/information.md`**](./documentation/information.md).
-   **Precision Telemetry**: The "Internet Speed Test" runs for a rigorous 10 seconds to ensure ISP-grade Mbps accuracy.
-   **Theme Engine**: Automatically detects system theme preferences while offering a manual override.

## 📄 License

