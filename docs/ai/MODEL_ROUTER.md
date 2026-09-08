# Fluffy Model Router Architecture & Specification

## 1. Overview

The **Fluffy Model Router** (`brain/ai/router/`) is a production-grade, platform-independent, deterministic model selection engine. It analyzes task requirements, system hardware capabilities, inference backend availability, and runtime lifecycle health to select the optimal locally installed AI model for a given task.

### Core Design Principles

1. **100% Deterministic & Rule-Based**: The router executes zero LLM calls for routing decisions. Model routing is instant (< 5ms), reproducible, and free of hallucinations.
2. **Strict Hard Constraints vs. Soft Preferences**: Hard constraints (capabilities, context length, RAM/VRAM requirements, offline compliance, active backend) strictly filter out non-viable candidates. Soft preferences (preferred model, warm loaded cache, latency, quality, task specialization) rank the surviving viable candidates.
3. **No Overrides**: `preferred_model` is strictly a soft preference. It cannot override hard constraints (e.g., missing capabilities or memory deficits).
4. **Hardware & Platform Independence**: Compatible with Windows, Linux, and macOS across CPU, NVIDIA CUDA, Apple Silicon Metal, and AMD ROCm.
5. **Fallback Chain & Degradation Resilience**: Every decision includes an ordered fallback chain of surviving candidates. If a primary model fails runtime health checks, the router transparently falls back to the next best candidate.
6. **Full Explainability**: Every routing decision generates complete diagnostic metadata explaining winning scores, component breakdowns, and exact reasons for candidate rejections.

---

## 2. Architecture & Pipeline

```text
               RoutingRequest
                     │
                     ▼
          ┌──────────────────────┐
          │  ModelRegistry Query │
          └──────────┬───────────┘
                     │ (All Models)
                     ▼
        ┌───────────────────────────┐
        │    ConstraintEvaluator    │◄─── HardwareCapabilities
        │   (Hard Constraint Tier)  │◄─── BackendRegistry
        └────────────┬──────────────┘◄─── ModelLifecycleTracker
                     │
        ┌────────────┴────────────┐
        │                         │
  [Non-Viable]               [Viable]
        │                         │
        ▼                         ▼
┌───────────────┐     ┌───────────────────────┐
│Candidate      │     │    CandidateScorer    │◄─── RoutingPolicyProfile
│Rejection Logs │     │  (Multi-Factor Tier)  │◄─── RoutingWeights
└───────────────┘     └───────────┬───────────┘
                                  │
                                  ▼
                      ┌───────────────────────┐
                      │  Deterministic Sort   │
                      │  (Score Desc, Tie-Brk)│
                      └───────────┬───────────┘
                                  │
                                  ▼
                      ┌───────────────────────┐
                      │    RoutingDecision    │
                      │ ├── selected_model_id │
                      │ ├── selected_backend  │
                      │ ├── fallback_chain    │
                      │ └── explainability    │
                      └───────────┬───────────┘
                                  │
                                  ▼
                      ┌───────────────────────┐
                      │    AIModelRuntime     │
                      └───────────────────────┘
```

---

## 3. Component Details

### 3.1 Task Taxonomy & Routing Request (`request.py`)

- **`TaskType`**: `GENERAL_CHAT`, `TEXT_GENERATION`, `REASONING`, `CODE`, `VISION`, `DOCUMENT_ANALYSIS`, `EMBEDDING`, `CLASSIFICATION`, `SUMMARIZATION`, `STRUCTURED_OUTPUT`.
- **`RoutingRequest`**:
  - `task_type`: Primary task classification.
  - `required_capabilities`: Mandatory capabilities (`Set[ModelCapability]`).
  - `preferred_capabilities`: Optional capabilities boosting match score.
  - `minimum_context_length`: Minimum tokens required.
  - `minimum_quality`: `LOW`, `MEDIUM`, `HIGH`, `MAXIMUM`.
  - `latency_requirement`: `LOW` (real-time/UI), `BALANCED`, `BATCH`.
  - `resource_budget`: `LOW` (strict RAM/VRAM conservation), `MEDIUM`, `UNCONSTRAINED`.
  - `offline_required`: Enforces strict local/reference execution.
  - `preferred_model`: Soft model request.
  - `excluded_models`: Explicit model blocklist.
  - `policy_profile`: Override routing strategy profile.

