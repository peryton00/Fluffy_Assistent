# Fluffy Desktop — UI Phase 1: Foundation Documentation

## Overview

This document describes the frontend foundation established in **UI Phase 1** of the Fluffy Desktop workbench migration.

Phase 1 provides the strict TypeScript, React, and Vite foundation inside `ui/tauri/` while preserving 100% backend compatibility and zero external network dependencies.

Reference: [`UI_WORKBENCH_SPECIFICATION.md`](../UI_WORKBENCH_SPECIFICATION.md)

---

## 1. Frontend Architecture & Dependency Direction

The frontend strictly enforces a unidirectional dependency hierarchy:

```text
React Components
       ↓
Stores (telemetryStore, uiStore)
       ↓
Typed Services (apiClient, statusService, authService, tauriService)
       ↓
Authoritative Backend Interfaces (HTTP 5123, WS 9003, TCP IPC)
```

### Invariant:
- React components **never** directly invoke `fetch()`, `WebSocket()`, or Tauri `invoke()`.
- All interactions route through typed service abstractions.

---

## 2. Directory Layout

```text
ui/tauri/
└── src/
    ├── app/
    │   └── App.tsx                 # Root component with coordinator lifecycle & theme binding
    │
    ├── features/
    │   └── foundation/
    │       └── FoundationScreen.tsx # Operational foundation preview & telemetry diagnostic UI
    │
    ├── services/
    │   ├── api/
    │   │   ├── client.ts           # Typed API client, error taxonomy, token header injection
    │   │   └── status.ts           # Typed GET /status service
    │   ├── auth/
    │   │   └── token.ts            # Loopback token discovery (GET /config/token) & caching
    │   ├── tauri/
    │   │   ├── lifecycle.ts        # Graceful shutdown & host lifecycle wrappers
    │   │   └── native.ts           # Native URL opener
    │   └── websocket/
    │       └── index.ts            # Placeholder for Phase 6 Terminal stream
    │
    ├── stores/
    │   ├── telemetryStore.ts       # Central polling coordinator with adaptive 2s/10s cadences
    │   └── uiStore.ts              # UI-only state (domain, sidebar, inspector, theme)
    │
    ├── types/
    │   ├── contracts.ts            # Backend domain & API contracts
    │   └── ui.ts                   # UI-only state models
    │
    ├── themes/
    │   ├── fluffyDark.ts           # Operational dark theme (default)
    │   ├── fluffyLight.ts          # Operational light theme
    │   ├── highContrast.ts         # High-contrast accessibility theme
    │   └── index.ts                # Theme registry & DOM binding helper
    │
    ├── styles/
    │   ├── tokens.css              # Semantic CSS variables for colors, surfaces, spacing
    │   ├── typography.css          # 100% offline system font stacks & scales
    │   └── base.css                # CSS reset, accessibility focus rings, scrollbars
    │
    └── main.tsx                    # React DOM root mounting
```

---

## 3. Authentication Flow (`X-Fluffy-Token`)

Authentication uses the existing Python Brain loopback discovery mechanism:

1. `apiClient` requests a token from `src/services/auth/token.ts`.
2. If no token is cached, `token.ts` fetches `GET http://127.0.0.1:5123/config/token` (allowed for loopback requests).
3. The token is stored in memory and injected into all subsequent HTTP requests via the `X-Fluffy-Token` header.
4. Concurrent token requests are deduplicated using an in-flight promise.
5. If an API request receives HTTP 401 or 403:
   - `apiClient` clears the cached token.
   - `refreshToken()` discovers a new token from loopback.
   - The request is automatically retried once.

---

## 4. Central Telemetry Polling Coordinator (`telemetryStore`)

To eliminate duplicate `/status` polling loops across UI components:

- Exactly **one** centralized `TelemetryCoordinator` runs in `src/stores/telemetryStore.ts`.
- Components subscribe to `useTelemetryStore()` using React's `useSyncExternalStore`.

