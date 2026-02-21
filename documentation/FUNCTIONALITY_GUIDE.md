# Fluffy Integrated Assistant System - Comprehensive Functionality Guide

## Executive Summary

**Fluffy Integrated Assistant System** is an advanced, privacy-focused system monitoring and security platform for **Windows and Linux (Kali Linux)**. It combines high-performance native system monitoring (Rust), intelligent behavioral analysis (Python), and a modern desktop interface (Tauri/TypeScript) to provide users with real-time insights into system health, detect suspicious behavior, and offer intelligent assistance through voice commands and LLM-powered chat.

**Key Highlights:**
- **100% Local Processing** - No cloud dependencies, complete privacy
- **Real-Time Monitoring** - CPU, RAM, Network, Disk, and Process tracking
- **Behavioral Security** - AI-powered threat detection without signatures
- **Voice Control** - Natural language commands with TTS feedback
- **LLM Integration** - Multi-provider chat assistant (OpenAI, Anthropic, Groq, Ollama)
- **Native Performance** - Tauri desktop app with minimal resource footprint

---

## Architecture Overview

### Three-Tier Hexagonal Architecture

Fluffy Assistant follows a clean separation of concerns with three distinct services:

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                       │
│                    (Tauri + TypeScript)                     │
│                     Port: Native Window                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTELLIGENCE LAYER                       │
│                      (Python Brain)                         │
│                       Port: 5123                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ • Security Monitor  • Guardian Engine                │   │
│  │ • LLM Service       • Voice System                   │   │
│  │ • Command Parser    • Chat History                   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (TCP Socket)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     MONITORING ENGINE                       │
│                       (Rust Core)                           │
│                   Ports: 9001, 9002                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ • System Telemetry  • Process Management             │   │
│  │ • ETW Network       • Volume/Brightness Control      │   │
│  │ • Registry Monitor  • Command Execution              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **Core → Brain**: Telemetry broadcast via IPC (Port 9001) every 2 seconds
2. **Brain → Core**: Commands sent via TCP (Port 9002)
3. **UI → Brain**: HTTP REST API (Port 5123) with token authentication
4. **Brain → UI**: Real-time status updates via polling

---

## Core Features

### 1. System Monitoring

#### Real-Time Metrics
- **CPU Usage**: Global CPU percentage with per-core tracking
- **RAM Usage**: Total, used, and available memory in MB/GB
- **Network Activity**: 
  - Live KB/s tracking for RX/TX
  - Connection type detection (WiFi/Ethernet/Offline)
  - Internet speed test (10-second precision test)
- **Disk I/O**: Read/write operations per process
- **Process Count**: Total active processes

#### Process Hierarchy
- **Tree Visualization**: Parent-child process relationships
- **Sorting Options**: By RAM, CPU, or Name
- **Search Functionality**: Filter by process name or PID
- **Process Pinning**: Keep important processes at the top
- **Context Actions**:
  - Kill Process (with confirmation)
  - Open File Location
  - Google Process Name
  - Trust Process (for Guardian)

#### Resource History
- **Live Charts**: CPU and RAM usage over time
- **Smoothed Data**: 70/30 EMA for stable visualization
- **Top Offenders**: Processes consuming most resources

---

### 2. Security Guardian (Behavioral Analysis)

The Guardian is a **Level 2 behavioral security system** that learns normal system behavior and detects anomalies without signature-based detection.

#### Four Pillars of Detection

**1. Path Integrity**
- Monitors execution from suspicious locations:
  - **Windows**: `%TEMP%`, `AppData\Local\Temp`
  - **Linux**: `/tmp/`, `/dev/shm/`, `/var/tmp/`
- Flags processes running from non-standard directories
- Risk Score: +30 for temp execution

**2. Resource Anomalies**
- Detects sudden CPU spikes (>3x baseline)
- Monitors RAM growth rate
- Tracks disk I/O patterns
- Risk Score: +20 per anomaly

