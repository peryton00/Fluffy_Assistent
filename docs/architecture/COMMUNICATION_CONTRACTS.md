# Fluffy Assistant: Communication Contracts Document

This document records the exact communication protocols, network ports, framing methods, serialization formats, authentication mechanics, message schemas, and lifecycle behaviors implemented across Fluffy Assistant.

---

## 1. Summary Matrix of Communication Channels

| Channel | Source | Destination | Protocol / Transport | Port | Auth Header / Credential | Framing Format | Lifecycle / Trigger |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **Telemetry IPC** | Rust Core | Python Brain | Raw TCP Socket | `9001` (TCP) | Loopback only (`127.0.0.1`) | Single JSON object per message | Broadcasted every 2.0s |
| **Command IPC** | Python Brain | Rust Core | Raw TCP Socket | `9002` (TCP) | Loopback only (`127.0.0.1`) | Newline-terminated JSON (`\n`) | On-demand per user command |
| **Terminal WS** | Desktop UI / Client | Rust Core | WebSocket (WS) | `9003` (WS) | Loopback only (`127.0.0.1`) | WebSocket text frames (JSON) | Persistent interactive session |
| **Agent TCP** | LAN Agent (`fluffy-client`) | Rust Core | Raw TCP Socket | `9000` (TCP) | LAN / loopback | Line-based command stream | Persistent per connected agent |
| **Web REST API** | Desktop UI | Python Brain | HTTP 1.1 REST | `5123` (HTTP) | `X-Fluffy-Token: <token>` | Standard HTTP JSON responses | Polling (1-2s) & UI user actions |
| **Chat Stream** | Desktop UI | Python Brain | HTTP SSE Stream | `5123` (HTTP) | `X-Fluffy-Token: <token>` | `text/event-stream` chunks | Per user chat submission |
| **FTP Service** | Mobile / LAN Client | Python FTP Service | FTP Protocol | `2121` (FTP) | Random 8-char token + QR | Standard RFC 959 FTP commands | User toggled from UI |
| **P2P Node** | Remote Admin | Python Network Server | HTTP REST | `9000` (HTTP) | Token / status queries | Standard HTTP JSON | Remote dashboard monitoring |

---

## 2. Telemetry IPC Contract (Rust Core ➔ Python Brain)

* **Transport**: TCP `127.0.0.1:9001`
* **Direction**: Rust Core binds server; Python Brain connects as client.
* **Interval**: Every 2 seconds (when UI is active) or lightweight checks.
* **Framing**: UTF-8 encoded JSON object.
* **Payload Schema (`FluffyMessage`)**:

```json
{
  "schema_version": "1.0",
  "timestamp": 1725728400,
  "system": {
    "ram": {
      "total_mb": 16384,
      "used_mb": 8192,
      "free_mb": 8192
    },
    "cpu": {
      "usage_percent": 18.5
    },
    "network": {
      "received_kb": 10240,
      "transmitted_kb": 2048,
      "total_rx_kbps": 128.5,
      "total_tx_kbps": 45.2,
      "status": "wifi"
    },
    "processes": {
      "top_ram": [
        {
          "pid": 1234,
          "parent_pid": 1000,
          "name": "chrome.exe",
          "exe_path": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "ram_mb": 450,
          "cpu_percent": 3.2,
          "disk_read_kb": 120,
          "disk_written_kb": 45,
          "net_received": 50.0,
          "net_sent": 10.0
        }
      ]
    },
    "battery": {
      "percent": 88.0,
      "plugged": true
    },
    "bluetooth": {
      "enabled": true
    }
  },
  "persistence": [
    {
      "name": "OneDrive",
      "command": "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background",
      "enabled": true
    }
  ],
  "active_sessions": 1
}
```

* **Shutdown Notification**:
```json
{
  "type": "shutdown",
  "timestamp": 1725728450
}
```

---

## 3. Command IPC Contract (Python Brain ➔ Rust Core)

* **Transport**: TCP `127.0.0.1:9002`
* **Direction**: Rust Core binds server; Python Brain connects, sends command, and closes socket.
* **Framing**: UTF-8 JSON line terminated with `\n`.
* **Command Schemas (`core::ipc::command::Command`)**:

1. **Kill Process**:
   ```json
   { "KillProcess": { "pid": 4321 } }
   ```
2. **Normalize System Sweep**:
   ```json
   { "NormalizeSystem": null }
   ```
