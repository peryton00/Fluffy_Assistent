# Sandbox Threat Model & Security Posture

## 1. Threat Vectors & Actors

Untrusted code may originate from:
- **Model-generated code**: Hallucinated, injected, or jailbroken code from LLM outputs.
- **External Extension / MCP**: Untrusted payloads delivered through third-party tools.
- **User-supplied scripts**: Scripts provided by end-users containing malicious or unintentional bugs.

### Primary Threat Objectives

1. **Host Filesystem Exfiltration & Tampering**: Accessing sensitive user files (`~/.ssh`, `~/.aws`, system files, Fluffy internal configuration and SQLite databases).
2. **Secret & Credential Harvesting**: Reading environment variables containing API keys, OAuth tokens, or database credentials.
3. **Network Exfiltration & Lateral Movement**: Sending stolen data to external servers or attacking internal services (`127.0.0.1`, Fluffy Flask API on 5123, Rust IPC on 9002, Terminal Bridge on 9003).
4. **Host Process Hijacking**: Invoking arbitrary system binaries via `subprocess`, `os.system`, or spawning long-lived background daemons.
5. **Denial of Service (DoS)**: Consuming unbounded CPU (infinite loops), allocating gigabytes of RAM (fork bombs/memory bombs), or flooding disk space with gigabytes of logs.

---

## 2. Layered Defense Architecture

```text
[ Threat Actor / Untrusted Code ]
               │
               ▼
┌──────────────────────────────────────────────┐
│ Layer 1: Canonical Tool Security Policy      │
│ - Schema validation & typed arguments        │
│ - Mode check (SECURE / RESTRICTED / HOST)    │
│ - Administrative gate: allow_host_execution  │
│ - Mandatory user confirmation for model code │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Layer 2: Host Environment Sanitization       │
│ - Secret-bearing env vars stripped           │
│ - Python security flags forced               │
│ - Clean minimal environment passed to child  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Layer 3: Ephemeral Filesystem Isolation      │
│ - Dedicated per-execution workspace          │
│ - Strict canonicalization & escape checks    │
│ - Traversal, absolute, UNC, device blocking  │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Layer 4: Technical Runtime Interception      │
│ - Sockets, DNS, HTTP clients monkeypatched   │
│ - Subprocess, os.system, exec, fork blocked  │
│ - Builtin open & Path restricted to work dir │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ Layer 5: External OS Process & Timer Watchdog│
│ - Subprocess executed in separate process    │
│ - External timeout enforcement (kill tree)   │
│ - Stdout/stderr stream byte truncation       │
│ - Ephemeral workspace purge on completion    │
└──────────────────────────────────────────────┘
```

---

## 3. Defense against Specific Attack Classes

| Attack Class | Mechanism | Sandbox Defense |
| :--- | :--- | :--- |
| **Directory Traversal** | `open("../../etc/passwd")`, `..\..\Windows` | Intercepted in runner + canonicalized in `SandboxFilesystemPolicy.is_path_safe()` using `pathlib.Path.resolve().is_relative_to(work_path)`. |
| **UNC & Device Paths** | `\\?\C:\...`, `CON`, `NUL`, `PRN` | Regex inspection and `is_reserved()` validation in filesystem policy. |
| **Environment Scraping** | `os.environ.get("OPENAI_API_KEY")` | Sanitized at spawn time via `SandboxEnvironmentPolicy.sanitize()`. Sensitive keys are never passed into child process. |
| **Socket / Network Access** | `socket.socket()`, `requests.get()` | `socket.socket`, `socket.create_connection`, `urllib.request.urlopen`, and `http.client` methods disabled at bootstrap. |
| **Localhost API Attack** | `urllib.request.urlopen("http://127.0.0.1:5123")` | Network interfaces disabled; any attempt raises `PermissionError("Sandbox: Network access is disabled")`. |
| **Subprocess Execution** | `subprocess.Popen("whoami")`, `os.system("calc")` | `subprocess.Popen`, `subprocess.run`, `subprocess.call`, `os.system`, `os.popen`, `os.spawn*`, `os.exec*` replaced with raising stubs. |
| **Dynamic Import Escape** | `__import__('os').system(...)`, `importlib.import_module` | Module interceptors remain in place; intercepted attributes within loaded modules are stubbed globally. |
| **Host Mode Infiltration** | Model generates `mode="host"` | Blocked if `allow_host_execution=False`. Requires explicit user confirmation if `allow_host_execution=True`. |
| **Resource Abuse** | `while True: pass` | External timer watchdog terminates the process group via `SandboxCancellationManager` on timeout expiry (e.g. 5s). |
| **Stdout Flood** | `print("A" * 10_000_000)` | Output buffer truncated at 64KB (`SandboxLimits.max_stdout_bytes`) in both reader thread and backend collector. |
