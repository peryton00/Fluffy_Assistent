"""
Unit tests for MCPToolAdapter.
"""

import unittest
import json
from typing import Optional
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.requests import ToolRequest
from brain.tools.adapters.mcp import MCPToolAdapter
from brain.mcp.client import MCPClient
from brain.mcp.manager import MCPManager
from brain.mcp.transport import InMemoryTransport


class TestMCPToolAdapter(unittest.TestCase):
    """Tests for MCPToolAdapter routing to active MCP clients."""

    def setUp(self):
        self.manager = MCPManager()
        self.adapter = MCPToolAdapter(mcp_manager=self.manager)

    def test_mcp_tool_execution(self):
        # Create deterministic InMemory mock MCP server
        def mock_server_handler(msg: str) -> Optional[str]:
            req = json.loads(msg)
            method = req.get("method", "")
            if method.startswith("notifications/"):
                return None
            if method == "initialize":
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req.get("id"),
                    "result": {"protocolVersion": "2024-11-05", "serverInfo": {"name": "test_server"}},
                })
            elif method == "tools/call":
                params = req.get("params", {})
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req.get("id"),
                    "result": {"content": f"Echo from MCP tool {params.get('name')}"},
                })
            return json.dumps({"jsonrpc": "2.0", "id": req.get("id"), "result": {}})

        transport = InMemoryTransport(message_handler=mock_server_handler)
        client = MCPClient(transport=transport, server_name="calc_server")
        client.connect()
        self.manager.attach_client("calc_server", client)

        tool = ToolDefinition(
            tool_id="mcp.calc_server.calculate",
            name="calculate",
            description="Calculate expression",
            kind=ToolKind.MCP,
            metadata={"mcp_server": "calc_server", "original_name": "calculate"},
        )
        req = ToolRequest(tool_id="mcp.calc_server.calculate", parameters={"expr": "2+2"})
        result = self.adapter.execute(tool, req)

        self.assertTrue(result.success)
        self.assertEqual(result.output, {"content": "Echo from MCP tool calculate"})

    def test_unconnected_mcp_server_returns_unavailable(self):
        tool = ToolDefinition(
            tool_id="mcp.nonexistent_server.tool",
            name="tool",
            description="tool",
            kind=ToolKind.MCP,
            metadata={"mcp_server": "nonexistent_server", "original_name": "tool"},
        )
        req = ToolRequest(tool_id="mcp.nonexistent_server.tool", parameters={})
        result = self.adapter.execute(tool, req)

        self.assertFalse(result.success)
        self.assertEqual(result.error_type.value, "unavailable")


if __name__ == "__main__":
    unittest.main()
