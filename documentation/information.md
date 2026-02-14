# Fluffy Assistant: Ultimate Information Dossier 🐰

This document serves as the single source of truth for the **Fluffy Integrated Assistant Assistant System** project. It consolidates all architectural, functional, and technical documentation into one structured guide.

---

## 📖 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Deep-Dive](#architecture-deep-dive)
3. [Core Systems & Features](#core-systems--features)
4. [Security Guardian Analysis](#security-guardian-analysis)
5. [Voice & AI Intelligence](#voice--ai-intelligence)
6. [Self-Improvement & Extension](#self-improvement--extension)
7. [Technical File Structure](#technical-file-structure)
8. [Code Logic Explanations](#code-logic-explanations)
9. [Setup & Configuration](#setup--configuration)
10. [Roadmap & Future Growth](#roadmap--future-growth)

---

## 1. Project Overview
**Fluffy Assistant Desktop** is a lightweight, privacy-focused system monitor and security guardian for Windows. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

### Key Principles:
- **100% Local Processing**: All telemetry and analysis stay on the machine.
- **Privacy-First**: No data exfiltration or cloud dependencies for core functions.
- **High Performance**: Rust core ensures minimal system overhead during monitoring.
- **Intelligent Interaction**: Voice and LLM chat integration for hands-free control.

---

## 2. Architecture Deep-Dive
The system follows a **Three-Tier Hexagonal Architecture**, separating performance, intelligence, and interface.

### The Three Services:
1. **Core Service (Rust)**: The "Nervous System". Collects low-level metrics (CPU, RAM, Disk, Network) and executes hardware commands (Volume, Brightness).
   - **Port 9001**: Telemetry Broadcast (JSON over TCP).
   - **Port 9002**: Command Receiver.
2. **The Brain (Python)**: The "Frontal Lobe". Analyzes telemetry for threats, manages persistent memory, handles voice processing, and hosts the Web API.
   - **Port 5123**: Flask Web API.
3. **Frontend (Tauri/TS)**: The "Face". Modern desktop dashboard that visualizes data and sends user intents to the Brain.

### Communication Flow:
- **Telemetry**: Core → Brain (Persistent TCP stream every 2s).
- **Control**: UI → Brain (HTTP REST) → Core (TCP JSON).
- **Status**: UI ← Brain (REST Polling with token-based handshake).

---

## 3. Core Systems & Features

### System Monitoring
- **Real-Time Dashboards**: Interactive charts for CPU and RAM usage.
- **Process Hierarchy**: Full parent-child tree visualization with pinning and sorting.
- **Precision Telemetry**: 10-second rigorous speed tests and ETW-based per-process network tracking.

### Memory & Persistence
- **Dual-Layer Memory**:
  - **Long-Term**: Persistent JSON storage for user profiles and trusted process whitelists.
  - **Session-Based**: Context-aware buffers for multi-turn conversations.
- **Trusted Processes**: Learn once, trust forever. Guardian skips analysis for whitelisted processes.

### System Normalization
- **One-Click Fix**: Resets Volume (50%), Brightness (70%), and purges `%TEMP%` folders.
- **Safety Scan**: Triggers a global re-verification of all active processes.

---

## 4. Security Guardian Analysis
The Guardian is a behavioral security engine that uses historical baselines to detect anomalies without signatures.

### The 4 Pillars of Detection:
1. **Path Integrity**: Execution from suspicious Temp directories (+30 Risk).
2. **Resource Anomalies**: CPU/RAM usage exceeding 3x the historical average (+20 Risk).
3. **Child Spawning**: Rapid creation of command-line sub-processes (+25 Risk).
4. **Persistence**: Unauthorized monitoring of Registry startups (+40 Risk).

### Learning Phase:
- On first run, the system enters a **5-minute Learning Phase**.
- It establishes behavioral baselines (EMA-based) for every process active on the system.
- Alerts are suppressed during this phase to prevent false positives.

---

## 5. Voice & AI Intelligence

### Voice System
- **Offline STT**: Uses the **Vosk** engine for zero-cloud speech recognition.
- **Neural TTS**: Uses **Piper** for high-quality, natural-sounding audio feedback.
- **Confirmation Flow**: Potentially dangerous commands (like "Kill System Process") require verbal confirmation.

### LLM Chat
- **Multi-Provider**: Support for OpenAI, Claude (Anthropic), Groq, and local Ollama instances.
- **Intent Classification**: Classifier determines if the user wants to execute a command or just chat.
- **Context Awareness**: Remembers the last 10 exchanges for conversational continuity.

### Interrupt Commands:
- Global "Shut up" or "Stop" triggers stop all TTS playback and clear pending system intents instantly.

---

## 6. Self-Improvement & Extension

### The Self-Improvement Cycle:
1. **Observation**: Detects when it cannot handle a user request.
2. **Architecture**: Designs a new Python extension to handle the missing logic.
3. **Generation**: `CodeGenerator` writes a compliant extension file.
4. **Integration**: `ExtensionLoader` dynamically loads the new capability into the Brain.

### Plugin System:
- Standardized interfaces for adding new hardware monitors or AI capabilities without rebuilding the entire app.

---

## 7. Technical File Structure

```text
/
├── core/                # Rust Source
│   └── src/             # Telemetry & IPC logic
├── brain/               # Python Intelligence
│   ├── guardian/        # Behavioral detection modules
│   ├── memory/          # Persistence handlers
│   ├── extensions/      # Dynamically generated plugins
│   └── web_api.py       # Main Flask entry point
├── ui/                  # Tauri Frontend
│   └── tauri/src/       # TypeScript dashboard components
├── ai/                  # AI/LLM logic
│   └── src/llm_service.py
├── voice/               # STT/TTS Implementation
├── fluffy_data/         # User data & Baselines (Persistent)
└── documentation/       # Consolidates all guides
```

---

## 8. Code Logic Explanations

### Rust Telemetry Loop (Simplified):
```rust
loop {
    system.refresh_all();
    let stats = get_fluffy_stats(&system);
    let message = json!({"data": stats}).to_string();
    ipc_server.broadcast(message);
    thread::sleep(Duration::from_millis(2000));
}
```

### Python Guardian Pipeline:
```python
def analyzer(process_metrics):
    fingerprint = track_fingerprint(process_metrics)
    baseline = get_baseline(process_name)
    anomalies = detect_deviations(fingerprint, baseline)
    risk_score = calculate_score(anomalies)
    if risk_score > THRESHOLD:
        generate_alert(process_name, risk_score)
```

---

## 9. Setup & Configuration

### Prerequisites:
- Rust (Cargo), Python 3.8+, Node.js (for Tauri).

### Quick Start:
1. **Core**: `cd core && cargo run`
2. **Brain**: `cd brain && python listener.py`
3. **UI**: `cd ui/tauri && npm run tauri dev`

### LLM Configuration:
- Create a `.env` file in the root.
- Add `OPENROUTER_API_KEY` and choose your model (e.g., `openai/gpt-3.5-turbo`).

---

## 10. Roadmap & Future Growth
- **Cross-Platform**: Support for Linux (using /proc) and macOS.
- **Mobile**: Companion app for remote system monitoring.
- **Network Fortress**: Deep packet inspection and domain-level firewalling.
- **Collaborative Intelligence**: Peer-to-peer sharing of threat baselines.
- **Can connect with multiple devices**: Fluffy Assistant can connect with multiple devices and monitor them.
- **AI-Driven Self-Improvement**: Automatically learns from user interactions and improves over time.
- **Voice & AI Integration**: Enhanced voice commands and AI-driven responses.
- **System Normalization**: Automated system normalization and maintenance.
- **Security Updates**: Regular security updates and patches.
- **Performance Optimization**: Continuous performance optimization and scaling.
- **Becomes a OS**: Fluffy Assistant becomes a OS.


---
*Created on 2026-02-14 | Fluffy Assistant Documentation Project*
