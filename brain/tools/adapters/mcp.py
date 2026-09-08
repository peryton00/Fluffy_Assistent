"""
Model Context Protocol (MCP) Tool Adapter
Bridges canonical Tool Runtime requests to active MCP servers through the MCPManager.
"""

from typing import Dict, Any, Optional
import time

from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.mcp.manager import MCPManager, get_mcp_manager


class MCPToolAdapter(ToolAdapter):
    """
    Executes MCP tools across registered, active MCP servers.
    """

    def __init__(self, mcp_manager: Optional[MCPManager] = None):
        self._mcp_manager = mcp_manager

    @property
    def manager(self) -> MCPManager:
        if self._mcp_manager is None:
            self._mcp_manager = get_mcp_manager()
        return self._mcp_manager

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute tool on target MCP server."""
        start_time = time.perf_counter()

        # Handle dry-run requests
        if request.dry_run:
            if not tool.supports_dry_run:
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error="Dry-run requested but MCP tool does not support dry-run simulation.",
                    error_type=ToolErrorType.UNSUPPORTED_OPERATION,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output={"dry_run": True, "simulated": True},
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
                metadata={"dry_run": True},
            )

        server_id, tool_name = self._parse_mcp_id(tool)
        client = self.manager.get_client(server_id)

        if not client:
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=f"MCP server '{server_id}' is not connected or available.",
                error_type=ToolErrorType.UNAVAILABLE,
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        timeout = request.timeout or tool.timeout or 30.0

        try:
            resp = client.call_tool(
                name=tool_name,
                arguments=request.parameters,
                timeout=timeout,
            )
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output=resp,
                duration_ms=duration_ms,
                metadata={"mcp_server": server_id},
            )

        except TimeoutError:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=f"Timed out waiting for MCP tool '{tool_name}' on server '{server_id}' after {timeout}s.",
                error_type=ToolErrorType.TIMEOUT,
                duration_ms=duration_ms,
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=str(e),
                error_type=ToolErrorType.EXECUTION_ERROR,
                duration_ms=duration_ms,
                metadata={"mcp_error": str(e)},
            )

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        """Check health of the parent MCP server."""
        server_id, _ = self._parse_mcp_id(tool)
        server_health = self.manager.get_server_health(server_id)

        if server_health and server_health.is_connected:
            return ToolHealth(
                tool_id=tool.tool_id,
                status=ToolHealthStatus.AVAILABLE,
                latency_ms=server_health.latency_ms,
                last_checked=server_health.last_checked,
            )
        else:
            err = server_health.last_error if server_health else "Server disconnected"
            return ToolHealth(
                tool_id=tool.tool_id,
                status=ToolHealthStatus.UNAVAILABLE,
                last_error=err,
                last_checked=time.time(),
            )

    def _parse_mcp_id(self, tool: ToolDefinition) -> tuple:
        """Parse server_id and original tool_name from definition."""
        metadata = tool.metadata or {}
        if "mcp_server" in metadata and "original_name" in metadata:
            return metadata["mcp_server"], metadata["original_name"]

        # Fallback to parsing from tool_id: mcp.{server_id}.{tool_name}
        parts = tool.tool_id.split(".")
        if len(parts) >= 3 and parts[0] == "mcp":
            return parts[1], ".".join(parts[2:])
        elif len(parts) == 2 and parts[0] == "mcp":
            return "default", parts[1]
        return "default", tool.name
