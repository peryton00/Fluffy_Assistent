# Fluffy Integrated Assistant System — Agent Briefing & Architecture

## 🚀 Project Overview
**Fluffy Integrated Assistant System** is a lightweight, privacy-focused system monitor, security guardian, and intelligent assistant. It is **cross-platform** — supporting both **Windows** and **Linux (Kali Linux)**. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

### Key Capabilities
- Real-time system monitoring (CPU, RAM, Disk, Network, Process trees)
- Behavioral security guardian (signature-less threat detection)
- Voice commands (offline STT/TTS) + LLM chat (multi-provider)
- Self-improving extension system (AI-generated plugins)
- Admin-client remote monitoring over networks
- FTP file sharing with QR code pairing
- Cross-platform: Windows + Linux (Kali)

---

## 🏗️ Architecture Stack

Three-tier hexagonal architecture with IPC + HTTP communication:

```
┌────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                           │
│                  (Tauri + TypeScript)                       │
│                   Native Desktop Window                    │
└───────────────────────┬────────────────────────────────────┘
                        │ HTTP REST (Port 5123)
                        ▼
┌────────────────────────────────────────────────────────────┐
│                  INTELLIGENCE LAYER                         │
│                    (Python Brain)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Security Monitor · Guardian Engine · LLM Service     │  │
│  │ Command Parser  · Voice System  · Chat History       │  │
│  │ Extension Loader · Memory System · Platform Utils    │  │
│  │ Admin-Client Network · FTP Service · App Manager     │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬────────────────────────────────────┘
                        │ IPC (TCP Ports 9001/9002)
                        ▼
┌────────────────────────────────────────────────────────────┐
│                   MONITORING ENGINE                         │
│                     (Rust Core)                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ System Telemetry · Process Management · ETW Network  │  │
│  │ Volume/Brightness · Registry Monitor · Startup Mgmt  │  │
│  │ Battery & Bluetooth · Command Execution              │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 1. Core Service (Rust) — `/core`
- **Port 9001**: Telemetry broadcast (JSON over TCP, every 2s)
- **Port 9002**: Command receiver (Kill, Normalize, Startup mgmt)
- Uses `sysinfo` for metrics, `windows-sys`/`winreg` (Windows-only, conditionally compiled)
- **Cross-platform**: `#[cfg(target_os)]` branches for all OS-specific code
- Linux uses `kill -9` instead of `taskkill`, startup commands return "not supported"

### 2. The Brain (Python) — `/brain`
- **Port 5123**: Flask Web API serving the frontend
- Security Monitor with 5-pillar behavioral analysis
- Platform abstraction via `brain/platform_utils.py` (centralizes all OS-specific calls)
- Extension system with dynamic code generation
- LLM integration (OpenAI, Anthropic, Groq, Ollama)
- Voice system (Vosk STT, Piper TTS)
- App management with cached registry scan (Windows) / `.desktop` file scan (Linux)

### 3. Frontend (Tauri/TypeScript) — `/ui/tauri`
- Premium glassmorphism dashboard with dark/light mode
- Real-time charts, process tree, security alerts
- App management panel with running-status indicators (green dot)
- Admin-client remote monitoring interface

---

## 🛡️ Key Features

### Behavioral Security Guardian
5-pillar detection without signatures:
1. **Path Integrity** — Detects execution from `/tmp`, `%TEMP%` (platform-aware patterns)
2. **Resource Anomalies** — CPU/RAM spikes > 3x baseline
3. **Child Spawning** — Rapid sub-process creation chains
4. **Persistence** — Registry startup monitoring (Windows)
5. **Background Activity** — Disk I/O while UI idle

### System Normalization (Enhanced)
- Volume 50%, Brightness 70%
- **Cache cleaning**: Browser caches, system temp, package caches
- **RAM optimization**: Identifies and suggests unused services
- **Security scan**: Lists unusual processes

### Application Management
- **Windows**: Registry scan → `exe_path` resolution → PowerShell icon extraction
- **Linux**: `.desktop` file scan → freedesktop icon lookup
- **Running indicators**: Green dot for currently-running apps
- **Cache**: `fluffy_data/apps.json` with 24hr auto-refresh

### Admin-Client Networking
- Remote monitoring of connected clients
- Process list viewing across devices
- Client notification system for admin connections

### FTP File Sharing
- Built-in FTP server with secure password generation
- QR code for mobile pairing
- Client disconnect management

### Self-Improvement Engine
1. Detects unhandled user request
2. AI designs new Python extension
3. `CodeGenerator` writes compliant plugin with syntax validation loop
4. `ExtensionLoader` hot-loads into Brain (e.g., Bluetooth control)

### Multi-Step Command Execution
- LLM parser detects chained commands
- Sequential execution with delays
- Example: "open notepad and write hello world"

---

## 🔀 Cross-Platform Design

