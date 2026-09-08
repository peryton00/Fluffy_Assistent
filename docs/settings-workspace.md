# Fluffy Desktop — Settings Domain Documentation

## 1. Overview & Purpose
The Settings domain centralizes configuration for the entire Fluffy workbench, including operational automation, theme and accessibility presentation, AI/LLM model routing, offline voice recognition, local FTP file sharing, and system maintenance diagnostics.

Every control in Settings is backed by authoritative backend contracts or genuine global stores.

---

## 2. Views & Navigation Structure

1. **General (`general`)**
   - **Autonomous Resource Normalization**: Toggle automatic memory compaction and rogue handle termination upon pressure detection.
   - **Guardian Sensitivity Threshold**: Configurable slider adjusting anomaly detection tolerance (0.10 to 0.90).
   - Persisted to Python Brain long-term preferences (`POST /memory/preferences`).

2. **Appearance (`appearance`)**
   - **Theme Selector**: Full integration with `uiStore.setThemeMode()` supporting:
     - `fluffyDark` (Industrial Dark Palette)
     - `fluffyLight` (Clean Studio Light Palette)
     - `highContrast` (High Contrast Accessibility)
   - **Reduced Motion Mode**: Disables continuous CSS animations and telemetry transitions.

3. **AI / Models (`models`)**
   - **OpenRouter Key Configuration**: Secure password input with show/hide toggle for `Bearer` authentication.
   - **Model Selector**: Populated from real model listings retrieved from `GET /llm/models` (cost, context length, recommendations).
   - **Runtime Status Badge**: Clearly distinguishes between active OpenRouter cloud routing vs local Brain rule/intent engine fallback.
   - Backed by `GET /llm/config` and `POST /llm/config`.

4. **Voice (`voice`)**
   - Status indicators for local offline Vosk STT engine and pyttsx3 offline TTS engine.
   - Speech rate multiplier slider (0.5x to 2.0x).
   - TTS Mute / Unmute toggle directly synchronizing with `chatStore`.

5. **FTP Server (`ftp`)**
   - Controls for local FTP server on Port 2121.
   - Start / Stop controls with active IP, port, and username display.
   - Shared directory configuration path.
   - Mobile Quick Connect QR Code preview.
   - Active client connection list with on-demand disconnect action.
   - Server activity logs viewer with clear log capabilities.
   - Backed by `brain/routes/ftp_routes.py`.

6. **Advanced (`advanced`)**
   - **Run Normalizer**: Immediate execution of system compaction and RAM optimization (`POST /normalize`).
   - **Clear Threat Cache**: Purges temporary Guardian security alerts and anomaly history (`POST /clear_guardian`).
   - **Reset Session**: Clears active conversational memory context (`POST /session/reset`).
   - **Runtime Architecture & Port Diagnostics**: Displays status of local loopback ports (HTTP 5123, TCP 9001, TCP 9002, WS 9003).

---

## 3. Architecture & Data Flow

```text
Settings Views (General / Appearance / Models / Voice / Ftp / Advanced)
           ↓
    settingsStore (Singleton State Coordinator)
           ↓
  API Services (settings.ts / ftp.ts / chat.ts / uiStore.ts)
           ↓
 Python Brain & Rust Core (HTTP 5123 / TCP / Memory Store)
```

---

## 4. Backend Contracts Reference

| Domain Section | Endpoint | Method | Contract Purpose |
|---|---|---|---|
| General | `/memory/preferences` | `GET` / `POST` | User preferences store |
| Models | `/llm/config` | `GET` / `POST` | OpenRouter configuration |
| Models | `/llm/models` | `GET` | OpenRouter model directory |
| FTP | `/ftp/status` | `GET` | Server running state & active clients |
| FTP | `/ftp/start` | `POST` | Start FTP server with shared directory |
| FTP | `/ftp/stop` | `POST` | Stop FTP server |
| FTP | `/ftp/logs` | `GET` | Activity event logs |
| FTP | `/ftp/clear_logs` | `POST` | Purge event logs |
| FTP | `/ftp/disconnect` | `POST` | Disconnect specific client IP |
| Advanced | `/normalize` | `POST` | Execute host resource compaction |
| Advanced | `/clear_guardian` | `POST` | Clear security threat alerts |
| Advanced | `/session/reset` | `POST` | Purge active conversation context |
