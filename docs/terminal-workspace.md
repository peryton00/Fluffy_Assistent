# Fluffy Desktop — Core Terminal Architecture & Specification

## 1. Overview

The **Core Terminal** is a full-duplex interactive REPL and command bridge connected directly to the Rust Core's WebSocket server at:

```text
ws://127.0.0.1:9003
```

Unlike simulated terminal views, this interface maintains a live bidirectional socket connection to the authoritative Rust Core REPL engine (`core/src/terminal/ws_bridge.rs`), supporting local command execution and distributed LAN agent orchestration.

---

## 2. WebSocket Protocol Contract

### A. Server-to-Client Messages

The backend emits JSON messages adhering to the following categories:

#### 1. Status (`type: "status"`)
Emitted on initial connection and whenever the terminal server state or cluster mode changes.
```json
{
  "type": "status",
  "admin_port": 9000,
  "client_count": 2,
  "mode": "Standalone"
}
```

#### 2. Prompt (`type: "prompt"`)
Emitted to indicate the current prompt state, reflecting whether commands are targeted locally or at an altered client node.
```json
{
  "type": "prompt",
  "text": "fluffy> "
}
```
Or for an altered node:
```json
{
  "type": "prompt",
  "text": "fluffy [f1]> "
}
```

#### 3. Output Line (`type: "output"`)
Streaming output lines from command execution or system log broadcasts.
```json
{
  "type": "output",
  "tag": "system",
  "text": "Fluffy Core REPL online.",
  "color_tag": "brand",
  "timestamp": "00:25:10"
}
```
Color tags:
- `brand` -> Indigo text (headers, primary brand notices)
- `success` -> Emerald text (successful operations, connection confirmations)
- `error` -> Rose text (command failures, syntax errors)
- `warning` / `warn` -> Amber text (warnings, deprecation alerts)
- `dim` -> Slate-500 text (secondary notes, debug hints)
- `text` / default -> Slate-200 text (standard command stdout)

#### 4. Client List (`type: "client_list"`)
Full inventory of connected distributed client agents.
```json
{
  "type": "client_list",
  "clients": [
    {
      "tag": "f1",
      "hostname": "WORKSTATION-01",
      "os": "Windows",
      "os_version": "11 Pro",
      "ip": "192.168.1.105",
      "arch": "x86_64",
      "connected_at": "2026-09-09 00:15:22"
    }
  ]
}
```

### B. Client-to-Server Messages

#### 1. Command Execution (`type: "command"`)
```json
{
  "type": "command",
  "text": "rolecall"
}
```

---

## 3. Frontend Architecture

### Component Hierarchy
```text
TerminalWorkspace (src/features/terminal/TerminalWorkspace.tsx)
├── TerminalHeader
│   ├── Connection Badge (CONNECTED / RECONNECTING / DISCONNECTED)
│   ├── Target Badge (Local Core vs Agent [f1])
│   ├── Subnav Tabs (Local Console / Agent Nodes)
│   └── Quick Actions (Clear, Reconnect)
└── View Container
    ├── LocalConsoleView
    │   ├── TerminalToolbar (Search filter, Mode badge, Reset to Local button)
    │   ├── TerminalViewport (Bounded buffer, autoscroll lock, jump to latest)
    │   └── TerminalInput (Dynamic prompt prefix, history Up/Down, Ctrl+L, Enter)
    └── AgentNodesView
        ├── Overview Banner (Mesh summary, node counters)
        └── AgentNodeList (Node grid, specs, Target Alter button, Inspector binding)
```

### State & Communication Flow
```text
┌────────────────────────────────────────────────────────┐
│ Rust Core WebSocket Bridge (ws://127.0.0.1:9003)       │
└──────────────────────────┬─────────────────────────────┘
                           │ (JSON full-duplex)
┌──────────────────────────▼─────────────────────────────┐
│ TerminalWebSocketService (src/services/websocket/)     │
│ - Single socket manager                                │
│ - Auto-reconnect loop (~3,000ms)                       │
│ - Zero WebSockets in React components                  │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ TerminalStore (src/stores/terminalStore.ts)            │
│ - Bounded output buffer (max 2,000 lines)              │
│ - Command history (max 100 entries)                    │
│ - Active prompt & target extraction                    │
│ - Connected client node inventory                      │
└──────────────────────────┬─────────────────────────────┘
                           │ (useSyncExternalStore)
┌──────────────────────────▼─────────────────────────────┐
│ React Workbench Views & Global Inspector               │
└────────────────────────────────────────────────────────┘
```

---

## 4. Keyboard Shortcuts & Interactivity
- **Enter**: Submit command to Core REPL.
- **Arrow Up**: Recall previous command in history buffer.
- **Arrow Down**: Move forward in command history buffer.
- **Ctrl+L**: Clear local viewport output lines.
- **Ctrl+C**: Clear current input buffer.

---

## 5. Security & Invariants
1. **Zero DOM injection**: All output is rendered as plain string text into styled span elements; `dangerouslySetInnerHTML` is strictly forbidden.
2. **Memory Safety**: Output lines buffer is capped at `MAX_OUTPUT_LINES = 2000` to prevent memory leaks during massive log output.
3. **Backend Immutability**: 0 modifications to `core/` or `brain/` backend code or communication protocols.