**3. Child Spawning**
- Monitors rapid sub-process creation
- Detects process chains (malware behavior)
- Tracks spawn rate vs. baseline
- Risk Score: +25 for excessive spawning

**4. Persistence Monitoring**
- Scans Windows Registry startup keys
- Monitors Startup folder changes
- Detects unauthorized auto-run attempts
- Risk Score: +40 for persistence

#### Learning Phase
- **Duration**: 5 minutes on first run or after reset
- **Purpose**: Establish behavioral baselines for all processes
- **Behavior**: Alerts suppressed during learning
- **Progress**: Displayed in UI with percentage

#### Baseline Engine
- **Storage**: `fluffy_data/guardian/baselines.json`
- **Algorithm**: Exponential Moving Average (α=0.01)
- **Metrics Tracked**:
  - Average CPU, Peak CPU
  - Average RAM, Peak RAM, Growth Rate
  - Child count, Spawn rate
  - Network sent/received
  - Process lifespan, Restart count

#### Risk Scoring
- **Safe**: 0-30 points
- **Suspicious**: 31-60 points
- **Request Confirmation**: 61-80 points
- **Critical**: 81+ points

#### Verdict Generation
- **Automatic Alerts**: For scores >60
- **User Confirmation**: Required for termination
- **Voice Feedback**: TTS alerts for serious threats
- **Audit Trail**: All decisions logged

#### User Actions
- **Ignore**: Suppress alerts for this PID (session-only)
- **Trust**: Whitelist process permanently
- **Mark Dangerous**: Flag for future reference
- **Clear Knowledge**: Reset all learned baselines

---

### 3. Voice Commands

#### Speech-to-Text (STT)
- **Engine**: Vosk (offline, privacy-preserving)
- **Model**: Small English model (~40MB)
- **Activation**: Push-to-talk or continuous listening
- **Accuracy**: Optimized for system commands

#### Text-to-Speech (TTS)
- **Engine**: Piper (offline, neural voices)
- **Voice**: High-quality female voice
- **Chunking**: Smart sentence splitting for natural flow
- **Queue Management**: Cancellable speech queue

#### Supported Commands

**System Control**
- "Normalize system" - Reset volume, brightness, clean temp files
- "Kill [process name]" - Terminate a process
- "Open [app name]" - Launch application
- "Set volume to [0-100]" - Adjust system volume
- "Set brightness to [0-100]" - Adjust screen brightness

**Information Queries**
- "What's my CPU usage?"
- "How much RAM is available?"
- "Show network speed"
- "List top processes"

**Confirmation Flow**
- Dangerous commands require verbal "yes" or "no"
- Pending commands stored in state
- Timeout after 30 seconds

---

### 4. LLM Chat Interface

#### Multi-Provider Support
- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **Groq**: Fast inference with Llama models
- **Ollama**: Local LLM hosting

#### Intent Classification
- **System Commands**: Routed to command executor
- **General Queries**: Sent to LLM
- **Hybrid**: LLM can invoke system actions

#### Chat Features
- **Session Management**: Multiple chat histories
- **Context Awareness**: Last 10 messages for continuity
- **Streaming Responses**: Real-time token generation
- **Voice Integration**: TTS for responses
- **History Persistence**: JSON storage per session

#### System Context
- **Real-Time Data**: LLM has access to current system state
- **Process Information**: Can query running processes
- **Security Alerts**: Aware of Guardian verdicts
- **Resource Metrics**: CPU, RAM, Network stats

---

### 5. Application Management

