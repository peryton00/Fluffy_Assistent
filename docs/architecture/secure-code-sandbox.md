# Secure Code Sandbox Architecture

## 1. Overview & System Purpose

The **Secure Code Sandbox** is an untrusted execution environment within Fluffy Assistant designed to execute user-supplied and model-generated code safely. It operates strictly as a capability provider within the **Unified Tool Runtime** (`ToolKind.SANDBOX`), preventing code execution from bypassing security policies, validation pipelines, or behavioral monitoring.

```text
                     Agent / StepExecutor
                              ↓
                    UnifiedToolRuntime
                              ↓
                ToolResolver & SchemaValidator
                              ↓
               ToolSecurityPolicy & ActionValidator
                              ↓
                Guardian Behavioral Observation
                              ↓
             SandboxToolAdapter (sandbox.execute)
                              ↓
                       SandboxManager
                              ↓
             ┌────────────────┼────────────────┐
             ↓                ↓                ↓
          SECURE         RESTRICTED           HOST
             ↓                ↓                ↓
         Sandbox          Restricted          Host
         Backend           Backend          Backend
     (Subprocess)      (Subprocess)    (Unconfined Process)
             │                │                │
             └────────────────┴────────────────┘
                              ↓
       SandboxExecutionResult → ToolResult → StepObservation
```

---

## 2. Core Components

### 2.1 Package Decomposition (`brain/sandbox/`)

- **`definitions.py`**:
  - `SandboxLanguage` (e.g. `PYTHON`).
  - `SandboxProvenance` (`USER`, `MODEL`, `EXTENSION`, `MCP`, `SYSTEM`).
  - `SandboxExecutionMode` (`SECURE`, `RESTRICTED`, `HOST`).
  - `SandboxSecurityLevel` (`RUNTIME_CONTAINED`, `OS_ISOLATED`, `UNCONFINED`).
  - `SandboxBackendCapabilities` (`filesystem_isolation`, `network_isolation`, `process_isolation`, `environment_isolation`, `resource_limits`, `process_tree_termination`, `native_os_isolation`, `security_level`).
  - `SandboxLifecycleState` and `SandboxHealthStatus`.
- **`limits.py`**: Immutable deterministic resource limits (`SandboxLimits`) specifying default/max execution timeout (5s default, 30s max), stdout/stderr byte limits (64KB), memory bounds, process limits, and workspace limits (10MB).
- **`filesystem.py`**: `SandboxFilesystemPolicy` managing dedicated ephemeral execution workspaces (`input/`, `work/`, `output/`). Validates and canonicalizes paths, defending against directory traversal (`..`, `..\`), absolute paths, UNC paths, Windows reserved device paths (`CON`, `PRN`, `NUL`, etc.), and symlink escapes.
- **`environment.py`**: `SandboxEnvironmentPolicy` sanitizing inherited environment variables. Strips secret-bearing tokens (`API_KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIALS`, `SSH_*`, `AWS_*`, `GITHUB_*`, `USERPROFILE`, `HOME`), and forces secure Python interpreter runtime flags (`PYTHONNOUSERSITE=1`, `PYTHONUNBUFFERED=1`, `PYTHONDONTWRITEBYTECODE=1`, `PYTHONHASHSEED=random`, `PYTHONPATH=""`).
- **`network.py`**: `SandboxNetworkPolicy` generating technical runtime containment hooks to block socket creation, TCP/UDP operations, DNS resolution, HTTP/HTTPS clients (`urllib`, `requests`, `http.client`), and connections to localhost (`127.0.0.1`, `::1`, localhost ports 9002, 9003, 5123).
- **`process.py`**: `SandboxProcessPolicy` generating process creation interception hooks to block `subprocess`, `os.system`, `os.popen`, `os.spawn*`, `os.exec*`, `pty`, and `multiprocessing`.
- **`policy.py`**: `SandboxPolicy` composing execution modes, administrative host permission (`allow_host_execution`), limits, filesystem, network, environment, and process rules into a unified execution contract.
- **`runner.py`**: Isolated Python bootstrap harness injected into the child process. It applies network, process, and filesystem interception hooks before executing the target script, capturing and serializing results safely.
- **`backend.py`**: `SandboxBackend` abstract interface, `SubprocessIsolationBackend` (concrete SECURE/RESTRICTED backend, reporting `RUNTIME_CONTAINED`), and `HostExecutionBackend` (explicit unconfined host backend, reporting `UNCONFINED`).
- **`cancellation.py`**: `SandboxCancellationManager` managing process tree tracking and cross-platform process termination (SIGTERM/SIGKILL / `taskkill` process tree).
- **`lifecycle.py`**: `SandboxLifecycleManager` enforcing deterministic state transitions (`CREATED` → `STARTING` → `RUNNING` → `COMPLETED` / `FAILED` / `KILLED` → `CLEANED`).
- **`health.py`**: `SandboxHealth` tracking runtime status, total executions, error rates, and security violation counters.
- **`manager.py`**: `SandboxManager` orchestrating workspace provisioning, execution mode routing, administrative policy enforcement, cancellation, and cleanup.

---

## 3. Execution Modes & Invariants

| Mode | Backend | Security Level | Network | Subprocesses | Environment | Admin Authorization | User Confirmation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`SECURE`** *(Default)* | `SubprocessIsolationBackend` | `RUNTIME_CONTAINED` | Blocked | Blocked | Sanitized | Default Allowed | For model code |
| **`RESTRICTED`** | `SubprocessIsolationBackend` | `RUNTIME_CONTAINED` | Blocked | Blocked | Sanitized | Default Allowed | For model code |
| **`HOST`** | `HostExecutionBackend` | `UNCONFINED` | Allowed | Allowed | Host Env | **Required (`allow_host_execution=True`)** | **Mandatory for Model Code** |

### Hard Invariants
1. **Never Bypass Tool Runtime**: Host execution mode still passes through `UnifiedToolRuntime`, schema validation, security policies, and Guardian observation.
2. **Administrative Lock**: If `allow_host_execution = False`, any request for `HOST` execution is deterministically rejected with `security_denied` without spawning any process.
3. **No Unsafe Fallback**: If the `SECURE` or `RESTRICTED` backend is unavailable, execution fails with `backend_unavailable`. It will **NEVER** silently fall back to `HOST` execution.

---

## 4. Tool Runtime Integration

The sandbox is registered as a canonical tool within `ToolRegistry`:

- **Identifier**: `sandbox.execute` (with aliases `code.execute`, `code_sandbox`, `sandbox`)
- **Kind**: `ToolKind.SANDBOX`
- **Risk Level**: `ToolRiskLevel.CONFIRMATION_REQUIRED`
- **Input Parameters**:
  - `code` (string, required): Source code to execute.
  - `language` (string, default `"python"`): Target programming language.
  - `mode` (string, enum `["secure", "restricted", "host"]`, default `"secure"`): Execution mode.
  - `stdin` (string, optional): Input string.
  - `timeout` (number, optional): Execution timeout in seconds.