### Platform Abstraction Layer (`brain/platform_utils.py`)
All OS-specific operations centralized:
| Function | Windows | Linux |
|----------|---------|-------|
| `kill_process_by_name()` | `taskkill /IM` | `pkill -f` |
| `open_file()` | `os.startfile()` | `xdg-open` |
| `open_folder()` | `explorer` | `xdg-open` |
| `get_system_commands()` | `shutdown /s`, `rundll32` | `systemctl`, `loginctl` |
| `find_app_executable()` | Registry paths | `which` + `.desktop` |
| `get_suspicious_path_patterns()` | `\temp\` | `/tmp/`, `/dev/shm/` |

### Rust Core Conditional Compilation
- `Cargo.toml`: Windows-only deps under `[target.'cfg(windows)'.dependencies]`
- `receiver.rs`: Platform-aware `PROTECTED_PROCESSES`, Linux `kill -9` branch
- `main.rs`: `#[cfg]` stubs for battery, Bluetooth, startup on non-Windows
- `etw.rs`: `ferrisetw` import gated behind `#[cfg(windows)]`

### Bluetooth Extension
- **Windows**: PowerShell + WinRT Radio API
- **Linux**: `rfkill unblock bluetooth` + `bluetoothctl power on/off`

---

## 📊 Current Status (Feb 21, 2026)
- **Rust Core**: ✅ Compiles on Windows + Linux (cross-platform)
- **Python Brain**: ✅ All OS-specific code abstracted via `platform_utils.py`
- **Tauri UI**: ✅ Polished dashboard with dark/light mode, app indicators
- **Extensions**: ✅ Bluetooth (Windows + Linux), WiFi scan (cross-platform)
- **Networking**: ✅ Admin-client monitoring, FTP service
- **Setup**: ✅ One-click setup scripts for Windows (`.bat`/`.ps1`) and Linux (`.sh`)

---

## 🔧 Setup & Development

### One-Click Setup
- **Windows**: `setup_env.bat` or `setup_env.ps1`
- **Linux**: `chmod +x setup_env.sh && ./setup_env.sh`

Scripts handle: Python venv + pip, Node.js npm install, Rust cargo check, `.env` config.

### Manual Start
1. **Core**: `cd core && cargo run`
2. **Brain**: `cd brain && python listener.py`
3. **UI**: `cd ui/tauri && npm run tauri dev`

---

## 📝 Notes for Future AI Agents

### Quick Reference
- **API Token**: `X-Fluffy-Token: fluffy_dev_token` (all inter-service HTTP)
- **Logs**: `http://127.0.0.1:5123/logs`
- **Requirements**: `brain/requirements.txt` (not root)
- **Platform Utils**: Always use `brain/platform_utils.py` for OS-specific operations — never add bare `taskkill`, `explorer`, or `os.startfile()` calls
- **Rust Cross-Platform**: Use `#[cfg(target_os = "windows")]` / `#[cfg(not(target_os = "windows"))]` for any new Windows API usage
- **Extension Pattern**: See `brain/extensions/bluetooth_control/handler.py` for the canonical cross-platform extension pattern

### Common Gotchas
- `Cargo.toml`: Windows-only crates MUST be under `[target.'cfg(windows)'.dependencies]`
- `winreg` import in `app_utils.py` is conditional — guarded by `IS_WINDOWS`
- Linux startup management (add/remove/toggle) is not supported — returns error stubs
- Core `.exe` file lock: Kill `core.exe` in Task Manager before rebuilding
- `.env` file needed for LLM features — copy `.env.example` if missing

### File Structure
```
/
├── core/                  # Rust Core (telemetry, IPC, commands)
│   └── src/
│       ├── main.rs        # Entry point, system stats, spawn helpers
│       ├── ipc/receiver.rs # Command handling (KillProcess, Startup, etc.)
│       └── etw.rs         # Network monitoring (Windows ETW)
├── brain/                 # Python Intelligence Layer
│   ├── listener.py        # IPC client, main entry
│   ├── web_api.py         # Flask API (port 5123)
│   ├── platform_utils.py  # Cross-platform abstraction layer
│   ├── app_utils.py       # App discovery (registry / .desktop)
│   ├── command_executor.py # Voice/chat command execution
│   ├── security_monitor.py # Behavioral threat scoring
│   ├── extensions/        # Dynamic plugins (bluetooth, wifi, etc.)
│   └── fluffy_data/       # Cache, memory, baselines
├── ai/                    # LLM service, intent classification
├── voice/                 # Vosk STT + Piper TTS
├── ui/tauri/              # Tauri frontend (TypeScript + Vite)
├── fluffy/network/        # Admin-client & FTP services
├── services/              # Background services
├── setup_env.bat          # Windows setup
├── setup_env.ps1          # Windows setup (PowerShell)
├── setup_env.sh           # Linux setup
└── documentation/         # All project docs
```
