# Fluffy Production Agent Orchestration Architecture

## 1. Overview & Core Philosophy

The **Fluffy Agent Orchestration Engine** (`brain/agent/`) provides a deterministic, stateful, observable execution system for multi-step tasks. It decouples high-level task planning and step sequencing from model routing, model inference, tool execution, and privileged native operations.

### Key Architectural Principles

1. **Strict Subsystem Separation**:
   - **Agent**: Interprets goals, manages state, sequences steps, evaluates outcomes, and coordinates bounded recovery.
   - **Model Router**: Deterministically selects the optimal local model per step based on capabilities, context, and hardware.
   - **AI Runtime**: Manages model loading, inference execution, streaming, and lifecycle health.
   - **ActionValidator / Guardian**: Acts as the authoritative security boundary. The Agent never bypasses or duplicates security rules.
   - **Rust Capability Layer**: Executes privileged OS and hardware interactions natively via `RustCapabilityClient`.
2. **LLM Output is Untrusted Input**:
   - Plans, tool selections, parameters, and model outputs are strictly validated before execution.
3. **Task-Scoped State (No Global Singleton State)**:
   - State is encapsulated in isolated `AgentState` instances, preventing concurrency cross-talk and enabling task suspension/resumption.
4. **Transport-Neutral Event System**:
   - `EventEmitter` broadcasts structured lifecycle events without coupling to UI, WebSocket, or transport implementations.

---

## 2. End-to-End Orchestration Flow

```text
User Request
     ↓
IntentRouter (Fast-path for simple commands vs Agent Task)
     ↓
AgentOrchestrator.run(task, plan)
     ↓
AgentPlan Validation (Step Limits, DAG Cycle Detection)
     ↓
┌─────────────────────────────────────────────────────────────┐
│                      Execution Loop                         │
│                                                             │
│   1. Scheduler queries Ready Steps (dependencies satisfied) │
│   2. StepExecutor checks Security (ActionValidator)         │
│        ├── SAFE → Proceed to Step Dispatch                  │
│        ├── NEEDS_CONFIRMATION → WAITING_CONFIRMATION (Pause)│
│        └── BLOCKED → Security Error (Abort)                 │
│   3. Step Dispatch:                                         │
│        ├── "rust:*"  → RustCapabilityClient (TCP 9002 IPC)   │
│        ├── "model:*" → ModelRouter → AI Runtime             │
│        └── "tool:*"  → Local Tool Execution                 │
│   4. State Update & StepObservation Collection              │
│   5. Failure Recovery (Retry → Fallback → Replan → Abort)   │
│   6. Goal Evaluation (GoalEvaluator)                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
        [All Steps Done]             [Pending Steps]
                ▼                             ▼
         Task COMPLETED                 Next Iteration
```

---

## 3. Component Details

### 3.1 Task Model (`task.py`)
- **`AgentTask`**: Captures user request, goal, priority, constraints, context, and correlation IDs.
- **`TaskStatus`**: `CREATED`, `ANALYZING`, `PLANNING`, `READY`, `EXECUTING`, `WAITING_CONFIRMATION`, `WAITING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`.
- **State Machine**: Enforces a strict transition matrix; invalid transitions raise `ValueError`.

