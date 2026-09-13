# Fluffy Assistant: Development & Contribution Guide

This document provides developer guidelines, build instructions, IPC debugging procedures, and testing strategies for the **Fluffy Assistant** platform.

---

## 1. System Topology & Network Ports

Fluffy Assistant operates across multiple native and interpreted runtime components communicating via dedicated local ports:

| Port | Protocol | Binding Component | Consumer / Purpose |
|:---|:---|:---|:---|
| **9001** | TCP (Raw JSON) | Rust Core (`ipc/server.rs`) | Python Brain (`runtime/listener.py`): Real-time telemetry broadcast |
| **9002** | TCP (Raw JSON) | Rust Core (`ipc/receiver.rs`) | Python Brain (`runtime/commands.py`): Command dispatch & policy checks |
| **9003** | WebSocket | Rust Core (`terminal/ws_bridge.rs`) | Tauri UI (`features/terminal`): Terminal REPL streaming & stdout |
| **9000** | TCP | Rust Core (`terminal/net.rs`) | Remote agents (`fluffy-client`): LAN reverse shell administration |
| **5123** | HTTP / SSE | Python Brain (`web_api.py`) | Tauri UI: REST endpoints, status polling, chat streaming |
| **2121** | FTP | Services (`ftp_service.py`) | Local LAN clients: Shared folder transfers & QR pairing |

---

## 2. Prerequisites & Environment Setup

### Required Toolchains
- **Rust**: `rustc` and `cargo` 1.75+ (`rustup-init.exe` on Windows or `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` on Linux).
- **Python**: Python 3.10 or 3.11 with `pip` and virtual environment support.
- **Node.js**: Node.js 18 LTS or 20 LTS with `npm`.
- **C++ Build Tools**: Required on Windows for compiling native dependencies like `vosk` and `pyaudio`.

### One-Click Environment Setup
From the repository root, execute:

- **Windows PowerShell**: `powershell -File setup_env.ps1`
- **Windows Command Prompt**: `setup_env.bat`
- **Linux**: `chmod +x setup_env.sh && ./setup_env.sh`

### Environment Variables (`.env`)
Ensure `.env` exists in the repository root:

```env
FLUFFY_TOKEN=generate_or_set_token_here
PYTHON_PATH=.venv/Scripts/python.exe
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

---

## 3. Running Services for Development

### Mode A: Full Integrated Launch
Running the Rust Core automatically spawns the Python Brain daemon and launches the Tauri Desktop Workbench:

```bash
cd core
cargo run
```

### Mode B: Decoupled Development
To isolate logs and debug individual components:

**Terminal 1 — Rust Core:**
```bash
cd core
cargo run
```

**Terminal 2 — Python Brain:**
```bash
.venv\Scripts\activate
cd brain
python listener.py
```

**Terminal 3 — Tauri UI Dev Server:**
```bash
cd ui/tauri
npm run tauri dev
```

---

## 4. IPC Debugging & Testing Procedures

### Testing Telemetry Broadcast (Port 9001)
Use PowerShell or Netcat to verify that the Rust Core is broadcasting JSON telemetry:

```powershell
# PowerShell test
$client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 9001)
$stream = $client.GetStream()
$reader = New-Object System.IO.StreamReader($stream)
$reader.ReadLine()
$client.Close()
```

### Testing Command Receiver (Port 9002)
Send a test command to the Core receiver:

```powershell
$client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 9002)
$writer = New-Object System.IO.StreamWriter($client.GetStream())
$writer.AutoFlush = $true
$writer.WriteLine('{"action": "ping"}')
$client.Close()
```

### Testing Python Web API (Port 5123)
Query the Brain health endpoint:

```bash
curl http://127.0.0.1:5123/status -H "X-Fluffy-Token: your_token"
```

---

## 5. Development Guidelines & Constraints

1. **No Emojis**: Do not add emojis anywhere in the project (UI components, text messages, notifications, error envelopes, logs, code, or documentation). Use vector SVG icons or clean semantic labels/badges instead.
2. **Minimal Code / YAGNI**: Write minimal, robust code. Do not introduce abstractions or dependencies that were not explicitly requested.
3. **Cross-Platform Safety**: Always use `platform_utils.py` in Python or `#[cfg(target_os)]` in Rust for OS-specific operations.
4. **Validation**: All destructive actions (e.g. terminating processes, editing startup registry, deleting files) must pass through policy validation (`policy.rs` in Core, `action_validator.py` in Brain).
