# Fluffy Integrated Assistant System - Code Block Explanations

## Introduction

This document provides detailed, line-by-line explanations of key code blocks throughout the Fluffy Assistant codebase. Each section explains the purpose, logic, data structures, and integration points of major modules.

---

## Table of Contents

1. [Core Service (Rust)](#core-service-rust)
   - [main.rs - Main Loop](#mainrs---main-loop)
   - [ETW Network Monitoring](#etw-network-monitoring)
   - [IPC Communication](#ipc-communication)
2. [Brain Service (Python)](#brain-service-python)
   - [listener.py - Event Loop](#listenerpy---event-loop)
   - [web_api.py - Flask API](#web_apipy---flask-api)
   - [Guardian Engine](#guardian-engine)
   - [Command Processing](#command-processing)
3. [AI Module (Python)](#ai-module-python)
   - [LLM Service](#llm-service)
   - [Intent Classification](#intent-classification)
4. [UI Layer (TypeScript)](#ui-layer-typescript)

---

## Core Service (Rust)

### main.rs - Main Loop

**Purpose**: The heart of the monitoring engine. Collects system telemetry and broadcasts it via IPC.

#### Key Data Structures

```rust
struct ProcessInfo {
    pid: u32,
    parent_pid: Option<u32>,
    name: String,
    exe_path: String,
    ram_mb: u64,
    cpu_percent: f32,
    disk_read_kb: u64,
    disk_written_kb: u64,
    net_received: f32,  // KB/s from ETW
    net_sent: f32,      // KB/s from ETW
}
```

**Explanation**: Represents a single process with all monitored metrics. The `parent_pid` enables tree visualization in the UI.

#### Main Function Breakdown

```rust
fn main() {
    let ipc = IpcServer::start(9001);        // Line 367
    start_command_server(9002);              // Line 368
    NetworkMonitor::start();                 // Line 371
    spawn_listener();                        // Line 374
    spawn_ui();                              // Line 376
```

**Line-by-Line**:
- **367**: Creates TCP server on port 9001 for broadcasting telemetry
- **368**: Starts command receiver on port 9002 (separate thread)
- **371**: Initializes ETW (Event Tracing for Windows) network monitor
- **374**: Auto-launches Python Brain in separate process
- **376**: Auto-launches Tauri UI via `npm run tauri dev`

#### Telemetry Collection Loop

```rust
while running.load(Ordering::SeqCst) {
    if IS_UI_ACTIVE.load(Ordering::SeqCst) {  // Line 392
        system.refresh_memory();               // Line 393
        system.refresh_cpu_all();              // Line 394
        system.refresh_processes(...);         // Line 395
        networks.refresh(true);                // Line 396
```

**Logic**:
- **392**: Only collect data when UI is active (saves resources)
- **393-396**: Refresh system metrics using `sysinfo` crate
- Processes are collected with full hierarchy (`ProcessesToUpdate::All`)

#### CPU Smoothing

```rust
let old_cpu = cpu_history.get(&pid_u32).cloned().unwrap_or(cpu);
let smoothed = (cpu * 0.7) + (old_cpu * 0.3);  // Line 268
cpu_history.insert(pid_u32, smoothed);
```

**Purpose**: Prevents jittery CPU readings in UI
**Algorithm**: 70% new value, 30% old value (Exponential Moving Average)
**Result**: Stable, readable CPU percentages

#### Network Stats Integration

```rust
if let Some(entry) = etw::NETWORK_DELTAS.get(&pid_u32) {
    tx_kbps = (entry.0 as f32 / 1024.0) / 2.0;  // Line 280
    rx_kbps = (entry.1 as f32 / 1024.0) / 2.0;  // Line 281
}
if let Some(mut entry) = etw::NETWORK_DELTAS.get_mut(&pid_u32) {
    *entry = (0, 0);  // Reset after reading (Line 289)
}
```

**Explanation**:
- ETW monitor populates `NETWORK_DELTAS` map with bytes sent/received per PID
- Convert bytes to KB, divide by 2-second interval to get KB/s
- Reset to zero after reading (prevents cumulative counting)

#### Message Broadcasting

```rust
let message = FluffyMessage {
    schema_version: "1.0",
    timestamp: unix_timestamp(),
    system: SystemStats { ram, cpu, network, processes },
    persistence: get_startup_entries(),  // Registry scan
    active_sessions: 1,
};
ipc.broadcast(&IpcMessage { ... });  // Line 474
```

**Flow**: Serialize entire system state to JSON and broadcast to all connected clients (Brain)

---

### ETW Network Monitoring

**File**: `etw.rs`

**Purpose**: Track network usage per process using Windows Event Tracing

#### Global State

```rust
pub static NETWORK_DELTAS: Lazy<DashMap<u32, (u64, u64)>> = 
    Lazy::new(|| DashMap::new());
```

**Explanation**: Thread-safe hashmap storing (bytes_sent, bytes_received) per PID

#### ETW Session

```rust
impl NetworkMonitor {
    pub fn start() {
        thread::spawn(|| {
            // Create ETW session
            // Subscribe to Microsoft-Windows-TCPIP provider
            // Parse events for PID and byte counts
            // Update NETWORK_DELTAS map
        });
    }
}
```

**Note**: Requires administrator privileges. Falls back gracefully if unavailable.

---

### IPC Communication

**File**: `ipc/server.rs`

#### Broadcast Mechanism

```rust
pub fn broadcast(&self, message: &IpcMessage) {
    let json = serde_json::to_string(message).unwrap();
    let mut clients = self.clients.lock().unwrap();
    
    clients.retain(|client| {
        client.write_all(json.as_bytes()).is_ok() &&
        client.write_all(b"\n").is_ok()
    });
}
```

**Logic**:
- Serialize message to JSON
- Send to all connected clients
- Remove disconnected clients (retain pattern)
- Newline-delimited JSON for easy parsing

---

## Brain Service (Python)

### listener.py - Event Loop

**Purpose**: Receives telemetry from Core, processes it through Guardian, and updates state

#### IPC Connection

```python
def connect_ipc():
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect((IPC_HOST, IPC_PORT))  # Line 61
            s.settimeout(1.0)
            return s
        except (ConnectionRefusedError, TimeoutError):
            time.sleep(0.5)  # Retry until Core is ready
```

**Explanation**: Blocks until Core is available, then maintains persistent connection

#### Message Handling

```python
def handle_message(raw_msg, monitor):
    if not state.UI_ACTIVE:  # Line 195
        security_alerts = monitor.analyze(raw_msg, state.UI_ACTIVE)
        state.update_security_alerts(security_alerts)
        return  # Skip heavy processing when UI is closed
```

**Optimization**: Security monitor always runs, but full Guardian pipeline only when UI is active

#### Signal Computation

```python
def compute_signals(msg):
    ram = msg.get("system", {}).get("ram", {})
    if ram and ram.get("total_mb", 0) > 0:
        usage = (ram["used_mb"] / ram["total_mb"]) * 100  # Line 112
        if usage < 60:
            signals["memory_pressure"] = "LOW"
        elif usage < 75:
            signals["memory_pressure"] = "MEDIUM"
        elif usage < 90:
            signals["memory_pressure"] = "HIGH"
        else:
            signals["memory_pressure"] = "CRITICAL"
```

**Purpose**: Convert raw metrics into semantic signals for health computation

#### Guardian Pipeline

```python
for p in processes:
    # 1. Track fingerprint
    fp = GUARDIAN_FINGERPRINTS.track(pid, name, cpu, ram, ...)  # Line 235
    
    # 2. Get baseline
    baseline = GUARDIAN_BASELINE.get_baseline(name)  # Line 238
    
    # 3. Detect anomalies
    anomalies = GUARDIAN_DETECTOR.analyze(fp, baseline)  # Line 241
    
    # 4. Track chains
    chain_multiplier = GUARDIAN_CHAINS.update(pid, name, anomalies)  # Line 244
    
    # 5. Score risk
    risk_score = GUARDIAN_SCORER.score(name, pid, anomalies) * chain_multiplier  # Line 247
    
    # 6. Generate verdicts
    if not is_learning:
        verdicts = generate_verdicts(name, pid, risk_score, anomalies, level, 0.8)
```

**Flow**: Six-stage pipeline processes each process every 2 seconds

---

### web_api.py - Flask API

**Purpose**: Exposes HTTP endpoints for UI communication

#### Security Middleware

```python
@app.route("/command", methods=["POST"])
def command():
    if request.remote_addr not in ("127.0.0.1", "::1"):  # Line 67
        return jsonify({"error": "Forbidden - Loopback execution only"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:  # Line 72
        return jsonify({"error": "Unauthorized - Invalid token"}), 401
```

**Security**:
- **Line 67**: Only accept requests from localhost
- **Line 72**: Validate hardcoded token (dev environment)

#### Status Endpoint

```python
@app.route("/status")
def status():
    with state.LOCK:  # Line 43
        if state.LATEST_STATE is None:
            return jsonify({"status": "initializing"})
        full_state = state.LATEST_STATE.copy()
    
    full_state["pending_confirmations"] = state.get_confirmations()  # Line 48
    full_state["security_alerts"] = state.SECURITY_ALERTS
    full_state["notifications"] = state.get_notifications()
    return jsonify(full_state)
```

**Logic**:
- **Line 43**: Thread-safe access to shared state
- **Line 48**: Inject additional UI-specific data
- Returns complete system snapshot

#### Chat Message Processing

```python
@app.route("/chat/message", methods=["POST"])
def chat_message():
    from ai.src.llm_service import get_service
    
    # Load chat history for context
    if session_id:
        session_data = history_manager.load_session(session_id)
        for msg in session_data["messages"][-10:]:  # Last 10 messages
            context_messages.append({"role": role, "content": content})
    
    # Process through LLM service
    result = llm_service.process_message(user_message, context_messages)
    
    if result["type"] == "command":
        # Local command execution
        return jsonify({"type": "command", "message": response_text})
    else:
        # Stream LLM response
        def generate():
            for chunk in result["stream"]:
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        return Response(generate(), mimetype="text/event-stream")
```

**Hybrid Approach**: Commands execute locally, queries stream from LLM

---

### Guardian Engine

#### baseline.py - Behavioral Baseline Engine

**Purpose**: Learn and store "normal" behavior for each process

##### Data Structure

```python
self.baselines[process_name] = {
    "avg_cpu": float(cpu),
    "peak_cpu": float(cpu),
    "avg_ram": float(ram),
    "peak_ram": float(ram),
    "ram_growth_rate": 0.0,
    "avg_children": float(child_count),
    "child_spawn_rate": 0.0,
    "avg_net_sent": float(net_sent),
    "avg_net_received": float(net_received),
    "avg_lifespan": float(lifespan),
    "samples": 1,
    "first_seen": time.time(),
    "last_seen": time.time(),
    "restart_count": 0,
    "trusted": False
}
```

**Explanation**: Comprehensive behavioral profile per process name (not PID)

##### EMA Update

```python
def update(self, process_name, cpu, ram, child_count, ...):
    b["avg_cpu"] = (self.alpha * cpu) + ((1 - self.alpha) * b["avg_cpu"])  # Line 80
    b["peak_cpu"] = max(b["peak_cpu"], cpu)  # Line 81
    
    old_ram = b["avg_ram"]
    b["avg_ram"] = (self.alpha * ram) + ((1 - self.alpha) * b["avg_ram"])  # Line 85
    
    current_growth = ram - old_ram
    b["ram_growth_rate"] = (self.alpha * current_growth) + ((1 - self.alpha) * b["ram_growth_rate"])  # Line 90
```

**Algorithm**:
- **Line 80**: Exponential Moving Average with α=0.01 (very slow adaptation)
- **Line 81**: Track peak values separately
- **Line 90**: Growth rate is also smoothed (prevents spike false positives)

##### Learning Phase

```python
def get_learning_progress(self):
    first_run = self.baselines.get("_metadata", {}).get("system_first_run", time.time())
    elapsed = time.time() - first_run
    return min(100, int((elapsed / 300) * 100))  # 300 seconds = 5 minutes
```

**Purpose**: Returns 0-100% progress through 5-minute learning phase

---

#### anomaly.py - Anomaly Detection

**Purpose**: Compare current behavior to baseline and flag deviations

##### CPU Spike Detection

```python
def analyze(self, fingerprint, baseline):
    anomalies = []
    
    if baseline:
        # CPU Spike
        if fp.cpu > baseline["avg_cpu"] * 3:  # 3x threshold
            anomalies.append({
                "type": "CPU_SPIKE",
                "severity": "HIGH",
                "current": fp.cpu,
                "baseline": baseline["avg_cpu"]
            })
```

**Logic**: Flag if current CPU is 3x the learned average

##### RAM Growth Detection

```python
        # RAM Growth
        if fp.ram > baseline["peak_ram"] * 1.5:  # 50% above peak
            anomalies.append({
                "type": "RAM_GROWTH",
                "severity": "MEDIUM",
                "current": fp.ram,
                "baseline": baseline["peak_ram"]
            })
```

**Logic**: Flag if RAM exceeds 150% of historical peak

##### Path Integrity

```python
        # Suspicious Path
        if "\\temp\\" in fp.exe_path.lower() or "\\appdata\\local\\temp\\" in fp.exe_path.lower():
            anomalies.append({
                "type": "SUSPICIOUS_PATH",
                "severity": "CRITICAL",
                "path": fp.exe_path
            })
```

**Logic**: Execution from temp directories is highly suspicious

---

#### scorer.py - Risk Scoring

**Purpose**: Aggregate anomalies into a single risk score

```python
def score(self, process_name, pid, anomalies):
    score = 0
    
    for anomaly in anomalies:
        if anomaly["type"] == "SUSPICIOUS_PATH":
            score += 30
        elif anomaly["type"] == "CPU_SPIKE":
            score += 20
        elif anomaly["type"] == "RAM_GROWTH":
            score += 15
        elif anomaly["type"] == "CHILD_SPAWN":
            score += 25
        elif anomaly["type"] == "PERSISTENCE":
            score += 40
    
    return score
```

**Weights**: Persistence (40) > Path (30) > Child Spawn (25) > CPU (20) > RAM (15)

##### Safety Levels

```python
def get_level(self, score):
    if score >= 80:
        return "Critical"
    elif score >= 60:
        return "Request Confirmation"
    elif score >= 30:
        return "Suspicious"
    else:
        return "Safe"
```

**Thresholds**: Designed to minimize false positives while catching real threats

---

#### verdict.py - Alert Generation

**Purpose**: Convert risk scores into human-readable alerts

```python
def generate_verdicts(process_name, pid, risk_score, anomalies, level, confidence):
    verdicts = []
    
    if level in ["Request Confirmation", "Critical"]:
        reason = f"{process_name} exhibits {len(anomalies)} suspicious behaviors"
        
        explanation = "Detected: " + ", ".join([a["type"] for a in anomalies])
        
        verdicts.append({
            "process": process_name,
            "pid": pid,
            "level": level,
            "reason": reason,
            "explanation": explanation,
            "confidence": confidence,
            "timestamp": time.time()
        })
    
    return verdicts
```

**Output**: Structured alerts ready for UI display and voice synthesis

---

### Command Processing

#### command_parser.py - Natural Language Parsing

**Purpose**: Convert voice commands into structured Command objects

##### Pattern Matching

```python
PATTERNS = {
    Intent.OPEN_APP: [
        r"(?:open|launch|start|run)\s+(.+)",
    ],
    Intent.KILL_PROCESS: [
        r"(?:kill|end|terminate)\s+(?:process\s+|task\s+)?(.+)",
    ],
    Intent.CREATE_FILE: [
        r"create\s+(?:a\s+)?file\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|at|on|to)\s+(.+)",
        r"create\s+(?:a\s+)?file\s+(?:called\s+|named\s+)?(.+)",
    ],
}
```

**Approach**: Regex patterns ordered by specificity (most specific first)

##### Parsing Logic

```python
def parse(self, text: str) -> Command:
    text = text.strip().lower()
    
    for intent, patterns in self.PATTERNS.items():
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                parameters = self._extract_parameters(intent, match, text)
                return Command(intent, parameters, text)
    
    return Command(Intent.UNKNOWN, {}, text)
```

**Flow**: Try each pattern until match found, extract parameters, return Command

##### Path Resolution

```python
def _resolve_path(self, location: str, filename: str) -> Path:
    location_lower = location.lower()
    
    if location_lower in self.FOLDER_ALIASES:  # "documents" -> "Documents"
        folder_name = self.FOLDER_ALIASES[location_lower]
        return self.home / folder_name / filename
    
    if os.path.isabs(location):  # Absolute path
        return Path(location) / filename
    
    return self.home / "Documents" / filename  # Default
```

**Logic**: Handle common folder names, absolute paths, and defaults

---

#### command_executor.py - Action Execution

**Purpose**: Execute parsed commands with safety checks

```python
def execute(self, command: Command, validation: ValidationResult):
    if not validation.is_valid:
        return {"success": False, "message": validation.message}
    
    if command.intent == Intent.OPEN_APP:
        return self._open_app(command.parameters["app_name"])
    elif command.intent == Intent.KILL_PROCESS:
        return self._kill_process(command.parameters["process_name"])
    # ... other intents
```

**Pattern**: Dispatch to specific handler based on intent

---

## AI Module (Python)

### LLM Service

**File**: `ai/src/llm_service.py`

**Purpose**: Orchestrate intent classification, command execution, and LLM queries

#### Message Processing

```python
def process_message(self, user_message: str, context_messages: Optional[List[Dict[str, str]]] = None):
    # Classify intent
    classification = self.classifier.classify(user_message)
    
    if classification.intent_type == IntentType.LOCAL_COMMAND:
        return self._execute_command(user_message, classification)
    else:
        return self._query_llm(user_message, context_messages)
```

**Decision**: Route to local executor or LLM based on intent classification

#### LLM Query

```python
def _query_llm(self, user_message: str, context_messages: Optional[List[Dict[str, str]]] = None):
    messages = []
    
    # System prompt
    messages.append({"role": "system", "content": self.system_prompt})
    
    # Conversation history (last 10 messages)
    if context_messages:
        for msg in context_messages:
            messages.append({"role": msg["role"], "content": msg["content"]})
    
    # Current message
    messages.append({"role": "user", "content": user_message})
    
    # Get streaming response
    stream = self.llm_client.chat(messages)
    
    return {"type": "llm", "stream": stream}
```

**Context Window**: Last 10 messages for continuity, system prompt for personality

---

### Intent Classification

**File**: `ai/src/intent_classifier.py`

**Purpose**: Determine if input is a command or a general query

```python
class IntentClassifier:
    def classify(self, user_input: str) -> IntentClassification:
        # Try command parser first
        command = self.command_parser.parse(user_input)
        
        if command.intent != Intent.UNKNOWN:
            return IntentClassification(
                intent_type=IntentType.LOCAL_COMMAND,
                confidence=0.9,
                parsed_command=command
            )
        
        # Check for question patterns
        if self._is_question(user_input):
            return IntentClassification(
                intent_type=IntentType.GENERAL_QUERY,
                confidence=0.8
            )
        
        # Default to general query
        return IntentClassification(
            intent_type=IntentType.GENERAL_QUERY,
            confidence=0.5
        )
```

**Heuristics**: Command parser first, then question detection, default to query

---

## UI Layer (TypeScript)

### Main Application Logic

**File**: `ui/tauri/src/main.ts`

#### Status Polling

```typescript
async function pollStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`, {
            headers: { 'X-Fluffy-Token': TOKEN }
        });
        
        const data = await response.json();
        
        updateDashboard(data);
        updateProcessTree(data.system.processes.top_ram);
        updateGuardianAlerts(data._guardian_verdicts);
        updateNotifications(data.notifications);
        
    } catch (error) {
        console.error('Status poll failed:', error);
    }
}

setInterval(pollStatus, 2000);  // Poll every 2 seconds
```

**Pattern**: Continuous polling with 2-second interval, update all UI components

#### Command Execution

```typescript
async function killProcess(pid: number) {
    const response = await fetch(`${API_BASE}/command`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Fluffy-Token': TOKEN
        },
        body: JSON.stringify({
            "KillProcess": { pid: pid }
        })
    });
    
    if (response.ok) {
        showToast('Process terminated successfully', 'success');
    }
}
```

**Flow**: POST command to Brain, Brain forwards to Core, result displayed via toast

---

## Memory System (NEW)

### long_term_memory.py - Persistent Memory Manager

**Purpose**: Store user preferences and system settings that persist across restarts

#### Data Structure

```python
MEMORY_SCHEMA = {
    "user_profile": {
        "identity": {
            "name": {"value": None},
            "location": {"value": None}
        },
        "preferences": {
            "theme": {"value": "dark"},
            "voice_speed": {"value": 1.0},
            "auto_normalize": {"value": False},
            "alert_threshold": {"value": 60}
        },
        "system_preferences": {
            "trusted_processes": {"value": []},
            "ignored_processes": {"value": []},
            "pinned_processes": {"value": []}
        }
    },
    "metadata": {
        "created_at": str,
        "last_updated": str,
        "version": "1.0"
    }
}
```

**Explanation**: Nested structure for user profile, preferences, and metadata

#### Atomic Writes with Backup

```python
def save_memory(memory: dict):
    with _lock:  # Thread-safe
        temp_path = MEMORY_PATH.with_suffix('.tmp')
        backup_path = MEMORY_PATH.with_suffix('.bak')
        
        # Write to temp file first
        with open(temp_path, 'w') as f:
            json.dump(memory, f, indent=2)
        
        # Backup existing file
        if MEMORY_PATH.exists():
            MEMORY_PATH.replace(backup_path)
        
        # Move temp to main (atomic on most filesystems)
        temp_path.replace(MEMORY_PATH)
```

**Safety**: Prevents data loss if write fails mid-operation

#### Helper Functions

```python
def add_trusted_process(process_name: str):
    memory = load_memory()
    trusted = memory["user_profile"]["system_preferences"]["trusted_processes"]["value"]
    
    if process_name not in trusted:
        trusted.append(process_name)
        save_memory(memory)
        print(f"✅ Added {process_name} to trusted processes")
```

**Convenience**: High-level functions for common operations

---

### session_memory.py - Runtime Memory Manager

**Purpose**: Track multi-step conversations and pending actions (resets on restart)

#### SessionMemory Class

```python
class SessionMemory:
    def __init__(self):
        self.pending_intent = None
        self.parameters = {}
        self.current_question = None
        self.conversation_history = []  # Last 5 exchanges
        self.action_context = {
            "last_search": None,
            "last_killed_process": None,
            "last_trusted_process": None,
            "last_guardian_action": None,
            "last_normalized_scope": None
        }
```

**Structure**: Tracks state for conversational flows

#### Multi-Step Intent Tracking

```python
def set_pending_intent(self, intent: str):
    self.pending_intent = intent
    self.parameters = {}
    self.current_question = None
    print(f"🔄 Pending intent set: {intent}")

def update_parameters(self, params: dict):
    self.parameters.update(params)
    for key, value in params.items():
        print(f"📝 Parameter updated: {key} = {value}")
```

**Use Case**: Collect parameters across multiple conversation turns

#### Conversation History

```python
def add_exchange(self, user_message: str, assistant_response: str):
    self.conversation_history.append({
        "user": user_message,
        "assistant": assistant_response,
        "timestamp": time.time()
    })
    
    # Keep only last 5 exchanges
    if len(self.conversation_history) > 5:
        self.conversation_history.pop(0)
```

**Purpose**: Provide context for LLM without overwhelming token budget

---

### intent_handler.py - Multi-Step Intent Orchestrator

**Purpose**: Handle conversational flows that require multiple turns

#### Intent Requirements

```python
INTENT_REQUIREMENTS = {
    "kill_process": {
        "required": ["pid"],
        "optional": [],
        "confirmation_required": True
    },
    "trust_process": {
        "required": ["process_name", "confirm"],
        "optional": [],
        "confirmation_required": True
    },
    "normalize_system": {
        "required": ["scope"],
        "optional": [],
        "confirmation_required": False
    }
}
```

**Definition**: Each intent specifies required parameters and confirmation needs

#### Parameter Collection

```python
def handle_multi_step_intent(intent: str, current_params: dict, user_message: str) -> dict:
    requirements = INTENT_REQUIREMENTS.get(intent, {})
    required_params = requirements.get("required", [])
    
    # Check what's missing
    missing_params = [p for p in required_params if p not in current_params]
    
    if missing_params:
        # Ask for next missing parameter
        question = generate_clarification_question(intent, missing_params[0])
        return {
            "status": "needs_clarification",
            "question": question,
            "missing_param": missing_params[0]
        }
    else:
        # All parameters collected, ready to execute
        return {
            "status": "ready",
            "intent": intent,
            "parameters": current_params
        }
```

**Flow**: Check missing params → Ask clarification → Collect → Execute

#### Clarification Questions

```python
def generate_clarification_question(intent: str, param: str) -> str:
    questions = {
        "kill_process": {
            "pid": "Which process would you like to kill? Please provide the PID or process name."
        },
        "trust_process": {
            "process_name": "Which process would you like to trust?",
            "confirm": "Are you sure you want to trust this process? (yes/no)"
        },
        "normalize_system": {
            "scope": "What would you like to normalize? (all/volume/brightness/cleanup)"
        }
    }
    
    return questions.get(intent, {}).get(param, f"Please provide {param}")
```

**Natural**: Human-friendly questions for each parameter

---

## Interrupt Handler (NEW)

### interrupt_handler.py - Action Cancellation

**Purpose**: Allow users to stop pending actions with natural commands

#### Interrupt Detection

```python
INTERRUPT_COMMANDS = [
    "stop", "cancel", "abort", "quit", "exit",
    "mute", "quiet", "shut up", "never mind", "forget it"
]

def is_interrupt_command(text: str) -> bool:
    if not text:
        return False
    
    text_lower = text.lower().strip()
    return any(cmd in text_lower for cmd in INTERRUPT_COMMANDS)
```

**Logic**: Check if user input contains any interrupt keyword

#### Multi-Action Cancellation

```python
def handle_interrupt() -> dict:
    actions_cancelled = []
    
    # 1. Stop TTS
    try:
        from voice import stop_speaking
        stop_speaking()
        actions_cancelled.append("voice_output")
    except Exception as e:
        print(f"⚠️ Could not stop TTS: {e}")
    
    # 2. Clear pending intents
    session = get_session_memory()
    if session.has_pending_intent():
        intent = session.get_pending_intent()
        actions_cancelled.append(f"pending_intent:{intent}")
        session.clear_pending_intent()
    
    # 3. Clear confirmations
    confirmations = state.get_confirmations()
    for conf in confirmations:
        state.remove_confirmation(conf.get("command_id"))
        actions_cancelled.append(f"confirmation:{conf.get('command_id')}")
    
    # 4. Add notification
    message = "Action cancelled" if actions_cancelled else "Nothing to cancel"
    state.NOTIFICATIONS.append({
        "type": "info",
        "message": message,
        "timestamp": time.time()
    })
    
    return {
        "interrupted": True,
        "message": message,
        "actions_cancelled": actions_cancelled
    }
```

**Comprehensive**: Stops all active and pending actions

#### Cancellable Actions Query

```python
def get_cancellable_actions() -> list:
    actions = []
    
    session = get_session_memory()
    if session.has_pending_intent():
        intent = session.get_pending_intent()
        params = session.get_parameters()
        actions.append({
            "type": "pending_intent",
            "intent": intent,
            "parameters": params,
            "description": f"Multi-step action: {intent}"
        })
    
    confirmations = state.get_confirmations()
    for conf in confirmations:
        actions.append({
            "type": "confirmation",
            "command_id": conf.get("command_id"),
            "description": conf.get("message", "Pending confirmation")
        })
    
    return actions
```

**UI Integration**: Frontend can query what's cancellable and show appropriate UI

---

## Conclusion

This code walkthrough demonstrates the sophisticated architecture of Fluffy Assistant:

- **Rust Core**: High-performance monitoring with minimal overhead
- **Python Brain**: Intelligent analysis with Guardian behavioral engine
- **Memory System**: Persistent preferences and conversational intelligence
- **Interrupt Handler**: User control over pending actions
- **TypeScript UI**: Modern, responsive interface with real-time updates
- **AI Integration**: Seamless LLM and voice command support

Each component is designed for modularity, testability, and extensibility. The clean separation of concerns enables independent development and easy feature additions.

**Key Takeaways**:
1. **Performance**: Rust for hot path, Python for intelligence
2. **Security**: Multi-layered (loopback-only, token auth, confirmation flow)
3. **Privacy**: 100% local processing, no cloud dependencies
4. **Intelligence**: Dual-layer memory for context-aware conversations
5. **User Control**: Interrupt commands for action cancellation
6. **Extensibility**: Plugin-ready architecture with clear interfaces

For questions or contributions, refer to the main README and architecture documentation.

