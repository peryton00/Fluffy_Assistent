"""
Remote MCP Rejection and Transport Sovereignty Tests
Verifies that remote MCP configurations (HTTP, HTTPS, SSE, WebSockets) are rejected under offline policy.
"""

import unittest
from brain.mcp.manager import MCPServerConfig, MCPManager


class TestRemoteMCPRejection(unittest.TestCase):
    """Test rejection of non-local MCP server configurations."""

    def test_reject_remote_http_url_in_command(self):
        """Reject MCP server configuration with external HTTP/HTTPS URL in command or args."""
        with self.assertRaises(ValueError) as ctx:
            MCPServerConfig(
                server_id="remote_mcp_test",
                command=["node", "https://remote-mcp.enterprise.net/server.js"],
                offline_only=True,
            )
        self.assertIn("Remote MCP transports are prohibited", str(ctx.exception))

    def test_reject_remote_sse_transport_metadata(self):
        """Reject MCP server configuration declaring remote SSE transport."""
        with self.assertRaises(ValueError) as ctx:
            MCPServerConfig(
                server_id="sse_mcp_test",
                command=["uvx", "mcp-server"],
                metadata={"transport": "sse"},
                offline_only=True,
            )
        self.assertIn("Remote MCP transport 'sse' is prohibited", str(ctx.exception))

    def test_accept_local_stdio_mcp_configuration(self):
        """Accept local subprocess stdio MCP configuration."""
        config = MCPServerConfig(
            server_id="local_sqlite_mcp",
            command=["python", "local_mcp_server.py"],
            arguments=["--database", "audit.db"],
            offline_only=True,
        )
        self.assertEqual(config.server_id, "local_sqlite_mcp")
        self.assertTrue(config.offline_only)


if __name__ == "__main__":
    unittest.main()
