# Fluffy React Workbench — UI Architecture Specification

> **Specification Status:** Approved Target Architecture  
> **Scope:** Frontend UI Layer Migration (Tauri 2 + Vite + React + TypeScript)  
> **Backend Invariant:** Zero backend modifications (Core, Brain, Guardian, Memory, APIs, IPC, WebSockets intact)  
> **Audit Reference:** [`UI_PRE_MIGRATION_AUDIT.md`](./UI_PRE_MIGRATION_AUDIT.md)  

---

## 1. Purpose

This document defines the new frontend architecture for Fluffy Desktop.

The scope is strictly the **UI layer**.

The following existing systems remain unchanged:
* Rust Core
* Python Brain
* Guardian backend
* Memory backend
* Agent engine
* Knowledge/RAG engine
* MCP subsystem
* Existing HTTP APIs (97 endpoints)
* Existing WebSocket protocols (`ws://127.0.0.1:9003`)
* TCP IPC (Ports 9001, 9002, 9000)
* Authentication mechanism (`X-Fluffy-Token`)
* Tauri host lifecycle
* Backend ports and data contracts
* Existing system capabilities

The new frontend consumes these existing interfaces through a structured UI integration layer.

The visual target is the approved Fluffy desktop design: a dark, dense, polished system-operations interface with persistent navigation, command/search access, operational telemetry, Guardian status, agents, activity, quick actions, and an integrated Fluffy interaction surface.

---

## 2. Target Architecture

The new frontend stack:

```text
Tauri 2
    │
    └── WebView
         │
         └── Vite
              │
              └── React
                   │
                   └── TypeScript
```

### Directory Structure

```text
src/
│
├── app/
│   ├── App.tsx
│   ├── router/
│   └── shell/
│       ├── Shell.tsx
│       ├── TopBar.tsx
│       ├── ActivityBar.tsx
│       ├── ContextualSidebar.tsx
│       ├── Inspector.tsx
│       └── StatusBar.tsx
│
├── features/
│   ├── operations/
│   ├── chat/
│   ├── agents/
│   ├── guardian/
│   ├── systems/
│   │   ├── processes/
│   │   ├── applications/
│   │   ├── startup/
│   │   ├── network/
│   │   └── hardware/
│   ├── memory/
│   ├── terminal/
│   ├── extensions/
│   ├── analytics/
│   └── settings/
│
├── components/
│   ├── layout/
│   ├── panels/
│   ├── tables/
│   ├── telemetry/
│   ├── status/
│   ├── guardian/
│   ├── agents/
│   ├── dialogs/
│   └── common/
│
├── services/
│   ├── api/
│   │   ├── client.ts
│   │   ├── status.ts
│   │   ├── processes.ts
│   │   ├── applications.ts
│   │   ├── guardian.ts
│   │   ├── chat.ts
│   │   ├── memory.ts
│   │   ├── network.ts
│   │   ├── extensions.ts
│   │   ├── ftp.ts
│   │   └── settings.ts
│   ├── websocket/
│   │   └── terminal.ts
│   ├── tauri/
│   │   ├── lifecycle.ts
│   │   └── native.ts
│   └── auth/
│       └── token.ts
│
├── stores/
│   ├── telemetryStore.ts
│   ├── uiStore.ts
│   ├── chatStore.ts
│   ├── terminalStore.ts
│   ├── guardianStore.ts
│   └── networkStore.ts
│
├── types/
│   ├── contracts.ts
│   └── ui.ts
│
├── themes/
│   ├── fluffyDark.ts
│   ├── fluffyLight.ts
│   └── highContrast.ts
│
├── styles/
│   ├── tokens.css
│   ├── base.css
│   └── typography.css
│
└── main.tsx
```

---

## 3. Architectural Principle

```text
React Components
       ↓
Feature State / Stores
       ↓
UI Service / Adapter Layer
       ↓
Existing Fluffy Interface (HTTP 5123 / WS 9003 / IPC)
       ↓
Backend Engine
```

**Strict Rule:** No direct `fetch()` calls inside React view components. All network access is routed through typed service abstractions in `services/`.

---

