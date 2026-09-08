# Fluffy Desktop — Systems Domain Architecture & Specification

## 1. Overview

The **Systems Domain** is Fluffy Desktop's operational system-management workspace. It provides unified, dense engineering interfaces for:
1. **Process Explorer (`processes`)**: Inspect flat process tables or hierarchical parent-child process trees with real-time CPU, RAM, disk I/O, network metrics, and process termination triggers.
2. **Applications Manager (`apps`)**: Browse, search, launch, and uninstall desktop applications discovered from the Windows Registry, with embedded Base64 icon rendering and deep re-scan capabilities.
3. **Startup & Persistence Manager (`startup`)**: Inspect, toggle enabled/disabled state, remove, and register new autostart items across the Windows Registry (`HKCU\...\Run`) and Startup folder.
4. **Distributed LAN Nodes (`network`)**: Manage peer-to-peer LAN clustering roles (`standalone`, `available`, `admin`), discover remote Fluffy workstations, select active monitoring targets, and inspect remote machine telemetry.
5. **Hardware Engineering Telemetry (`hardware`)**: Detailed real-time hardware telemetry for multi-core CPU usage & frequency, RAM breakdown, disk filesystem mount points, network interfaces, and power/battery status.
6. **Systems Overview (`overview`)**: Systems command center aggregating health, process counts, application metrics, startup entries, and quick navigation cards.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────┐
│               Systems Domain Architecture              │
└────────────────────────────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌────────────────┐
│telemetryStore│   │  appsStore   │   │  networkStore  │
│ (GET /status)│   │  (GET /apps) │   │(/network/admin)│
└──────┬───────┘   └──────┬───────┘   └───────┬────────┘
       │                  │                   │
       └──────────────────┼───────────────────┘
                          ▼
            ┌───────────────────────────┐
            │     SystemsWorkspace      │
            └─────────────┬─────────────┘
                          │
  ┌────────────┬──────────┼──────────┬────────────┬───────────┐
  ▼            ▼          ▼          ▼            ▼           ▼
Overview   Processes    Apps      Startup      Network    Hardware
```

### Component Structure
- `SystemsWorkspace.tsx`: Router rendering subviews based on `uiStore.activeSidebarView`.
- `views/SystemsOverview.tsx`: Systems command center aggregating key metrics.
- `views/ProcessesView.tsx`: Process Explorer with flat and tree view modes, column sorting, search filter, and process termination.
- `views/ApplicationsView.tsx`: Applications Manager grid with Base64 icons, search, Launch, Uninstall, and Deep Rescan.
- `views/StartupView.tsx`: Startup entries table, enabled/disabled toggles, item removal, and Add Entry modal.
- `views/NetworkView.tsx`: Role selector (`standalone`, `available`, `admin`), LAN node cards, Add Node modal, and remote machine telemetry inspector.
- `views/HardwareView.tsx`: Real-time hardware telemetry for CPU, RAM, mount points, adapters, and power.
- `components/SystemsHeader.tsx`: Context header displaying local host vs remote target machine indicator and sync time.
- `components/ProcessRow.tsx` & `ProcessTree.tsx`: Optimized process table row and tree nodes.
- `components/ApplicationCard.tsx`: Application card with embedded Base64 icon, executable path, size, and actions.
- `components/StartupRow.tsx`: Persistence row with toggle and remove actions.
- `components/NetworkNodeCard.tsx`: Discovered LAN machine node card with status and target switch action.

---

## 3. Backend Contracts & Endpoint Mapping

| Domain Area | Endpoint | HTTP Method | Payload / Response |
| :--- | :--- | :--- | :--- |
| **System Status** | `/status` | `GET` | `TelemetrySnapshot` (CPU, RAM, Disks, Network, Processes, Persistence) |
| **Kill Process** | `/command` | `POST` | `{ "KillProcess": { "pid": number } }` |
| **Installed Apps** | `/apps` | `GET` | `InstalledApp[]` |
| **Apps Re-scan** | `/apps/refresh` | `POST` | `{ "ok": true, "count": number }` |
| **Launch App** | `/apps/launch` | `POST` | `{ "exe_path"?: string, "location"?: string, "name"?: string }` |
| **Uninstall App** | `/apps/uninstall` | `POST` | `{ "uninstall_string"?: string, "name"?: string }` |
| **Toggle Startup** | `/command` | `POST` | `{ "StartupToggle": { "name": string, "enabled": boolean } }` |
| **Add Startup** | `/command` | `POST` | `{ "StartupAdd": { "name": string, "path": string } }` |
| **Remove Startup**| `/command` | `POST` | `{ "StartupRemove": { "name": string } }` |
| **Network Role** | `/network/role` | `GET`/`POST` | `{ "role": "standalone" \| "available" \| "admin" }` |
| **Admin Nodes** | `/network/admin/machines` | `GET` | `{ "ok": true, "machines": NetworkMachine[], "active_machine"?: string }` |
| **Switch Target** | `/network/admin/switch` | `POST` | `{ "machine_id": string }` |
| **Remote Telemetry**| `/network/admin/data/<id>` | `GET` | `{ "ok": true, "data": RemoteMachineData }` |
| **Add Node** | `/network/admin/add` | `POST` | `{ "ip": string, "port": number, "name"?: string }` |
| **Remove Node** | `/network/admin/remove`| `POST` | `{ "machine_id": string }` |

---

## 4. Verification Results

- **Unit & Integration Tests:** 12 test suites, 77 passed, 4 skipped (real-backend skipped in offline unit test environment), 0 failed.
- **Production Vite Build:** `tsc && vite build` succeeds with 0 errors.
- **Backend Modifications:** Exactly 0 lines of code modified outside `ui/tauri/` and `docs/`.