#### Discovery
- **Registry Scanning**: 
  - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
  - `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
- **Caching**: JSON cache for fast loading
- **Auto-Refresh**: Background scan every 24 hours

#### Features
- **Launch**: Execute applications directly
- **Uninstall**: Trigger native uninstaller
- **Search**: Filter by name or publisher
- **Icons**: Extract from executables (when available)

#### Cache Management
- **Location**: `fluffy_data/apps_cache.json`
- **Metadata**: Last scan timestamp, app count
- **Manual Refresh**: Force re-scan via UI
- **Cross-Platform**: Registry scan (Windows) / `.desktop` file scan (Linux)

---

### 6. System Normalization (Enhanced)

One-click system optimization that:

**Volume Control**
- Sets system volume to 50%
- Uses WScript (Windows) for compatibility

**Brightness Control**
- Sets screen brightness to 70%
- Uses WMI (Windows) for hardware access

**Cache & Disk Cleanup**
- Purges system temp directories (`%TEMP%` / `/tmp/`)
- Cleans browser caches (Chrome, Firefox, Edge)
- Removes package manager caches
- Frees disk space

**RAM Optimization**
- Identifies unused services consuming memory
- Suggests services that can be stopped

**Security Scan**
- Lists unusual processes (Threat Score > 0)
- Provides recommendations

---

### 7. Memory System (NEW)

Fluffy now features an intelligent **dual-layer memory system** that enables persistent preferences and conversational intelligence.

#### Long-Term Memory
- **Storage**: `fluffy_data/memory/long_term.json`
- **Persistence**: Survives application restarts
- **Thread-Safe**: Atomic writes with automatic backups
- **Structure**:
  - **User Profile**: Name, location
  - **Preferences**: Theme, voice speed, alert threshold
  - **System Preferences**: Trusted processes, ignored processes, pinned processes

#### Session Memory
- **Scope**: Runtime-only (resets on restart)
- **Purpose**: Multi-step conversations and context tracking
- **Features**:
  - Pending intent tracking (multi-turn actions)
  - Parameter collection across conversations
  - Conversation history (last 5 exchanges)
  - Action context (last search, last killed process, etc.)

#### Trusted Processes
- **Persistence**: Trusted processes saved permanently
- **Guardian Integration**: Skips analysis for trusted processes
- **Management**: Add/remove via UI or API
- **Use Case**: Whitelist known-safe applications

#### API Endpoints
- `GET /memory` - Retrieve full memory
- `POST /memory` - Update memory
- `GET /memory/preferences` - Get user preferences
- `POST /memory/preferences` - Set preference
- `GET /memory/trusted_processes` - List trusted processes
- `POST /memory/trusted_processes` - Add trusted process
- `DELETE /memory/trusted_processes` - Remove trusted process
- `GET /session/status` - Get pending intents/context
- `POST /session/reset` - Reset session memory

---

### 8. Interrupt Commands (NEW)

Users can now **cancel pending actions** with natural interrupt commands.

#### Supported Keywords
- `stop`, `cancel`, `abort`
- `quit`, `exit`
- `mute`, `quiet`, `shut up`
- `never mind`, `forget it`

#### What Gets Cancelled
1. **Voice Output**: Stops TTS immediately
2. **Pending Intents**: Clears multi-step actions
3. **Confirmations**: Removes pending command confirmations
4. **Notifications**: Adds cancellation notice to UI

#### API Endpoints
- `POST /interrupt` - Execute interrupt (cancel all)
- `POST /interrupt/check` - Check if text is interrupt
- `GET /cancellable_actions` - List cancellable actions

#### Use Cases
- Stop unwanted voice feedback
- Cancel accidental commands
- Abort multi-step flows
- Emergency stop for all actions

---

## How It Works

### Startup Sequence

1. **Core Launch** (`cargo run` in `/core`)
   - Initialize sysinfo monitoring
   - Start ETW network monitor (requires admin)
   - Open IPC server on port 9001
   - Open command server on port 9002
   - Auto-spawn Brain and UI

2. **Brain Launch** (`python listener.py` in `/brain`)
   - Connect to Core IPC (port 9001)
   - Initialize Guardian modules
   - Load baselines and memory
   - Start Flask API on port 5123
   - Begin background app scanner

3. **UI Launch** (`npm run tauri dev` in `/ui/tauri`)
   - Build Vite frontend
   - Launch Tauri window
   - Connect to Brain API
   - Signal UI_ACTIVE to Brain
   - Start polling for status

### Data Flow

#### Telemetry Pipeline
```
Core (Rust)
  ↓ Collect system metrics (sysinfo)
  ↓ Gather process list with hierarchy
  ↓ Read network stats (ETW)
  ↓ Scan registry for startup apps
  ↓ Serialize to JSON
  ↓ Broadcast via IPC (port 9001)
  ↓
