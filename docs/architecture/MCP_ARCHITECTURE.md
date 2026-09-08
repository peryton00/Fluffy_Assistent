# Model Context Protocol (MCP) Architecture in Fluffy

**Status:** IMPLEMENTED & VERIFIED  
**Phase:** 2D  

---

## 1. Overview

Fluffy integrates the **Model Context Protocol (MCP)** as a first-class tool provider within the Unified Tool Runtime.

> **Key Architectural Principle:** MCP is a capability source, NOT Fluffy's architecture. MCP tools are discovered, normalized into `ToolDefinition` models, registered in `ToolRegistry`, and executed strictly through Fluffy's canonical `ActionValidator` and `Guardian` security boundary.

```text
MCPManager
    ↓
MCPServerConnection (StdioTransport)
    ↓
MCPProtocolHandler (JSON-RPC 2.0)
    ↓
tools/list
    ↓
MCPDiscovery (normalization to ToolDefinition)
    ↓
ToolRegistry
    ↓
Agent / StepExecutor
    ↓
UnifiedToolRuntime
    ↓
ActionValidator & Guardian Gate
    ↓
MCPToolAdapter (tools/call)
    ↓
ToolResult → StepObservation
```

---

## 2. MCP Subsystem Components

### `MCPTransport`
* **`StdioTransport`:** Offline, local process execution using `stdin`/`stdout` JSON-RPC lines with process lifecycle management and timeouts.
* **`InMemoryTransport`:** Deterministic in-memory message passing transport for zero-subprocess unit testing.

### `MCPProtocolHandler`
Implements JSON-RPC 2.0 parsing and serialization according to the MCP specification (`2024-11-05`), handling standard error codes and message envelopes.

### `MCPClient`
Encapsulates an MCP session:
* `connect()`: Handshake (`initialize` $\to$ `notifications/initialized`).
* `ping()`: Session health checking.
* `list_tools()`: Tool discovery via `tools/list`.
* `call_tool()`: Tool invocation via `tools/call`.

### `MCPDiscovery`
Translates remote `MCPToolDefinition` instances into canonical `ToolDefinition` records:
* Applies namespaced tool IDs: `mcp.{server_id}.{tool_name}`.
* Enforces conservative security metadata defaults.

### `MCPManager`
Owns local server configurations (`MCPServerConfig`), process supervision, bounded retry backoffs, server states (`DISABLED`, `STARTING`, `READY`, `DEGRADED`, `STOPPING`, `STOPPED`, `FAILED`), and health monitoring (`MCPServerHealth`).

---

## 3. Security & Offline Sovereignty

1. **Local & Offline Execution:** Transports are strictly local. Remote network MCP endpoints are forbidden in strict offline mode.
2. **No Direct Execution:** The Agent cannot launch MCP subprocesses or invoke MCP tools directly without passing through `ToolSecurityPolicy`.
3. **Confirmation Suspension:** Sensitive MCP capabilities suspend into `WAITING_CONFIRMATION` before any `tools/call` message is dispatched.
