# Rust Native Capability Architecture & Implementation

## 1. Architectural Philosophy

Fluffy enforces a strict top-down separation of concerns between high-level Python AI orchestration and the native Rust execution boundary:

```text
┌─────────────────────────────────────────────────────────────┐
│                       AI / LLM Layer                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        Agent Layer                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Tool / Capability Selection                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Security / Policy Enforcement                   │
│         (ActionValidator & Guardian Policy Engine)          │
└──────────────────────────────┬──────────────────────────────┘
                               │  TCP Port 9002 (CapabilityRequest)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Rust Native Capability Layer                   │
│             (CapabilityRegistry & Dispatcher)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Operating System & Hardware               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Authoritative Rust Capability Registry

All native execution is mediated through `core::capabilities::CapabilityRegistry`. Each capability is registered with structured metadata and an implementation of `CapabilityHandler`:

### Implemented & Exposed Capabilities

| Capability ID | Security Tier | Platforms | Handler Class | Description |
| :--- | :---: | :---: | :--- | :--- |
| **`Process.List`** | `ReadOnly` | All | `ProcessListHandler` | Enumerate active system processes, CPU, memory, and status via `sysinfo`. |
| **`Process.Terminate`** | `ConfirmationRequired` | All | `ProcessTerminateHandler` | Terminate process by PID with multi-layer checks (PID < 100 & critical OS blacklist). |
| **`Filesystem.SafePathCheck`** | `ReadOnly` | All | `SafePathCheckHandler` | Validate path safety against protected OS directories and UNC traversal. |
| **`Filesystem.Create`** | `Safe` | All | `FileCreateHandler` | Create/write file within allowed non-protected directories. |
| **`Filesystem.Delete`** | `ConfirmationRequired` | All | `FileDeleteHandler` | Remove file/folder within allowed directories. |
| **`Filesystem.ReadMetadata`** | `ReadOnly` | All | `FileReadMetadataHandler` | Query file size, type, permissions, and modification epoch. |
| **`Filesystem.List`** | `ReadOnly` | All | `FileListHandler` | List directory contents and file sizes. |
| **`System.GetHardware`** | `ReadOnly` | All | `SystemGetHardwareHandler` | Query normalized OS, CPU model/cores, RAM, and architecture. |
| **`System.GetPower`** | `ReadOnly` | All | `SystemGetPowerHandler` | Query battery charge percentage and AC power status. |
| **`Application.Launch`** | `Safe` | All | `ApplicationLaunchHandler` | Search registry/Start Menu index and launch target application. |
| **`Application.Startup.List`**| `ReadOnly` | Windows | `ApplicationStartupListHandler` | Enumerate startup items from Windows Registry Run keys. |
| **`Application.Startup.Set`** | `ConfirmationRequired` | Windows | `ApplicationStartupSetHandler` | Add or delete startup items in Windows Registry. |
| **`Network.ListInterfaces`** | `ReadOnly` | All | `NetworkListInterfacesHandler` | List network adapter names, MACs, IPs, and byte counters. |

---

## 3. Rust-Side Independent Safety Boundary

Even when Python's `ActionValidator` signals `ALLOW`, the Rust Core independently validates all operations:

1. **Process Protection Boundary**:
   - Hard denial for `PID < 100`.
   - Blacklist protection against terminating critical OS processes (`smss.exe`, `csrss.exe`, `wininit.exe`, `services.exe`, `lsass.exe`, `winlogon.exe`, `svchost.exe`, `systemd`, `launchd`, `kernel_task`).
   - Process existence verification before kill.
2. **Filesystem Protection Boundary**:
   - Path canonicalization with automatic Windows UNC (`\\?\`) prefix stripping.
   - Protected path denial (`C:\Windows`, `C:\Program Files`, `/bin`, `/etc`, `/sbin`, `/System`).
   - Parent directory traversal prevention.
3. **Security Tier Enforcement**:
   - `Blocked` capabilities are rejected unconditionally.
   - `ConfirmationRequired` capabilities require explicit user confirmation.

---

## 4. Capability Request / Response Contract

### Request:
```json
{
  "type": "capability",
  "request": {
    "id": "Filesystem.SafePathCheck",
    "parameters": {
      "path": "C:\\Users\\User\\Documents\\test.txt"
    },
    "request_id": "req-98765"
  }
}
```

### Response:
```json
{
  "request_id": "req-98765",
  "success": true,
  "data": {
    "path": "C:\\Users\\User\\Documents\\test.txt",
    "is_safe": true,
    "blocked": false,
    "safety_level": "Safe"
  }
}
```

---

## 5. Dynamic Capability Discovery

The `CapabilityManifest` is generated dynamically from the authoritative `CapabilityRegistry` via `Command::DiscoverCapabilities`:

```json
{
  "platform": "windows",
  "core_version": "0.1.0",
  "capabilities": {
    "Process.List": {
      "id": "Process.List",
      "description": "List active system processes and resource consumption",
      "security_tier": "read_only",
      "requires_confirmation": false,
      "supported_platforms": ["windows", "linux", "macos"],
      "is_implemented": true
    },
    "Application.Startup.Set": {
      "id": "Application.Startup.Set",
      "description": "Add or remove startup application in Windows Registry",
      "security_tier": "confirmation_required",
      "requires_confirmation": true,
      "supported_platforms": ["windows"],
      "is_implemented": true
    }
  }
}
```

---

## 6. Python Integration Bridge

The Python Agent layer interacts with the native capability layer via `brain.runtime.rust_capability_client.RustCapabilityClient`:

```python
from brain.runtime.rust_capability_client import get_capability_client

client = get_capability_client()
manifest = client.discover_capabilities()
result = client.execute_capability("System.GetHardware")
if result["success"]:
    hardware_data = result["data"]
```