Brain (Python)
  ↓ Receive telemetry message
  ↓ Compute signals (pressure, offenders)
  ↓ Run Security Monitor
  ↓ Execute Guardian pipeline:
  ↓   - Track fingerprints
  ↓   - Detect anomalies
  ↓   - Update baselines
  ↓   - Score risk
  ↓   - Generate verdicts
  ↓ Compute health status
  ↓ Update state
  ↓ Store in LATEST_STATE
  ↓
UI (TypeScript)
  ↓ Poll /status endpoint (2s interval)
  ↓ Parse JSON response
  ↓ Update dashboard components
  ↓ Render charts and tables
  ↓ Display alerts and notifications
```

#### Command Execution
```
UI (User Action)
  ↓ User clicks "Kill Process"
  ↓ POST /command with token
  ↓
Brain (Python)
  ↓ Validate token
  ↓ Check confirmation requirements
  ↓ Add to pending confirmations (if needed)
  ↓ OR send to Core immediately
  ↓ Connect to port 9002
  ↓ Send JSON command
  ↓
Core (Rust)
  ↓ Receive command
  ↓ Validate safety policy
  ↓ Execute action (kill, normalize, etc.)
  ↓ Send result back to Brain
  ↓
Brain (Python)
  ↓ Receive execution result
  ↓ Add notification to state
  ↓ Log to execution logs
  ↓
UI (TypeScript)
  ↓ Next /status poll includes notification
  ↓ Display toast message
  ↓ Update process list
