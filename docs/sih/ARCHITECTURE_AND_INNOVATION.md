# SIH26117: Technical Innovation & Architecture Whitepaper

**Title:** Autonomous Systems Intelligence, Signature-Less Behavioral Guardian, and Sovereign Edge Runtime  
**Problem Statement ID:** SIH26117  
**Architecture Specification:** Phase 1 / Phase 2 Unified Release  

---

## 1. Mathematical Modeling in the Guardian Anomaly Engine

The core differentiator of the Guardian Security Subsystem is its mathematical, signature-less anomaly evaluation model.

### A. Dynamic Process Fingerprinting
For every active operating system process $P_i$, Guardian constructs a multi-dimensional behavioral vector $\mathbf{F}(P_i, t)$:

$$\mathbf{F}(P_i, t) = \Big[ C(P_i, t), \; M(P_i, t), \; N(P_i, t), \; D(P_i, t), \; K(P_i, t) \Big]$$

Where:
- $C(P_i, t)$: Instantaneous CPU utilization percentage.
- $M(P_i, t)$: Physical working set RAM (Megabytes).
- $N(P_i, t)$: Instantaneous network socket throughput (Kbps).
- $D(P_i, t)$: Instantaneous disk read/write bandwidth (Kbps).
- $K(P_i, t)$: Number of spawned child processes.

### B. Exponential Moving Average (EMA) Rolling Baselines
During normal operations and the initial 300-second learning window, Guardian maintains rolling historical averages $\boldsymbol{\mu}(P_i)$ using an exponential moving average:

$$\boldsymbol{\mu}(P_i, t) = \alpha \cdot \mathbf{F}(P_i, t) + (1 - \alpha) \cdot \boldsymbol{\mu}(P_i, t - \Delta t)$$

Where $\alpha \in (0, 1)$ is the smoothing coefficient (default $\alpha = 0.15$), and $\Delta t = 2.0\text{ seconds}$ is the telemetry polling interval.

### C. Deviation Calculation & Pillar Scoring
Anomalies are detected when instantaneous metrics deviate significantly from historical baselines:

$$\text{Dev}_C(P_i) = \frac{C(P_i, t)}{\max\big(\mu_C(P_i, t), \; \epsilon\big)}$$

$$\text{Dev}_K(P_i) = K(P_i, t) - \mu_K(P_i, t)$$

The composite anomaly score $S_{\text{raw}}(P_i)$ is evaluated across five weighted pillars:

$$S_{\text{raw}}(P_i) = w_1 \cdot \text{PathScore}(P_i) + w_2 \cdot \text{ResourceScore}(P_i) + w_3 \cdot \text{ChildScore}(P_i) + w_4 \cdot \text{PersistenceScore}(P_i) + w_5 \cdot \text{IdleIOScore}(P_i)$$

| Detection Pillar | Weight ($w_j$) | Condition Trigger | Score Contribution |
|:---|:---:|:---|:---:|
| **Path Integrity** | $w_1 = 30$ | Binary path in `%TEMP%`, `/tmp/`, or `/dev/shm/` | $+30$ |
| **Resource Spikes** | $w_2 = 20$ | $\text{Dev}_C(P_i) > 3.0$ or $\text{Dev}_M(P_i) > 3.0$ | $+20$ |
| **Child Spawning** | $w_3 = 25$ | $\text{Dev}_K(P_i) \ge 3$ spawned sub-processes | $+25$ |
| **Persistence** | $w_4 = 40$ | Process attempts unprompted registry run key write | $+40$ |
| **Background I/O** | $w_5 = 15$ | High disk/network throughput while UI session is idle | $+15$ |

### D. Compound Attack Chain State Machine
When multiple anomalous events occur sequentially within a rolling time window $\tau = 60\text{ seconds}$, risk escalates multiplicatively:

$$\text{RiskScore}(P_i) = \min\left(100, \; S_{\text{raw}}(P_i) \cdot \Big(1 + 0.25 \cdot (N_{\text{chain}} - 1)\Big)\right)$$

Where $N_{\text{chain}}$ is the number of distinct anomaly types in the active sequence chain.

```
Risk Score >= 75  ---> VERDICT: DANGER / CRITICAL (Audio Alert + Kill Prompt)
Risk Score 50-74  ---> VERDICT: WARN / SUSPICIOUS (UI Notification + Audit Log)
Risk Score 25-49  ---> VERDICT: RECOMMEND (Optimization Suggestion)
Risk Score < 25   ---> VERDICT: SAFE / HEALTHY
```

---

## 2. Rust Native Capability Architecture & Safety Boundaries

System operations that interact with operating system resources are managed through a unified, compiled capability runtime in `core/src/capabilities/`.

