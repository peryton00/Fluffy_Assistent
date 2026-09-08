"""
Unit tests for MCPClient and MCPProtocolHandler.
"""

import unittest
import json
from brain.mcp.client import MCPClient
from brain.mcp.transport import InMemoryTransport
from brain.mcp.protocol import MCPProtocolError


class TestMCPClient(unittest.TestCase):
    """Tests for MCPClient handshake, tools/list, and tools/call using InMemoryTransport."""

    def test_mcp_client_handshake_and_tool_call(self):
        def echo_server(msg: str):
            req = json.loads(msg)
            method = req.get("method", "")
            req_id = req.get("id")

            if method.startswith("notifications/"):
                return None
            elif method == "initialize":
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {"name": "test_echo_server", "version": "1.0.0"},
                        "capabilities": {"tools": {}},
                    },
                })
            elif method == "ping":
                return json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {}})
            elif method == "tools/list":
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": [
                            {
                                "name": "echo",
                                "description": "Echo back string",
                                "inputSchema": {
                                    "type": "object",
                                    "required": ["text"],
                                    "properties": {"text": {"type": "string"}},
                                },
                            }
                        ]
                    },
                })
            elif method == "tools/call":
                params = req.get("params", {})
                args = params.get("arguments", {})
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"echoed": args.get("text")},
                })
            return json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {}})

        transport = InMemoryTransport(message_handler=echo_server)
        client = MCPClient(transport=transport, server_name="test_echo")

        # 1. Connect & Handshake
        init_res = client.connect()
        self.assertEqual(init_res.serverInfo.get("name"), "test_echo_server")

        # 2. Ping
        self.assertTrue(client.ping())

        # 3. List Tools
        tools = client.list_tools()
        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0].name, "echo")

        # 4. Call Tool
        res = client.call_tool("echo", {"text": "hello_fluffy"})
        self.assertEqual(res.get("echoed"), "hello_fluffy")

        client.close()


if __name__ == "__main__":
    unittest.main()
