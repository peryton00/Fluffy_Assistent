"""
Model Context Protocol (MCP) Client
Manages session handshake, tool discovery, and structured invocation over an MCPTransport.
"""

from typing import Dict, Any, List, Optional
import time
import uuid

from brain.mcp.transport import MCPTransport
from brain.mcp.protocol import MCPProtocolHandler, MCPProtocolError
from brain.mcp.schemas import (
    JSONRPCRequest,
    JSONRPCResponse,
    MCPToolDefinition,
    MCPInitializeResult,
)


class MCPClient:
    """
    Client for interacting with an MCP server session.
    Enforces offline security constraints and graceful connection lifecycle.
    """

    def __init__(self, transport: MCPTransport, server_name: str = "mcp_server"):
        self.transport = transport
        self.server_name = server_name
        self.server_info: Dict[str, Any] = {}
        self.capabilities: Dict[str, Any] = {}
        self._is_initialized = False

    def connect(self, timeout: float = 5.0) -> MCPInitializeResult:
        """
        Connect transport and complete MCP initialization handshake.
        """
        self.transport.connect()

        # 1. Send initialize request
        init_req = JSONRPCRequest(
            method="initialize",
            params={
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": True}},
                "clientInfo": {"name": "fluffy-tool-runtime", "version": "1.0.0"},
            },
        )
        resp = self._send_request(init_req, timeout=timeout)
        if not resp.is_success or not resp.result:
            err_msg = resp.error.get("message") if resp.error else "Initialization failed"
            raise MCPProtocolError(
                resp.error.get("code", -1) if resp.error else -1,
                f"Failed to initialize MCP server '{self.server_name}': {err_msg}",
            )

        init_result = MCPInitializeResult.from_dict(resp.result)
        self.server_info = init_result.serverInfo
        self.capabilities = init_result.capabilities

        # 2. Send initialized notification
        notif = JSONRPCRequest(method="notifications/initialized", params={})
        # Notifications don't expect a response
        try:
            self.transport.send(MCPProtocolHandler.serialize_request(notif))
        except Exception:
            pass

        self._is_initialized = True
        return init_result

    def ping(self, timeout: float = 2.0) -> bool:
        """Send ping request to check connection health."""
        if not self.transport.is_connected:
            return False
        req = JSONRPCRequest(method="ping", params={})
        try:
            resp = self._send_request(req, timeout=timeout)
            return resp.is_success
        except Exception:
            return False

    def list_tools(self, timeout: float = 5.0) -> List[MCPToolDefinition]:
        """Query available tools from server via tools/list."""
        req = JSONRPCRequest(method="tools/list", params={})
        resp = self._send_request(req, timeout=timeout)
        if not resp.is_success:
            err_msg = resp.error.get("message") if resp.error else "tools/list error"
            raise MCPProtocolError(resp.error.get("code", -1) if resp.error else -1, err_msg)

        tools_data = resp.result.get("tools", []) if isinstance(resp.result, dict) else []
        return [MCPToolDefinition.from_dict(t) for t in tools_data]

    def call_tool(
        self,
        name: str,
        arguments: Optional[Dict[str, Any]] = None,
        timeout: float = 30.0,
    ) -> Dict[str, Any]:
        """Invoke a tool via tools/call."""
        req = JSONRPCRequest(
            method="tools/call",
            params={
                "name": name,
                "arguments": arguments or {},
            },
        )
        resp = self._send_request(req, timeout=timeout)
        if not resp.is_success:
            err_dict = resp.error or {}
            raise MCPProtocolError(err_dict.get("code", -1), err_dict.get("message", "Tool invocation failed"))

        return resp.result if isinstance(resp.result, dict) else {"content": resp.result}

    def close(self) -> None:
        """Close connection to MCP server."""
        self._is_initialized = False
        self.transport.close()

    def _send_request(self, req: JSONRPCRequest, timeout: float) -> JSONRPCResponse:
        """Send request and await correlated response."""
        raw_req = MCPProtocolHandler.serialize_request(req)
        self.transport.send(raw_req)
        raw_resp = self.transport.receive(timeout=timeout)
        return MCPProtocolHandler.parse_response(raw_resp)
