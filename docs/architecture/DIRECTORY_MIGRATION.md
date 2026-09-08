# Fluffy Assistant: Directory Migration Map

This document defines the file-by-file migration path for Phase 1 of the Fluffy Assistant architectural refactoring.

---

## 1. Classification Taxonomy

* **`ACTIVE`**: Actively used by current runtime pathways; moving to primary target location.
* **`COMPATIBILITY`**: Shim/bridge file maintained at legacy path to prevent breaking existing callers, dynamic imports, or plugins.
* **`DEPRECATED`**: Retained for backward compatibility with external tools/scripts; scheduled for future phase deprecation.
* **`DEAD`**: Verified zero-usage; candidates for removal only after strict confirmation.
* **`UNKNOWN`**: Under investigation before modifying.

---

## 2. Directory Migration Table

| Pre-Refactor Path | Target Refactored Path | Status | Compatibility Shim Required | Rationale & Notes |
|:---|:---|:---|:---|:---|
| **Python Agent & Parser** | | | | |
| `brain/llm_command_parser.py` | `brain/agent/llm_command_parser.py` | `ACTIVE` | **YES** (`brain/llm_command_parser.py`) | Multi-stage command parser moves to agent layer. |
| `brain/intent_router.py` | `brain/agent/intent_router.py` | `ACTIVE` | **YES** (`brain/intent_router.py`) | Intent dispatching logic moves to agent layer. |
| `brain/command_parser.py` | `brain/agent/command_parser.py` | `ACTIVE` | **YES** (`brain/command_parser.py`) | Intent Enum definitions move to agent layer. |
| `brain/interpreter.py` | `brain/agent/interpreter.py` | `ACTIVE` | **YES** (`brain/interpreter.py`) | Natural language telemetry interpretation rules. |
| `brain/recommender.py` | `brain/agent/recommender.py` | `ACTIVE` | **YES** (`brain/recommender.py`) | Optimization suggestion generator. |
| **Python LLM & AI Core** | | | | |
| `ai/src/llm_client.py` | `brain/ai/llm_client.py` | `ACTIVE` | **YES** (`ai/src/llm_client.py`) | Consolidated LLM client under brain/ai. |
| `ai/src/llm_config.py` | `brain/ai/llm_config.py` | `ACTIVE` | **YES** (`ai/src/llm_config.py`) | LLM model settings and provider configuration. |
| `ai/src/llm_service.py` | `brain/ai/llm_service.py` | `ACTIVE` | **YES** (`ai/src/llm_service.py`) | Multi-provider streaming and completion service. |
| `ai/src/clarifier.py` | `brain/ai/clarifier.py` | `ACTIVE` | **YES** (`ai/src/clarifier.py`) | Parameter clarification prompt builder. |
| `ai/src/intent_parser.py` | `brain/ai/intent_parser.py` | `ACTIVE` | **YES** (`ai/src/intent_parser.py`) | LLM prompt schemas for intent recognition. |
| **Python Context** | | | | |
| `brain/context_manager.py` | `brain/context/context_manager.py` | `ACTIVE` | **YES** (`brain/context_manager.py`) | Conversation & system context tracking. |
| **Python Semantic Memory** | | | | |
| `brain/chat_history.py` | `brain/memory/conversation/chat_history.py` | `ACTIVE` | **YES** (`brain/chat_history.py`) | Multi-turn chat persistence in `data/sessions/`. |
| `brain/memory/session_memory.py` | `brain/memory/session/session_memory.py` | `ACTIVE` | **YES** (`brain/memory/session_memory.py`) | In-flight action memory and pending confirmations. |
| `brain/memory/long_term_memory.py`| `brain/memory/user/long_term_memory.py` | `ACTIVE` | **YES** (`brain/memory/long_term_memory.py`) | Persistent user preferences and trusted entities. |
| `brain/memory.py` | `brain/memory/telemetry/memory_metrics.py` | `ACTIVE` | **YES** (`brain/memory.py`) | Memory metrics tracking helpers. |
| `brain/memory/memory_schema.json`| `brain/memory/memory_schema.json` | `ACTIVE` | No (Shared JSON) | JSON schema for structured long-term memory. |
| **Python Tools & Execution** | | | | |
| `brain/command_executor.py` | `brain/tools/command_executor.py` | `ACTIVE` | **YES** (`brain/command_executor.py`) | Action execution engine (files, apps, scripts). |
| `brain/app_utils.py` | `brain/tools/app_utils.py` | `ACTIVE` | **YES** (`brain/app_utils.py`) | Windows/Linux app registry scanning & icons. |
| `brain/platform_utils.py` | `brain/tools/platform_utils.py` | `ACTIVE` | **YES** (`brain/platform_utils.py`) | Cross-platform OS operation abstraction layer. |
| `brain/net_utils.py` | `brain/tools/net_utils.py` | `ACTIVE` | **YES** (`brain/net_utils.py`) | Bandwidth speed testing utility. |
| `brain/backup_manager.py` | `brain/tools/backup_manager.py` | `ACTIVE` | **YES** (`brain/backup_manager.py`) | Configuration backup and restore tool. |
| `brain/interrupt_handler.py` | `brain/tools/interrupt_handler.py` | `ACTIVE` | **YES** (`brain/interrupt_handler.py`) | Natural language task cancellation handler. |
| **MCP Architecture Boundary** | | | | |
| *New boundary* | `brain/mcp/registry.py` | `ACTIVE` | No (New Interface) | ToolRegistry boundary: Native + MCP Tools -> Policy. |
| **Python Security & Guardian**| | | | |
| `brain/action_validator.py` | `brain/security/action_validator.py` | `ACTIVE` | **YES** (`brain/action_validator.py`) | Safety policy validator for commands. |
| `brain/security_monitor.py` | `brain/security/security_monitor.py` | `ACTIVE` | **YES** (`brain/security_monitor.py`) | Threat scanner for process tree anomalies. |
| `brain/auth_utils.py` | `brain/security/auth_utils.py` | `ACTIVE` | **YES** (`brain/auth_utils.py`) | Token handshake & validation decorator. |
| `brain/guardian_manager.py` | `brain/security/guardian_manager.py` | `ACTIVE` | **YES** (`brain/guardian_manager.py`) | Central coordinator for Guardian subsystem. |
| `brain/guardian/*` | `brain/security/guardian/*` | `ACTIVE` | **YES** (`brain/guardian/*`) | Anomaly detection, baseline engine, scorer, audit. |
| **Python Dynamic Extensions** | | | | |
| `brain/extension_creator.py` | `brain/extensions/extension_creator.py` | `ACTIVE` | **YES** (`brain/extension_creator.py`) | Writes new extension handler/validator files. |
| `brain/extension_loader.py` | `brain/extensions/extension_loader.py` | `ACTIVE` | **YES** (`brain/extension_loader.py`) | Hot-loads and executes dynamic plugins. |
| `brain/code_generator.py` | `brain/extensions/code_generator.py` | `ACTIVE` | **YES** (`brain/code_generator.py`) | LLM code generation for new plugins. |
| `brain/code_validator.py` | `brain/extensions/code_validator.py` | `ACTIVE` | **YES** (`brain/extensions/code_validator.py`) | AST syntax parser and code safety validator. |
| `brain/self_improver.py` | `brain/extensions/self_improver.py` | `ACTIVE` | **YES** (`brain/self_improver.py`) | 3-retry self-healing execution loop. |
| `brain/extensions/registry.json`| `brain/extensions/registry.json` | `ACTIVE` | Retained in place | Plugin metadata and keyword patterns. |
| **Python API Layer** | | | | |
| `brain/web_api.py` | `brain/api/web_api.py` | `ACTIVE` | **YES** (`brain/web_api.py`) | Flask API daemon serving dashboard on port 5123. |
| `brain/routes/*` | `brain/api/routes/*` | `ACTIVE` | **YES** (`brain/routes/*`) | Blueprint routes: voice, ftp, cluster, network, etc. |
| **Python Runtime Daemon** | | | | |
| `brain/listener.py` | `brain/runtime/listener.py` | `ACTIVE` | **YES** (`brain/listener.py`) | Daemon loop listening on 9001 and spawning API. |
| `brain/state.py` | `brain/runtime/state.py` | `ACTIVE` | **YES** (`brain/state.py`) | Thread-safe in-memory state and lock. |
| `brain/commands.py` | `brain/runtime/commands.py` | `ACTIVE` | **YES** (`brain/commands.py`) | TCP command client sending commands to port 9002. |
| `brain/alerts.py` | `brain/runtime/alerts.py` | `ACTIVE` | **YES** (`brain/alerts.py`) | Alert formatting helpers. |
| **Native Rust Core** | | | | |
| `core/src/actions/*` | `core/src/actions/*` | `ACTIVE` | Retained in place | Filesystem, launcher, safety validator. |
| `core/src/ipc/*` | `core/src/ipc/*` | `ACTIVE` | Retained in place | Command receiver, telemetry broadcaster. |
| `core/src/permissions/*` | `core/src/permissions/*` | `ACTIVE` | Retained in place | Decision structures & policy evaluation. |
| `core/src/terminal/*` | `core/src/terminal/*` | `ACTIVE` | Retained in place | Terminal REPL, WebSocket bridge, TCP agent. |
| `core/src/main.rs` | `core/src/main.rs` | `ACTIVE` | Retained in place | Main runner with multi-target path detection. |
| **Desktop User Interface** | | | | |
| `ui/tauri/*` | `ui/tauri/*` (target: `apps/desktop/*`)| `ACTIVE` | Retained in place | UI audit completed first; physical move deferred. |