### 3.2 Hard Constraint Evaluator (`constraints.py`)

Evaluates candidates against 8 sequential hard constraints. A candidate must satisfy **all** constraints to qualify for scoring:

1. **Explicit Exclusion**: Model is not in `request.excluded_models`.
2. **Local Installation**: Model is installed and weight files exist on disk.
3. **Capability Subset**: `request.required_capabilities ⊆ model.capabilities`.
4. **Context Window**: `model.context_length >= request.minimum_context_length`.
5. **Offline Compliance**: Provider is `local` or `reference` when `offline_required=True`.
6. **Backend Availability**: An active, registered inference backend is available for the model format (GGUF, ONNX, etc.).
7. **Hardware Capacity**: System RAM >= `model.requirements.min_ram_gb` and VRAM >= `model.requirements.min_vram_gb`.
8. **Runtime State**: Model is not in a `FAILED` or `ERROR` lifecycle state.

### 3.3 Multi-Factor Candidate Scorer (`scoring.py`)

Computes a deterministic composite score (0.0 to 100.0) based on weighted factors:

$$\text{Score} = \sum_{i} w_i \cdot s_i$$

| Factor | Weight Range | Description |
| :--- | :--- | :--- |
| **`capability_match`** | 20 - 30% | Match ratio of preferred capabilities + overall capability richness |
| **`quality`** | 10 - 30% | Parameter count depth + quantization precision (FP16/Q8/Q5/Q4) |
| **`context_fit`** | 10 - 15% | Optimal context headroom (1.5x - 4x of requested context) |
| **`hardware_fit`** | 10 - 30% | Free RAM and GPU VRAM headroom above minimum requirements |
| **`latency`** | 5 - 25% | Predicted speed based on model parameter scale and quantization |
| **`already_loaded_bonus`** | 5 - 20% | Bonus for model already resident in memory (avoids reload overhead) |
| **`preferred_model_bonus`** | 5% | Soft bonus if requested by user/agent |
| **`task_specialization`** | 10 - 15% | Explicit alignment between model capabilities and `TaskType` |

### 3.4 Policy Profiles (`policies.py`)

- **`BALANCED`**: Equalized optimization for daily agent interactions.
- **`PERFORMANCE`**: Favors warm loaded models, smaller parameter sizes, and fast token generation.
- **`QUALITY`**: Favors high parameter models (14B+), high quantization (FP16/Q8), and rich capabilities.
- **`LOW_RESOURCE`**: Favors aggressive memory conservation, lightweight footprints, and quantized models.

---

## 4. Usage Example

```python
from brain.ai.router import (
    get_router,
    RoutingRequest,
    TaskType,
    QualityRequirement,
    RoutingPolicyProfile,
)
from brain.ai.runtime import get_runtime, GenerationRequest

# 1. Obtain router singleton
router = get_router()

# 2. Construct routing request
request = RoutingRequest(
    task_type=TaskType.CODE,
    minimum_context_length=8192,
    minimum_quality=QualityRequirement.HIGH,
    policy_profile=RoutingPolicyProfile.BALANCED,
)

# 3. Compute routing decision
decision = router.route(request)
print(f"Selected: {decision.selected_model_id} (Score: {decision.score:.2f})")
print(f"Fallbacks: {decision.fallback_candidates}")

# 4. Hand decision to runtime
runtime = get_runtime()
response = runtime.generate(GenerationRequest(
    model_id=decision.selected_model_id,
    prompt="def quicksort(arr):",
))
print(response.text)

# 5. Access explainability diagnostics
diagnostics = router.explain(decision)
```

---

## 5. Test Suite

The Model Router is validated across 4 test suites:

- `tests/ai/test_router_constraints.py`: Hard constraint rejection edge cases.
- `tests/ai/test_router_scoring.py`: Multi-factor scoring arithmetic, policy profiles, and soft preferences.
- `tests/ai/test_router_fallback.py`: Fallback chain construction and dynamic degradation recovery.
- `tests/ai/test_router_platform.py`: Cross-platform independence across Windows, Linux, and macOS topologies.
- `tests/ai/test_router.py`: End-to-end integration and explainability handshake with `AIModelRuntime`.