```

### Security Analysis Pipeline

The Guardian engine runs on every telemetry update:

1. **Fingerprint Tracking** (`fingerprint.py`)
   - Create or update process fingerprint
   - Track CPU, RAM, children, network over time
   - Store in memory (PID-based)

2. **Baseline Retrieval** (`baseline.py`)
   - Load historical baseline for process name
   - If new process, create initial baseline
   - Use EMA for slow adaptation

3. **Anomaly Detection** (`anomaly.py`)
   - Compare current metrics to baseline
   - Detect deviations (CPU spike, RAM growth, etc.)
   - Flag suspicious paths and behaviors

4. **Chain Tracking** (`chain.py`)
   - Monitor process parent-child relationships
   - Detect rapid spawning chains
   - Apply multiplier to risk score

5. **Risk Scoring** (`scorer.py`)
   - Aggregate anomaly scores
   - Apply chain multiplier
   - Classify into safety levels

6. **Verdict Generation** (`verdict.py`)
   - Generate human-readable alerts
   - Determine action (ignore, warn, confirm, block)
   - Trigger voice alerts if enabled

7. **State Update** (`state.py`)
   - Update global Guardian state
   - Set system mode (NORMAL, ALERT, DEFENSIVE, CRITICAL)
   - Store verdicts for UI display

8. **Audit Logging** (`audit.py`)
   - Record all events and user decisions
   - Timestamp and context for forensics
   - Persistent storage

---

## Future Aspects

### Planned Enhancements

#### 1. Cross-Platform Support
- **Linux**: ✅ Implemented — Platform abstraction layer, Linux process management, `.desktop` app discovery
- **macOS**: Adapt to Activity Monitor APIs (planned)
- **Mobile**: React Native companion app (planned)

#### 2. Advanced Analytics
- **Trend Analysis**: Long-term resource usage patterns
- **Predictive Alerts**: ML-based failure prediction
- **Performance Profiling**: Bottleneck identification

#### 3. Network Security
- **Firewall Integration**: Block suspicious connections
- **DNS Monitoring**: Detect malicious domains
- **Packet Inspection**: Deep packet analysis

#### 4. Cloud Sync (Optional)
- **Encrypted Backups**: Guardian baselines to cloud
- **Multi-Device**: Sync settings across machines
- **Privacy-First**: End-to-end encryption

#### 5. Plugin System
- **Custom Modules**: User-defined monitors
- **API Extensions**: Third-party integrations
- **Scripting**: Python/Lua automation

#### 6. Enhanced LLM Features
- **RAG Integration**: Document-based knowledge
- **Function Calling**: Direct system control
- **Multi-Modal**: Image and voice input

### Scalability Considerations

#### Performance Optimization
- **Lazy Loading**: Load UI components on demand
- **Data Compression**: Reduce IPC payload size
- **Caching**: Minimize redundant computations

#### Resource Management
- **Adaptive Polling**: Reduce frequency when idle
- **Memory Limits**: Cap baseline storage size
- **Disk Cleanup**: Auto-purge old audit logs

#### Extensibility
- **Modular Architecture**: Easy to add new monitors
- **Plugin API**: Well-defined extension points
- **Configuration**: YAML/TOML for settings

---

## Technical Specifications

### System Requirements
- **OS**: Windows 10/11 (64-bit) or Linux (Kali, Debian, Ubuntu)
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 500MB for application + models
- **Network**: Optional (for LLM providers)

### Dependencies

**Core (Rust)**
- `sysinfo` - System metrics
- `serde` - JSON serialization
- `windows-sys` - Windows API bindings
- `ctrlc` - Signal handling

**Brain (Python)**
- `flask` - Web API
- `requests` - HTTP client (for LLM)
- Standard library (json, socket, threading)

**UI (Tauri/TypeScript)**
- `@tauri-apps/api` - Native bindings
- `vite` - Build tool
- `lucide` - Icon library

**Voice (Optional)**
- `piper-tts` - Text-to-speech
- `vosk` - Speech-to-text
- `pyaudio` - Audio I/O

### Security Model

**Authentication**
- Token-based API access (`X-Fluffy-Token`)
- Loopback-only connections (127.0.0.1)
- No external network exposure

**Data Privacy**
- All processing local
- No telemetry sent to cloud
- User data never leaves machine

**Permissions**
- Admin required for ETW network monitoring
- Standard user for all other features
- Explicit confirmation for destructive actions

---

## Troubleshooting

### Common Issues

**Core fails to start**
- Ensure Rust toolchain installed
- Check port 9001/9002 availability
- Run as administrator for ETW

**Brain disconnects**
- Verify Python 3.8+ installed
- Check Flask dependency
- Review listener.py logs

**UI shows "Initializing"**
- Wait for first telemetry broadcast (2s)
- Check Brain API on http://127.0.0.1:5123
- Verify token in request headers

**Guardian false positives**
- Allow 5-minute learning phase
- Trust known processes manually
- Reset baselines if needed

**Voice not working**
- Install Piper TTS model
- Download Vosk model
- Check audio device permissions

---

## Conclusion

Fluffy Integrated Assistant System represents a new paradigm in system monitoring: **intelligent, privacy-preserving, and user-friendly**. By combining cutting-edge technologies (Rust, Python, Tauri, LLMs) with thoughtful UX design, it empowers users to understand and control their systems like never before.

The Guardian behavioral engine, in particular, demonstrates the potential of **signature-less threat detection** through machine learning and statistical analysis. As the system learns your unique usage patterns, it becomes increasingly accurate at identifying genuine threats while minimizing false positives.

Whether you're a power user seeking granular control, a developer monitoring resource usage, or a security-conscious individual protecting your privacy, Fluffy Assistant adapts to your needs.

**Welcome to the future of system monitoring. Welcome to Fluffy.** 🐰