## 4. Application Shell Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ BRAND │ COMMAND / SEARCH (Ctrl+K)              │ SYSTEM STATUS │
├───────┼────────────────────────────────────────┼───────────────┤
│       │                                        │               │
│       │                                        │               │
│       │              WORKSPACE                 │   INSPECTOR   │
│       │                                        │               │
│ ACT.  │                                        │               │
│ BAR   │                                        │               │
│       │                                        │               │
│       │                                        │               │
├───────┴────────────────────────────────────────┴───────────────┤
│ CORE │ BRAIN │ GUARDIAN │ MEMORY │ NETWORK │ CPU │ RAM │ ... │
└─────────────────────────────────────────────────────────────────┘
```

The shell consists of:
1. **Top Bar:** Branding, global Command Palette (Ctrl+K), and high-level system indicators.
2. **Activity Bar:** Compact primary domain switcher.
3. **Contextual Sidebar:** Secondary view navigation dynamically matching the active domain.
4. **Main Workspace:** Tabbed/split workspace area with tables, charts, editors, and action surfaces.
5. **Inspector:** Right-side contextual inspector panel updating on item selection.
6. **Bottom Status Bar:** Persistent operational status line (Core, Brain, Guardian, Memory, CPU, RAM, Network).

---

## 5. Activity Bar Domains

```text
Home (Operations)
Chat
Agents
Guardian
Systems
Memory
Terminal
Extensions
Analytics
Settings
```

---

## 6. Contextual Sidebar Navigation

| Activity Bar Domain | Secondary Sidebar Views |
| :--- | :--- |
| **Operations** | Overview, Quick Actions, Active Telemetry, Live Logs |
| **Systems** | Processes, Applications, Startup, Network LAN, Hardware |
| **Guardian** | Overview, Threat Alerts, Pending Approvals, Trusted Processes, History |
| **Agents** | Active Runs, Tasks, Execution Steps, Tools & MCP |
| **Memory** | Overview, Sessions, Long-Term Profile, Preferences, Knowledge (RAG) |
| **Chat** | Sessions Sidebar, Active Conversation, Voice Controls |
| **Terminal** | Local Console, Agent Nodes List (`use <tag>`) |
| **Extensions** | Installed Hub, Code Editor, Web UIs |
| **Analytics** | Resource Timeline, Process Activity, Network Spikes |
| **Settings** | General, Appearance, AI/Models, Voice (TTS/STT), FTP Server, Advanced |

---

## 7. Workspace Architecture

The workspace supports rich operational primitives:
* **Panels:** Structured collapsible metric containers.
* **Tables:** Virtualized data grids with search, multi-column sorting, and hierarchy trees.
* **Timelines:** Step-by-step execution traces for agents and Guardian security chains.
* **Inspectors:** Deep property viewers for selected processes, alerts, or agents.
* **Terminals:** Bi-directional ANSI stream console with prompt interaction.
* **Editors:** Live code editor for extension handlers with hot-reload triggers.

---

## 8. Contextual Inspector Specifications

* **Process Selection:** PID, smoothed CPU %, RAM MB, parent PID, ETW network Rx/Tx KB/s, Guardian risk score, and quick actions (`[Terminate]`, `[Terminate Tree]`, `[Inspect Guardian]`).
* **Guardian Alert Selection:** Process name, risk score (0-100), behavioral anomaly reasons, confidence level, and action buttons (`[Block]`, `[Trust]`, `[Inspect Chain]`).
* **Agent Task Selection:** Agent identity, task description, active tool, Guardian approval status, step runtime, and controls (`[Stop]`, `[Inspect Output]`).

---

## 9. Operations Workspace

Replaces the legacy dashboard with a high-density operations center:
1. **Welcome & Quick Command Surface:** Prompt input for fast execution.
2. **System Overview:** Compact telemetry rings (CPU, RAM, Disks, Network, Battery, Bluetooth).
3. **Fluffy Subsystems Health:** Explicit status dots for Core, Brain, Guardian, Memory.
4. **Proactive Confirmation Banners:** Action cards for high-risk pending commands.
5. **Recent Events / Execution Logs:** Rolling real-time log stream.
6. **Quick Actions:** One-click Normalization, Speed Test, and Voice Mute toggle.

---

## 10. Telemetry & State Management

* **Central Telemetry Coordinator:** Single recurring polling loop (`GET /status` on 2,000ms adaptive cadence) feeding `telemetryStore`.
* **Zero Duplicate Polling:** Feature components subscribe to slices of `telemetryStore` instead of initiating independent `/status` requests.
* **Live ETW Metrics:** Preserves real-time per-PID network delta calculations (`net_received`, `net_sent`).

---

## 11. Guardian & Agent Interaction Matrix

```text
Agent Proposal ──► Action Spec ──► Guardian Evaluation ──► Verdict
                                                             ├── Allowed ────────► Execution
                                                             ├── Review Required ─► User Approval Modal
                                                             └── Blocked ────────► Security Audit Log
```

---

## 12. Systems Domain Architecture

1. **Processes Workspace:** Real hierarchical tree view (`buildTree`), flat table toggle, instant search filter, RAM/CPU sorting, single & tree termination.
2. **Applications Workspace:** Discovered apps grid, base64 embedded application icons, search, sort by size/active/name, launch action, and native uninstaller launcher.
3. **Startup Workspace:** Windows Registry (`HKCU`/`HKLM`) + Startup folder persistence entries, enable/disable toggle, add custom executable, remove entry.
4. **Network LAN Workspace:** Role switcher (`standalone`, `available`, `admin`), availability port server on port 9000 with connected admin count banner, multi-machine watch list, remote telemetry viewer, remote process kill.

---

## 13. Terminal Architecture

* **Protocol:** Pure WebSocket connection to `ws://127.0.0.1:9003`.
* **State Management:** `terminalStore` manages socket connection, reconnection backoff (3s), and incoming message streams (`status`, `prompt`, `output`, `client_list`).
* **UI Controls:** Ansi console, auto-scroll lock, agent selection tags (`use <tag>`), role sync (`to --admin`, `to --client`, `to --standalone`).

