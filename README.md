# Fluffy Assistant Desktop 🐰

**Fluffy Assistant Desktop** is a lightweight, privacy-focused system monitor and security guardian for Windows. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

The goal is to provide users with real-time insights into their system's health, detect suspicious behavior (malware-like patterns), and offer quick "normalization" tools to optimize their environment.

## 🚀 Features

-   **Real-time Monitoring**: Track CPU, RAM, Disk, and Network usage with low overhead.
-   **Security Guardian**: Detects suspicious processes based on path, resource spikes, child spawning, and persistence.
-   **System Control**: Adjust volume and brightness directly from the dashboard.
-   **Normalization**: One-click system optimization (reset volume/brightness, clean temp files).
-   **Process Management**: Kill processes and view detailed process trees.
-   **Privacy Focused**: All data is processed locally. No cloud dependecies for core functionality.

## 🏗️ Architecture

The application follows a Hexagonal Architecture split into three services:

1.  **Core (Rust)**: Handles low-level system interactions (monitoring, process management, volume/brightness).
2.  **Brain (Python)**: The intelligence layer. Analyzes telemetry for threats, manages state, and exposes a Web API.
3.  **Frontend (Tauri/TypeScript)**: The user interface. Displays data and sends user commands to the Brain.

For a deep dive into the architecture, please refer to [`agent.md`](./agent.md).

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

## 📝 Development Notes

-   **API Token**: The internal API uses a hardcoded token `X-Fluffy-Token: fluffy_dev_token` for authenticating requests between components.
-   **Logs**: You can view backend logs at `http://127.0.0.1:5123/logs` when the Brain is running.
-   **File Locking**: If you encounter file locking issues when rebuilding the Core, ensure `core.exe` is fully prohibited in Task Manager.

## 📄 License