3. **Open Path**:
   ```json
   { "OpenPath": { "path": "C:\\Users\\User\\Documents" } }
   ```
4. **Startup Application Add**:
   ```json
   { "StartupAdd": { "name": "MyApp", "path": "C:\\Path\\to\\app.exe" } }
   ```
5. **Startup Application Remove**:
   ```json
   { "StartupRemove": { "name": "MyApp" } }
   ```
6. **Startup Application Toggle**:
   ```json
   { "StartupToggle": { "name": "MyApp", "enabled": false } }
   ```
7. **Set UI Active State**:
   ```json
   { "SetUiActive": { "active": true } }
   ```
8. **Confirmation / Cancellation**:
   ```json
   { "Confirm": { "command_id": "uuid-here" } }
   { "Cancel": { "command_id": "uuid-here" } }
   ```

* **Permission Gate (`permissions::policy.rs`)**:
  - `pid < 100`: Evaluated as `PermissionDecision::Deny`.
  - `KillProcess`, `RequestCleanup`, `Startup*`: Evaluated as `PermissionDecision::RequireConfirmation`.
  - `NormalizeSystem`, `OpenPath`, `SetUiActive`: Evaluated as `PermissionDecision::Allow`.

---

## 4. Web API Contract (Desktop UI ➔ Python Brain)

* **Base URL**: `http://127.0.0.1:5123`
* **Authentication**: Header `X-Fluffy-Token: <token>`.
* **CORS**: Allows origin `*`, methods `GET, POST, PUT, DELETE, OPTIONS`, headers `Content-Type, X-Fluffy-Token`.

### Key Endpoints

| Endpoint | Method | Auth Required | Description | Response Schema |
|:---|:---|:---|:---|:---|
| `/config/token` | `GET` | No (Loopback) | Returns secure token for UI initialization | `{"token": "..."}` |
| `/status` | `GET` | Yes | Current telemetry, alerts, notifications, confirmations | Full state JSON |
| `/logs` | `GET` | Yes | Log history | Array of log objects |
| `/ui_connected` | `POST` | Yes | Signals window is open/focused | `{"status": "ok"}` |
| `/ui_disconnected` | `POST` | Yes | Signals window is hidden/minimized | `{"status": "ok"}` |
| `/chat/message` | `POST` | Yes | Dispatches text command/chat to agent parser | `{"reply": "...", "success": true, ...}` |
| `/chat/stream` | `POST` | Yes | Streams LLM response using Server-Sent Events | `text/event-stream` SSE tokens |
| `/tts/speak` | `POST` | Yes | Triggers TTS audio synthesis | `{"status": "speaking"}` |
| `/ftp/start` | `POST` | Yes | Starts FTP sharing server | `{"status": "running", "port": 2121, "credentials": {...}}` |
| `/ftp/stop` | `POST` | Yes | Stops FTP server | `{"status": "stopped"}` |
| `/ftp/status` | `GET` | Yes | Returns FTP transfer speeds, connected clients, logs | `{"running": bool, "clients": [...], ...}` |
| `/extensions` | `GET` | Yes | Lists installed dynamic extensions | Array of extension metadata |
| `/extensions` | `POST` | Yes | Creates/installs an extension | `{"success": true, "extension": {...}}` |
| `/terminal/clients`| `GET` | Yes | Lists connected reverse TCP clients | `{"clients": [...]}` |

---

## 5. Reverse TCP Terminal WebSocket Contract (Desktop UI ➔ Rust Core)

* **Transport**: WebSocket `ws://127.0.0.1:9003`
* **Message Protocol**:
  - Frontend transmits JSON strings: `{ "type": "command", "data": "sysinfo" }`
  - Backend streams stdout: `{ "type": "output", "data": "..." }`
  - Client state broadcast: `{ "type": "state", "clients": [...], "current_target": null }`

---

## 6. Safety & Security Contracts

1. **Token Lifetime**: `FLUFFY_TOKEN` is auto-generated as a 64-character hexadecimal string on first boot and written to `.env`.
2. **Loopback Confinement**: Web API, Core IPC, and Terminal WS bind strictly to `127.0.0.1` unless explicitly running the public LAN P2P role.
3. **AST Validation**: Dynamic Python extensions generated by the self-improver must pass AST syntax parsing (`code_validator.py`) and safety checking before writing to disk.
