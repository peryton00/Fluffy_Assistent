# Sandbox Limitations & Operational Constraints

## 1. Scope & Execution Boundary

The current Phase 2E sandbox implementation leverages **Subprocess Process Isolation with In-Process Bootstrap Hook Containment and External Watchdogs**.

### Implemented & Enforced Guarantees
1. **Isolated Subprocess (`RUNTIME_CONTAINED`)**: Code executes in a separate OS process, preventing in-memory corruption of Fluffy Assistant's main Python runtime.
2. **Environment Stripping**: Host API keys, tokens, and user credentials are removed prior to spawning the child process.
3. **Workspace Path Canonicalization**: Ephemeral directory isolation prevents path traversal attacks (`..`, UNC, device paths).
4. **Technical Network Denial**: Socket creation, DNS resolution, and standard HTTP libraries are blocked.
5. **Technical Process Denial**: Subprocess spawning and system shell invocation APIs are disabled.
6. **External Timeout & Stream Truncation**: Wall-clock timeouts terminate the process tree, and stdout/stderr buffers are strictly capped at 64KB.
7. **Strict No-Fallback Invariant**: A failure or unavailability of the `SECURE` isolation backend never falls back to unconfined `HOST` execution.

---

## 2. Explicit Security Boundary Disclosure

### What the Current Sandbox IS:
- A dedicated child OS process executing with a strictly scrubbed environment, restricted working directory, in-process runtime interception stubs (blocking `socket`, `subprocess`, `os.system`, `open` escapes), output truncation filters, and an external process-tree termination watchdog.

### What the Current Sandbox is NOT:
- **Not a hardware micro-VM** (e.g. Firecracker, AWS Nitro Enclaves).
- **Not an OCI container runtime** (e.g. Docker, Podman, gVisor, Kata Containers).
- **Not a kernel namespace / cgroups jail** (e.g. Linux bubblewrap, systemd-nspawn).
- **Not a hardware-isolated Windows AppContainer or hypervisor boundary**.

---

## 3. Known Technical Limitations & Attack Surfaces

### 3.1 C-Extensions & Raw Syscalls
- If arbitrary compiled C-extensions or raw assembly invoking unhooked kernel syscalls directly via `ctypes` are executed, in-process Python-level hooks could be bypassed if binary loading is permitted.
  - *Mitigation in Phase 2E*: `PYTHONNOUSERSITE=1`, empty `PYTHONPATH`, sanitized system `PATH`, and standard interpreter security flags.

### 3.2 Host Execution Mode
- The `HOST` execution mode is explicitly **UNCONFINED**. It is protected by an administrative lock (`allow_host_execution=False` by default) and mandatory confirmation gates for all model-generated code.

### 3.3 Air-Gapped Deployment Implications (SIH26117)
- The sandbox operates completely offline without requiring internet connectivity, cloud APIs, remote container registries, or telemetry servers.
- The Python backend uses the local Python interpreter discovered via `sys.executable`.

---

## 4. Platform Verification Status

| Platform | Implementation Status | Live Verified in CI/Dev |
| :--- | :--- | :--- |
| **Windows** | Implemented (`SubprocessIsolationBackend`, `HostExecutionBackend`) | **LIVE-VERIFIED** (Windows 11 host) |
| **Linux** | Implemented (POSIX signal handlers & process groups) | **STRUCTURALLY READY** |
| **macOS** | Implemented (POSIX signal handlers & process groups) | **STRUCTURALLY READY** |