### Polling Cadences:
- **ACTIVE mode**: Polls approximately every **2,000 ms** (2 seconds).
- **IDLE mode**: Polls approximately every **10,000 ms** (10 seconds).

### Protection & Resiliency:
- **Zero overlapping requests**: Uses boolean lock and AbortController timeout.
- **Deduplicated timers**: Calling `start()` repeatedly does not spawn duplicate loops.
- **Manual refresh**: `refreshNow()` immediately triggers a poll and resets the cadence timer.
- **Error Recovery**: Automatically handles backend downtime and reconnects upon backend availability.
- **Stale Data Flagging**: Marks connection as `STALE` if successful updates cease for > 15 seconds.

---

## 5. UI State Separation (`uiStore`)

UI state is strictly separated from backend domain state:
- `activeDomain`: Active activity bar domain (`"operations"`, `"systems"`, `"guardian"`, etc.)
- `sidebarCollapsed`: Toggle state for secondary sidebar
- `inspectorOpen`: Contextual right drawer open/close
- `commandPaletteOpen`: Global Ctrl+K palette modal state
- `theme`: Active color theme (`"fluffyDark"`, `"fluffyLight"`, `"highContrast"`)

---

## 6. Design Token System & Offline-First Compliance

- All colors, borders, and surfaces use semantic CSS variables in `src/styles/tokens.css`.
- Typography in `src/styles/typography.css` relies strictly on system font stacks (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` and `"Cascadia Code", "Fira Code", Consolas, monospace`).
- **Zero external network dependencies**: No Google Fonts runtime import, no external CDN icons, no cloud analytics. 100% operational in air-gapped deployments.

---

## 7. Error State Taxonomy

The typed `ApiClientError` categorizes failures into distinct operational states:

| Code | Trigger | UI Diagnostic State |
| :--- | :--- | :--- |
| `AUTHENTICATION_FAILED` | HTTP 401/403 or loopback token discovery failure | `AUTHENTICATION_FAILED` |
| `BACKEND_UNAVAILABLE` | Port 5123 unreachable or connection refused | `BACKEND_UNAVAILABLE` |
| `TIMEOUT` | Request exceeds timeout threshold | `BACKEND_UNAVAILABLE` / `REQUEST_FAILED` |
| `HTTP_ERROR` | HTTP 4xx / 5xx responses | `REQUEST_FAILED` |
| `PARSING_ERROR` | Invalid JSON payload from server | `REQUEST_FAILED` |
| `CANCELLED` | AbortSignal triggered | Preserved state |

---

## 8. Verification & Tests

The foundation includes 18 unit tests in `vitest`:
- `src/services/api/client.test.ts`: Token injection, loopback discovery, 401 token refresh retry, HTTP error mapping, backend down handling, and timeouts.
- `src/stores/telemetryStore.test.ts`: Single coordinator lifecycle, 2s active cadence, 10s idle cadence, duplicate loop prevention, refreshNow, and error state mapping.
- `src/stores/uiStore.test.ts`: Domain switching, sidebar toggle, inspector toggle, command palette toggle, and theme switching.

All tests execute via `npm test` and build via `npm run build` (`tsc && vite build`).

---

## 9. Limitations & Next Phases

Phase 1 deliberately excludes premature feature implementations:
- Application shell navigation (TopBar, ActivityBar, Sidebar, Inspector) → **Phase 2**
- Operations dashboard → **Phase 3**
- Systems domain (Processes, Apps, Startup, LAN) → **Phase 4**
- Guardian & Memory workspaces → **Phase 5**
- WebSocket Terminal bridge (`ws://127.0.0.1:9003`) → **Phase 6**
- Chat & STT/TTS voice integration → **Phase 7**
- Extensions Hub & Settings → **Phase 8**
- Legacy file removal (`main.ts`, legacy css) → **Phase 9**