---

## 14. Extensions Architecture

* **CRUD Capabilities:** List extensions, view detail, view code, live edit code with hot-reload (`PUT /extensions/<intent>/code`), toggle enable/disable, delete.
* **Custom Web UIs:** Serves extension-provided web interfaces in an embedded iframe (`/extensions/<intent>/ui`).
* **Development Integration:** Spawns VS Code in extension folder via `POST /extensions/<intent>/open-vscode`.

---

## 15. Voice & Chat Architecture

* **Chat Engine:** Session list sidebar, session creation/deletion, message persistence, natural language command execution with LLM fallback.
* **Speech-to-Text (STT):** Offline Vosk STT with real-time transcription polling (500ms during recording) and auto-send.
* **Text-to-Speech (TTS):** Per-message voice playback, mute toggle, interrupt-on-type behavior.

---

## 16. Token-Driven Design & Theme System

* **Semantic Design Tokens:** All colors, surfaces, borders, and typography defined via CSS variables in `styles/tokens.css`.
* **Supported Themes:** `Fluffy Dark` (default), `Fluffy Light`, `Fluffy High Contrast`.
* **Visual Identity:** Restrained, dense, operational dark surfaces; zero neon AI slop, zero distracting glassmorphism blur. Strategic usage of the Fluffy mascot for identity, welcome, and empty states.

---

## 17. UI Migration Phase Plan

```text
Phase 1: Foundation
  - Scaffold React + Vite + TypeScript inside ui/tauri/
  - Setup styles/tokens.css, design system primitives, and theme tokens
  - Implement services/api/client.ts with X-Fluffy-Token loopback auth
  - Setup central telemetryStore and uiStore

Phase 2: Application Shell
  - Implement Shell layout (TopBar, ActivityBar, ContextualSidebar, Inspector, StatusBar)
  - Implement Command Palette (Ctrl+K modal)

Phase 3: Operations Workspace
  - Implement Operations dashboard (telemetry rings, quick commands, execution logs)
  - Wire /status, /normalize, /net-speed, /logs

Phase 4: Systems Domain
  - Implement Processes (Hierarchical tree + Flat table + ETW network metrics + Kill)
  - Implement Applications (Grid + base64 icons + Launch + Uninstall)
  - Implement Startup Apps (Registry scan + Toggle + Add + Remove)
  - Implement Network LAN (Role switcher + Availability server + Admin multi-node monitor)

Phase 5: Guardian & Memory Domain
  - Implement Guardian workspace (Threat alerts + Whitelisting + Baseline reset)
  - Implement Memory workspace (Session memory + Profile + Knowledge RAG placeholder)

Phase 6: Terminal Workspace
  - Implement Terminal view with ws://127.0.0.1:9003 integration
  - Implement agent client tags list and remote command execution

Phase 7: Chat & Voice Workspace
  - Implement Chat interface with session history sidebar
  - Implement STT Vosk recording and TTS playback / mute controls

Phase 8: Extensions Hub & Settings
  - Implement Extensions manager (Gallery + Code editor + Hot reload + Web UI iframe)
  - Implement Settings & FTP Server manager (Start/Stop + Folder picker + QR + Bandwidth)

Phase 9: Verification & Legacy Cleanup
  - Verify full feature parity across all 97 HTTP APIs and WS/IPC interfaces
  - Remove legacy monolithic main.ts / index.html files
```

---

## 18. Feature Parity & Definition of Done Checklist

- [ ] React + Vite builds cleanly with zero TypeScript errors
- [ ] Tauri 2 desktop app launches and manages Python/Core lifecycle
- [ ] Loopback token discovery (`/config/token`) and `X-Fluffy-Token` header verification
- [ ] Central single-coordinator telemetry polling (2s active / 10s idle)
- [ ] Process tree hierarchy with smoothed CPU, RAM, and live ETW network Rx/Tx
- [ ] Application icons rendered from base64 data URIs
- [ ] Startup apps registry enable/disable toggle and add/remove actions
- [ ] Guardian alert banners and process whitelisting
- [ ] FTP server controls, folder selection dialog, QR code, and live transfer speeds
- [ ] LAN network multi-machine monitoring and remote process kill
- [ ] Full-duplex WebSocket terminal stream on `ws://127.0.0.1:9003`
- [ ] Chat conversation history, STT voice input, and TTS playback
- [ ] Extensions gallery, live code editor, hot-reload, and VS Code launching
- [ ] Extension points established for Knowledge (RAG), MCP, and LLM configuration
- [ ] Zero backend code modifications
