# Fluffy Assistant: Security & Guardian Architecture

This directory provides architectural specifications, threat models, and policy enforcement rules governing the security posture of the **Fluffy Assistant** platform.

---

## 1. Security Architecture Overview

Fluffy Assistant employs a multi-tiered security defense model combining behavioral anomaly detection, deterministic policy enforcement, token authentication, and sandboxed code execution:

```
+-------------------------------------------------------------------+
|                        Tauri Desktop UI                           |
|      (Token-authenticated requests, confirmation prompts)         |
+---------------------------------^---------------------------------+
                                  | Token Handshake (X-Fluffy-Token)
+---------------------------------v---------------------------------+
|                   Python Brain Security Layer                     |
|                                                                   |
|   +--------------------------+   +----------------------------+   |
|   |     Guardian Engine      |   |      Action Validator      |   |
|   |  - Process Fingerprints  |   |  - Path Classification     |   |
|   |  - 5-Min Rolling Baseline|   |  - Dangerous Command Check |   |
|   |  - Attack Chain Scorer   |   |  - User Confirmation Gate  |   |
|   |  - Incident Audit Logger |   +----------------------------+   |
|   +--------------------------+                                    |
|                                  +----------------------------+   |
|                                  |    Restricted Code Sandbox |   |
|                                  |  - AST Syntax & Import Ban |   |
|                                  |  - Isolated Subprocess Env |   |
|                                  +----------------------------+   |
+---------------------------------^---------------------------------+
                                  | TCP JSON IPC
+---------------------------------v---------------------------------+
|                    Rust Core Permissions Layer                    |
|   - Protected PID Thresholds (PID < 100)                          |
|   - Critical System Path Boundaries (System32, /etc)              |
|   - Safe OS Capability Invocation                                 |
+-------------------------------------------------------------------+
```

---

## 2. Core Security Pillars

### A. Guardian Behavioral Anomaly Engine (`brain/guardian/`)
Unlike traditional antivirus software that relies solely on known malware signatures, Guardian performs continuous behavioral monitoring:
1. **Process Fingerprinting (`fingerprint.py`)**: Tracks process CPU, RAM, spawned child counts, and network bandwidth.
2. **5-Minute Rolling Baselines (`baseline.py`)**: Establishes moving average baselines for system processes. During the initial 5-minute learning phase, alerts are suppressed to eliminate false positives.
3. **Anomaly & Chain Scoring (`anomaly.py`, `chain.py`, `scorer.py`)**: Evaluates anomalous events (e.g. execution from `%TEMP%` or `/dev/shm/`, rapid child process spawning, sudden 3x resource spikes, unauthorized registry startup modifications). Sequence chains compound risk scores to categorize processes into `Safe`, `Warn`, `Recommend`, or `Require Confirmation`.
4. **Audit Logging (`audit.py`)**: Persists all security verdicts and risk escalations to disk (`fluffy_data/guardian/audit.json`).

### B. Action Validator & Policy Engine (`brain/security/action_validator.py`)
Validates every user or agent-initiated command before execution:
- **Blocked Paths**: System root directories (`C:\Windows\`, `/bin/`, `/etc/`, `/sys/`).
- **Safe Paths**: Standard user directories (`Documents`, `Desktop`, `Downloads`, `Pictures`, `Music`).
- **Confirmation Mandatory**: Destructive commands (file deletions, registry autostart modifications, process terminations outside user-owned trees) require explicit confirmation.

### C. Rust Core Native Permissions (`core/src/permissions/`)
Provides a native security barrier before executing low-level system operations:
- **PID Protection**: Refuses termination of core system processes (PID < 100, `csrss.exe`, `systemd`, `wininit.exe`).
- **Registry & Filesystem Checks**: Validates paths directly in native Rust before invoking OS APIs.

### D. Token Handshake (`X-Fluffy-Token`)
- All inter-process communication between the UI, Brain, and background services requires a dynamically generated or `.env`-configured secret token passed via the `X-Fluffy-Token` HTTP header.

---

## 3. Sandboxing & Threat Model Specifications

- [**Sandbox Threat Model**](./sandbox-threat-model.md): Detailed threat analysis, attack vectors, trust boundaries, and mitigation strategies for code execution.
- [**Sandbox Limitations**](./sandbox-limitations.md): Technical boundaries and constraints of the current Python execution sandbox.
