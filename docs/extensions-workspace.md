# Fluffy Desktop — Extensions Domain Documentation

## 1. Overview & Purpose
The Extensions domain serves as an operational workbench for installing, monitoring, editing, and testing custom Python extensions and plugins in the local Fluffy Brain runtime. Rather than functioning as a commercial marketplace, it is designed as a developer/operator control surface for extending Fluffy's natural language intents and local tool capabilities.

---

## 2. Views & Navigation Structure
The Extensions workspace is structured into three primary views:

1. **Installed (`installed`)**
   - Displays all installed extensions discovered by Python Brain (`brain/routes/extension_routes.py`).
   - Surfaces name, intent, version, description, author, language, UI badge, and active status.
   - Provides quick action controls: Enable/Disable toggle, runtime reload, code inspection, external VS Code opening, and deletion.
   - Search filtering by name, intent, or description, with status filter tabs (`All`, `Active`, `Disabled`, `With Web UI`).

2. **Code (`code`)**
   - Safe code viewer and editor for extension handler code.
   - Displays line numbers, language tag, and source filename.
   - **Save & Hot-Reload**: Sends updated source code to Python Brain (`PUT /extensions/<intent>/code`), triggering immediate live module reloading in the active Python runtime without restarting the application.
   - **Runtime Test Runner**: Interactive execution test panel allowing operators to send JSON payloads to `POST /extensions/<intent>/run` and observe live execution outputs and error traces.

3. **Web UIs (`web_ui`)**
   - Embedded web interface viewer for extensions declaring `has_ui: true`.
   - Embeds HTML served directly by Python Brain via `GET /extensions/<intent>/ui` inside an isolated iframe.
   - Provides reload controls and external browser launch capabilities.

---

## 3. Architecture & Data Flow

```text
Extension Component (InstalledView / CodeView / WebUiView)
           ↓
    extensionsStore (Singleton State Manager)
           ↓
   extensions API Service (src/services/api/extensions.ts)
           ↓
    apiClient (HTTP 5123 with X-Fluffy-Token)
           ↓
 Python Brain (brain/routes/extension_routes.py)
```

- **Store**: `src/stores/extensionsStore.ts`
- **API Client**: `src/services/api/extensions.ts`
- **Backend Blueprint**: `brain/routes/extension_routes.py`

---

## 4. Authoritative Backend Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `/extensions` | `GET` | Retrieve list of all installed extensions |
| `/extensions/<intent>` | `GET` | Retrieve metadata and parameter details for an extension |
| `/extensions/<intent>/code` | `GET` | Retrieve extension handler source code |
| `/extensions/<intent>/code` | `PUT` | Save updated source code & trigger hot-reload |
| `/extensions/<intent>/reload` | `POST` | Force module reload into runtime |
| `/extensions/<intent>` | `DELETE` | Delete extension from registry and disk |
| `/extensions/<intent>/toggle` | `POST` | Toggle enable/disable status |
| `/extensions/<intent>/run` | `POST` | Test execute extension handler with payload |
| `/extensions/<intent>/open-vscode` | `POST` | Open extension folder in VS Code |
| `/extensions/<intent>/ui` | `GET` | Serve custom web UI HTML |

---

## 5. Security & Safety Invariants
- **No Arbitrary Frontend Execution**: Source code is executed solely within the Python Brain runtime environment (`POST /extensions/<intent>/run`), never evaluated inside the WebView.
- **Iframe Isolation**: Extension Web UIs are rendered with restricted sandboxing (`allow-scripts allow-forms allow-same-origin`).
- **Confirmation Guards**: Destructive extension removal actions require explicit operator confirmation before firing delete requests.