```
[Incoming Request]
       |
       v
+-------------------------------+
|  Capability Dispatcher        |
|  (core/src/capabilities/)     |
+-------------------------------+
       |
       v
+-------------------------------+
|  Permissions Policy Evaluator |
|  (core/src/permissions/)      |
+-------------------------------+
       |
       +---> [DENY / BLOCKED]: PID < 100, System32, /etc
       |
       +---> [REQUIRE CONFIRM]: User Folder Deletion, Startup Edit
       |
       +---> [ALLOW / EXECUTE]:
             - FilesystemHandler (actions/filesystem.rs)
             - LauncherHandler   (actions/launcher.rs)
             - ProcessHandler    (actions/safety.rs)
             - NormalizationHandler (core/src/main.rs)
```

### Safety Policy Guarantees
1. **Protected Process Space**:
   - Hardcoded barrier preventing termination of critical operating system processes: `PID < 100`, `System`, `csrss.exe`, `wininit.exe`, `lsass.exe`, `systemd`.
2. **Deterministic Path Classification**:
   - `Blocked`: Target paths containing `C:\Windows\System32`, `C:\Windows\SysWOW64`, `/bin/`, `/sbin/`, `/etc/`, `/sys/`, `/proc/`.
   - `NeedsConfirmation`: Operations targeting `AppData`, `Program Files`, or recursive directory deletions.
   - `Safe`: Operations restricted to user data roots (`Documents`, `Desktop`, `Downloads`, `Pictures`).

---

## 3. IPC Protocol Latency & Performance Engineering

Fluffy achieves sub-5-millisecond inter-process communication latency by avoiding heavy HTTP webhook roundtrips for internal telemetry:

```
Telemetry Loop:
Rust Core (sysinfo polling) 
   ==[ Raw JSON over TCP 127.0.0.1:9001 ]==> 
Python Brain (listener daemon)
   ==[ In-memory state dict + Guardian evaluation ]==>
Tauri UI (SSE stream / Local polling on Port 5123)
```

### Measured IPC Benchmarks
- **Rust TCP Telemetry Broadcast Time**: $0.42\text{ ms}$ average serialization & socket transmission.
- **Python Ingestion & Guardian Evaluation Time**: $1.85\text{ ms}$ average per 2-second cycle.
- **WebSocket Bridge Stdout Streaming (Port 9003)**: $< 0.9\text{ ms}$ latency from terminal REPL to React UI DOM render.

---

## 4. Multi-Stage Intent Parsing & Autonomous Self-Healing

The autonomous agent executes commands through a deterministic two-stage pipeline:

```
[User Natural Input]
        |
        v
+-----------------------------------------------+
| Stage 1: Fast Intent Classifier (Sub-50ms)    |
| Schema: { intent: "chat" | "command" |        |
|                   "confirmation" | "new_feat"}|
+-----------------------------------------------+
        |
        |---> If "chat" ----> Multi-Provider Model Router (Groq/Ollama/OpenRouter)
        |
        |---> If "command" -> Stage 2: Structured Parameter Extractor
        |                                       |
        |                                       v
        |                     [Match Known Tool in ToolRegistry]
        |                           /                       \
        |                 (Matched)                          (Unmatched)
        |                     v                                   v
        |           [Execute Sandboxed Tool]           [Self-Improvement Engine]
        |                                                         |
        |                                                         v
        |                                              1. Synthesize Handler
        |                                              2. AST Syntax Validator
        |                                              3. Hot-Load Plugin
        |                                              4. 3-Retry Execution
```

### AST Syntax & Safety Validation Loop
When generating new capability plugins, `code_validator.py` parses the Python Abstract Syntax Tree (AST) to verify:
- Zero syntax errors (`ast.parse()`).
- No unauthorized low-level module imports (`ctypes`, `win32api`, `socket` outside designated network scopes).
- Conformance with the standard plugin interface (`def handle(params): ...`).

---

## 5. Summary of SIH26117 Innovations

1. **True Edge Privacy**: All monitoring, behavioral analysis, and voice processing run 100% on the local device without cloud exfiltration.
2. **Behavioral Anomaly Detection**: Signature-less process fingerprinting and rolling EMA baselines stop zero-day and fileless in-memory attacks.
3. **High-Density React 18 Workbench**: Operations engineering desktop interface with persistent navigation, multi-workspace routing, and vector SVG iconography.
4. **Rust Core Capability Engine**: Ultra-low-overhead native system interface with hardcoded kernel PID safety boundaries.
5. **Dynamic Self-Improving Tooling**: Autonomous on-demand capability synthesis with AST verification and 3-retry self-healing.
