# Fluffy Integrated Assistant System - Project Review & Agent Briefing

## 🚀 Project Overview
**Fluffy Integrated Assistant System** is a lightweight, privacy-focused system monitor and security guardian for Windows. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern, responsive dashboard (Tauri/TypeScript).

The goal is to provide users with real-time insights into their system's health, detect suspicious behavior (malware-like patterns), and offer quick "normalization" tools to optimize their environment.

## 🏗️ Architecture Stack
The application follows a **Hexagonal Architecture** split into three distinct services that communicate via IPC and HTTP.

### 1. **Core Service (Rust)**
- **Role**: High-performance data collector and system effector.
- **Location**: `/core`
- **Responsibilities**:
    - Monitoring CPU, RAM, Disk, and Network usage (using `sysinfo`).
    - managing process hierarchy and killing processes.
    - **System Control**: Adjusting Volume (WScript) and Brightness (WMI).
    - **IPC Server (Port 9001)**: Broadcasts telemetry to the Brain.
    - **Command Server (Port 9002)**: Listens for actions (Kill, Normalize) from the Brain.

### 2. **The Brain (Python)**
- **Role**: Intelligence layer, analytics, and Web API.
- **Location**: `/brain`
- **Responsibilities**:
    - **IPC Client**: Connects to Rust Core to receive real-time telemetry.
    - **Security Monitor**: Analyzes process behavior (Path, Resources, Persistence, Child Spawning) to assign Threat Scores.
    - **Web API (Flask, Port 5123)**: Serves the Frontend and handles API requests (Status, Command, Normalize).
    - **State Management**: Maintains history of alerts, ignored processes, and pending user confirmations.

### 3. **Frontend (Tauri/TypeScript)**
- **Role**: User Interface and Interaction layer.
- **Location**: `/ui/tauri` (Tauri host), `/ui/frontend` (Web assets).
- **Responsibilities**:
    - **Dashboard**: Visualizes system stats (Charts, Process Tree).
    - **Interaction**: Sends commands (Normalize, Kill, Trust) to the Python API.
    - **Alerts**: Displays security warnings and success modals.
    - **Design**: Premium glassmorphism UI with dark mode support.

## 🛡️ Key Features Implemented

### 1. **Behavioral Security Guardian**
A non-intrusive security system that flags processes based on 4 pillars:
- **Path Integrity**: Detects execution from `%TEMP%`.
- **Resource Anomalies**: Flags sudden CPU/RAM spikes.
- **Child Spawning**: Detects rapid creation of sub-processes.
- **Persistence**: Monitors Registry startup keys.

### 2. **System Normalization**
A "One-Click Fix" feature that:
- **Optimizes Settings**: Sets Volume to 50% and Brightness to 70%.
- **Cleans Disk**: Purges Windows Temp directories.
- **Security Scan**: Checks for and lists any "Unusual Processes" (Threat Score > 0).

### 3. **Resilient Architecture**
- **Self-Healing**: UI handles disconnections gracefully; Python Brain reconnects to Core automatically.
- **Robust Controls**: Volume/Brightness logic uses native WScript and WMI fallbacks for maximum hardware compatibility.

## 📊 Current Status (As of Session 1365)
- **Rust Core**: ✅ Stable, compiling. IPC & Command loop active.
- **Python Brain**: ✅ Stable. Security logic active. API serving on 5123.
- **Tauri UI**: ✅ Polish complete. Real-time graphs, Process Tree, and Modals functional. Light Mode optimized.
- **Verification**: All normalization features (Volume, Brightness, Cleanup) verified working.

## 🔧 Setup & Development
1. **Start Core**: `cd core && cargo run`
2. **Start Brain**: `cd brain && python listener.py`
3. **Start UI**: `npm run tauri dev` (in project root)

## 📝 Notes for Future Agents
- **Token**: The API uses a hardcoded `X-Fluffy-Token: fluffy_dev_token` for internal auth.
- **Logs**: Backend logs are available at `http://127.0.0.1:5123/logs`.
- **Task List**: Use `task.md` in the artifacts folder to track granular progress.
- **Builds**: If Core fails to build due to file locking, ensure `core.exe` is killed via Task Manager.
