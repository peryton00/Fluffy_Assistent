"""
Unit tests for MCPManager lifecycle and server configuration.
"""

import unittest
from brain.mcp.manager import MCPManager, MCPServerConfig, MCPServerState


class TestMCPManager(unittest.TestCase):
    """Tests for MCPManager registration, unregistration, and lifecycle state tracking."""

    def test_register_and_unregister_server(self):
        manager = MCPManager()
        config = MCPServerConfig(
            server_id="local_python_server",
            command=["python", "-m", "sample_mcp"],
            enabled=True,
            offline_only=True,
        )
        manager.register_server(config)

        self.assertEqual(manager.get_server_state("local_python_server"), MCPServerState.STOPPED)

        manager.unregister_server("local_python_server")
        self.assertIsNone(manager.get_server_health("local_python_server"))


if __name__ == "__main__":
    unittest.main()
