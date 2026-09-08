# Fluffy Local AI Runtime Architecture (Phase 2A)

## Overview

Fluffy is **platform-independent at the application architecture level**. Platform-specific hardware and operating-system integrations are strictly isolated behind capability abstractions.

The Local AI Runtime provides a clean, decoupled foundation for running open-weight AI models locally without internet access, vendor lock-in, or operating-system dependencies.

---

## 1. Architectural Hierarchy

The subsystem follows a strict top-down dependency hierarchy:

```text
┌─────────────────────────────────────────────────────────────┐
│                       Fluffy Agent                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 AI Runtime Interface                        │
│                 (brain.ai.runtime)                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Model Provider Interface                      │
│               (brain.ai.providers)                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Inference Backend                          │
│                 (brain.ai.backends)                         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Hardware / OS Layer                         │
│                 (brain.ai.hardware)                         │
└─────────────────────────────────────────────────────────────┘
```

The Agent layer has zero knowledge of GPU accelerators (CUDA/ROCm/Metal) or operating system internals (Windows/Linux/macOS).

---

## 2. Component Responsibilities

### A. Hardware & Platform Abstraction (`brain/ai/hardware/`)
- **`HardwareCapabilities`**: Consolidated, capability-oriented hardware profile describing OS, CPU cores, RAM, and GPU devices.
- **`HardwareDetector`**: Centralized, non-intrusive detection of hardware capabilities. Safe on all platforms with zero scattered `sys.platform` checks.
- **`AcceleratorType`**: Extensible accelerator classification (`CPU`, `CUDA`, `ROCM`, `METAL`, `VULKAN`, `DIRECTML`, `NONE`).

### B. Platform-Independent Paths (`brain/ai/config/paths.py`)
- Standard application directories resolved by `ApplicationDataPaths`:
  - **Windows**: `%LOCALAPPDATA%/Fluffy` (or `%APPDATA%/Fluffy`)
  - **Linux**: `$XDG_DATA_HOME/fluffy` or `~/.local/share/fluffy`
  - **macOS**: `~/Library/Application Support/Fluffy`
- Full support for explicit user overrides via `FLUFFY_DATA_DIR` and `FLUFFY_MODELS_DIR`.

### C. Models & Registry (`brain/ai/models/`)
- **`ModelDefinition`**: Rich model descriptor (ID, family, version, parameter count, quantization, context length, capabilities, requirements, format, file path).
- **`ModelCapability`**: Extensible capabilities (`TEXT_GENERATION`, `CHAT`, `CODE`, `REASONING`, `VISION`, `EMBEDDING`, `AUDIO`).
- **`ModelRegistry`**: In-memory and on-disk discovery, lookup, capability queries, and hardware compatibility validation (`is_compatible`).

### D. Model Providers vs. Inference Backends
- **Model Provider** (`brain/ai/providers/`): Responsible for *where/how the model is sourced and described* (e.g. `LocalModelProvider` scanning local model storage).
- **Inference Backend** (`brain/ai/backends/`): Responsible for *how the model is executed* (e.g. `LlamaCppBackend`, `ReferenceBackend`).
- **`BackendRegistry`**: Explicit registration and capability-based selection of execution engines.
- **`ReferenceBackend`**: Strictly deterministic, zero-dependency backend for testing, contract validation, and CI.

### E. Runtime & Lifecycle (`brain/ai/runtime/`)
- **`ModelLifecycleState`**: Explicit lifecycle states (`AVAILABLE` -> `LOADING` -> `LOADED` -> `READY` -> `UNLOADING` -> `UNLOADED` / `FAILED` / `ERROR`).
- **`RuntimeManager`**: Single entry-point coordinating model loading, generation, streaming, task cancellation (`CancellationHandle`), and health diagnostics (`RuntimeHealth`).

---

## 3. Offline-First & Sovereignty Semantics

- **Zero Outbound Telemetry**: Local inference does not make network requests, phone home, or contact external telemetry servers.
- **Zero Silent Downloads**: Models are never downloaded implicitly during inference. All models must be explicitly provided in local storage.
- **Deterministic Offline Execution**: Functions 100% offline once model weights and dependencies are present.

---

## 4. Security Boundaries

The Fluffy security model remains strictly enforced:

```text
       LLM / Local Model Output
                  │
                  ▼
             Agent Layer
                  │
                  ▼
            Tool Selection
                  │
                  ▼
      ActionValidator / Policy Boundary
     (ALLOW / REQUIRE_CONFIRM / DENY)
                  │
                  ▼
         Privileged Execution
```

**Critical Security Invariant**: The local AI runtime produces data/text only. A model output can never directly trigger shell commands, file modifications, network calls, extensions, or privileged execution without passing through the `ActionValidator`.