### 3.2 Step & Dependency Model (`step.py`, `plan.py`)
- **`PlanStep`**: Atomic action capturing objective, tool/model requirement, dependencies, input parameters, retry count, timeout, and status (`PENDING`, `READY`, `EXECUTING`, `WAITING_CONFIRMATION`, `COMPLETED`, `FAILED`, `SKIPPED`, `CANCELLED`).
- **`AgentPlan`**: DAG of steps with topological dependency resolution.
- **`PlanValidator`**: Enforces maximum step bounds, unique IDs, dependency existence, and cycle detection (Kahn's Algorithm).

### 3.3 Task-Scoped State (`state.py`)
- **`AgentState`**: Manages task progress, observations, blackboard variables (`set_variable`/`get_variable`), artifacts, and pending confirmation payloads. Fully serializable for future persistence and resumption.

### 3.4 Security & Step Execution (`execution.py`)
- **`StepExecutor`**:
  - Resolves `${var}` and `${step_id.output}` references from the state blackboard.
  - Passes mutating actions through `ActionValidator.validate()`.
  - Dispatches native capabilities to `RustCapabilityClient` (`Process.List`, `System.GetHardware`, `Filesystem.List`, etc.).
  - Dispatches reasoning steps to `ModelRouter` and `AIModelRuntime`.
  - Dispatches local actions to `CommandExecutor`.
  - Produces structured `StepObservation`.

### 3.5 Bounded Recovery (`recovery.py`)
- **`FailureClassifier`**: Categorizes errors into `TRANSIENT`, `RETRYABLE`, `INVALID_INPUT`, `SECURITY_DENIED`, `TOOL_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `TIMEOUT`, `RESOURCE_LIMIT`, `DEPENDENCY_FAILED`, `FATAL`.
- **`RecoveryManager`**: Prescribes bounded recovery actions:
  - `SECURITY_DENIED` → strictly `ABORT`.
  - `RETRYABLE` / `TIMEOUT` → `RETRY` while within `max_retries_per_step` and `max_total_retries`.
  - `MODEL_UNAVAILABLE` → `FALLBACK_MODEL`.
  - `TOOL_UNAVAILABLE` → `FALLBACK_TOOL`.
  - Limit exhaustion → `REPLAN` or `ABORT`.

### 3.6 Goal Evaluation (`evaluator.py`)
- **`GoalEvaluator`**: Evaluates plan state and observations deterministically to verify goal satisfaction.

### 3.7 Resource & Safety Bounds (`limits.py`)
- **`AgentLimits`**: Configurable execution bounds:
  - `max_plan_steps` (default 20)
  - `max_execution_depth` (default 5)
  - `max_retries_per_step` (default 3)
  - `max_total_retries` (default 10)
  - `step_timeout_sec` (default 30.0s)
  - `task_timeout_sec` (default 300.0s)
  - `max_tool_calls_total` (default 50)
  - `max_generated_output_tokens` (default 4096)

### 3.8 Transport-Neutral Event Telemetry (`events.py`)
- **`AgentEventType`**: Structured lifecycle event stream (`TASK_CREATED`, `PLAN_CREATED`, `STEP_STARTED`, `STEP_WAITING_CONFIRMATION`, `STEP_COMPLETED`, `STEP_FAILED`, `TASK_COMPLETED`, etc.).
- **`EventEmitter`**: Thread-safe publisher allowing pluggable UI and logging listeners.

---

## 4. Integration Examples

### 4.1 System Inspection & Model Summarization Flow

```python
from brain.agent import AgentTask, PlanStep, AgentPlan, AgentOrchestrator

# 1. Instantiate orchestrator
orchestrator = AgentOrchestrator()

# 2. Define task
task = AgentTask(
    user_request="Inspect hardware and generate summary",
    goal="Collect hardware data and summarize findings",
)

# 3. Construct dependency-linked plan
step1 = PlanStep(
    step_id="step_hw",
    objective="Query system hardware",
    tool_requirement="rust:System.GetHardware",
)
step2 = PlanStep(
    step_id="step_sum",
    objective="Summarize findings",
    dependencies=["step_hw"],
    model_requirement={"task_type": "general_chat"},
    input_parameters={"prompt": "Summarize hardware findings: ${step_hw.output}"},
)
plan = AgentPlan(task_id=task.task_id, goal=task.goal, steps=[step1, step2])

# 4. Execute
result = orchestrator.run(task, plan=plan)
print(f"Status: {result.status.value}, Summary: {result.summary}")
```

### 4.2 Security Confirmation & Resumption Flow

```python
# Dangerous action requiring confirmation
task = AgentTask(user_request="Terminate PID 999")
step = PlanStep(
    step_id="step_kill",
    objective="Kill process",
    tool_requirement="rust:Process.Terminate",
    input_parameters={"pid": 999},
)
plan = AgentPlan(task_id=task.task_id, goal=task.goal, steps=[step])

# Suspends in WAITING_CONFIRMATION
result = orchestrator.run(task, plan=plan)
if result.waiting_confirmation:
    print(f"Confirmation Required: {result.confirmation_message}")
    
    # Resume upon user confirmation
    final_result = orchestrator.resume(
        task_id=task.task_id,
        confirmed=True,
        confirmation_id=result.confirmation_id,
    )
    print(f"Final Status: {final_result.status.value}")
```

---

## 5. Verification Suite

The Agent Orchestration engine is validated with 35 tests in `tests/agent/`:

- `tests/agent/test_task.py`: Task creation, serialization, state transitions, illegal transition rejection.
- `tests/agent/test_plan.py`: Plan validation, step bounds, dependency validation, cycle detection.
- `tests/agent/test_state.py`: State isolation, blackboard variables, observation tracking.
- `tests/agent/test_scheduler.py`: Topological scheduling and dependency blocking.
- `tests/agent/test_execution.py`: StepExecutor, parameter interpolation, ActionValidator safety.
- `tests/agent/test_recovery.py`: Error classification, bounded retries, security aborts.
- `tests/agent/test_limits.py`: Resource limits and serialization.
- `tests/agent/test_events.py`: Event broadcasting and subscriber registration.
- `tests/agent/test_confirmation.py`: WAITING_CONFIRMATION suspension, approval resumption, rejection failure.
- `tests/agent/test_orchestrator.py`: End-to-end integration flows (System Inspection, Confirmation, Recovery, Cancellation, IntentRouter).
