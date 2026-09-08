# Unified Tool Runtime Architecture

**Status:** IMPLEMENTED & VERIFIED  
**Phase:** 2D  

---

## 1. Overview

The **Unified Tool Runtime** is Fluffy's single canonical capability execution boundary. It abstracts capability providers—Native Python tools, Rust native capabilities, and Model Context Protocol (MCP) servers—under a unified interface. The Agent and StepExecutor interact strictly through this canonical boundary.

```text
                               Agent / StepExecutor
                                       ↓
                             Unified Tool Runtime
                                       ↓
                                 Tool Resolver
                                       ↓
                                 Tool Registry
                                       ↓
                         ┌─────────────┼─────────────┐
                         ↓             ↓             ↓
                   Native Python   Rust Core     MCP Servers
                         └─────────────┼─────────────┘
                                       ↓
                          Schema & Parameter Validation
                                       ↓
                             Policy Security Gate
                        (ActionValidator + Guardian)
                                       ↓
                             Allow / Confirm / Deny
                                       ↓
                            Provider Tool Adapter
                         (Native, Rust, MCP Adapters)
                                       ↓
                                   Execution
                                       ↓
                                  ToolResult
                                       ↓
                               StepObservation
```

---

## 2. Core Components

### `ToolDefinition`
Describes a tool capability declaratively:
* **Identification:** `tool_id`, `name`, `description`, `version`, `provider`, `kind` (`NATIVE`, `RUST`, `MCP`, `PYTHON`).
* **Schemas:** `input_schema`, `output_schema` (JSON Schema compliant).
* **Security Metadata:** `risk_level` (`READ_ONLY`, `SAFE`, `CONFIRMATION_REQUIRED`, `HIGH_RISK`, `BLOCKED`), `requires_confirmation`, `destructive`, `offline_capable`, `filesystem_access`, `process_access`, `network_access`.
* **Execution Capabilities:** `platforms`, `timeout`, `supports_dry_run`, `supports_cancellation`, `supports_streaming`.

### `ToolRequest` & `ToolResult`
* **`ToolRequest`:** Structured, serializable input containing `tool_id`, `parameters`, `request_id`, `task_id`, `step_id`, `timeout`, `dry_run`, and `metadata`.
* **`ToolResult`:** Standardized outcome model with `success`, `output`, `error`, `error_type` (`VALIDATION_ERROR`, `NOT_FOUND`, `UNAVAILABLE`, `TIMEOUT`, `CANCELLED`, `SECURITY_DENIED`, `CONFIRMATION_REQUIRED`, `EXECUTION_ERROR`, `PROTOCOL_ERROR`, `OFFLINE_VIOLATION`, `UNSUPPORTED_OPERATION`), `duration_ms`, and `metadata`.

### `ToolRegistry`
Central thread-safe registry mapping canonical tool IDs to definitions and adapters. Supports dynamic discovery, deterministic alias mapping, and priority-based conflict resolution.

### `ToolResolver`
Resolves tool IDs or normalized legacy aliases (e.g. `rust:System.GetHardware` $\to$ `rust.system.get_hardware`) into `(ToolDefinition, ToolAdapter)` pairs. Unknown or ambiguous tools fail safely without guessing.

### `SchemaValidator`
Validates parameter payloads against declared `input_schema` properties, types, min/max constraints, required fields, and enum values prior to policy evaluation or execution.

### `ToolSecurityPolicy`
The unified gate combining:
1. **Platform Compatibility Check:** Verifies OS compatibility against `ToolDefinition.platforms`.
2. **Offline Sovereignty:** Enforces strict offline mode when active (`offline_capable == False` $\to$ `DENY`).
3. **ActionValidator & Guardian:** Validates operations against system protection boundaries.
4. **Declarative Confirmation:** Suspends sensitive operations into `CONFIRMATION_REQUIRED` before dispatch.

---

## 3. Tool Adapters

| Adapter | Target | Transport |
| :--- | :--- | :--- |
| **`NativeToolAdapter`** | In-memory handlers, `CommandExecutor`, extensions | Direct Python call |
| **`RustToolAdapter`** | `fluffy_core` native daemon | TCP Port 9002 JSON-RPC |
| **`MCPToolAdapter`** | Local MCP servers | Stdio Transport / JSON-RPC 2.0 |

---

## 4. Lifecycle & Observability

The runtime emits structured, transport-neutral events via `ToolEventEmitter`:
* `TOOL_REGISTERED`, `TOOL_UNREGISTERED`, `TOOL_DISCOVERED`
* `TOOL_EXECUTION_STARTED`, `TOOL_EXECUTION_COMPLETED`, `TOOL_EXECUTION_FAILED`
* `TOOL_CONFIRMATION_REQUIRED`, `TOOL_HEALTH_CHANGED`
* `MCP_SERVER_STARTED`, `MCP_SERVER_STOPPED`, `MCP_SERVER_FAILED`
