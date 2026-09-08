"""
Rust Capability Client Tests
Validates request structuring, error handling, and discovery response contracts.
"""

import json
import unittest
from unittest.mock import patch, MagicMock

from brain.runtime.rust_capability_client import RustCapabilityClient, get_capability_client


class TestRustCapabilityClient(unittest.TestCase):
    """Test RustCapabilityClient IPC contracts."""

    def test_client_initialization(self):
        """Verify default host and port."""
        client = get_capability_client()
        self.assertEqual(client.host, "127.0.0.1")
        self.assertEqual(client.port, 9002)

    def test_unreachable_core_handling(self):
        """Verify graceful error reporting when core is not listening."""
        client = RustCapabilityClient(port=59999) # Non-existent port
        resp = client.execute_capability("System.GetHardware", timeout=0.5)
        self.assertFalse(resp["success"])
        self.assertIn(resp["error"]["code"], ("core_unreachable", "timeout"))

    @patch("socket.create_connection")
    def test_mock_discovery_response(self, mock_conn):
        """Verify capability discovery parses manifest correctly."""
        mock_sock = MagicMock()
        mock_file = MagicMock()
        mock_file.readline.return_value = json.dumps({
            "platform": "windows",
            "core_version": "0.1.0",
            "capabilities": {
                "Process.List": {
                    "id": "Process.List",
                    "description": "List active processes",
                    "security_tier": "read_only",
                    "requires_confirmation": False,
                    "supported_platforms": ["windows", "linux", "macos"],
                    "is_implemented": True,
                }
            }
        }) + "\n"
        mock_sock.makefile.return_value = mock_file
        mock_sock.__enter__.return_value = mock_sock
        mock_conn.return_value = mock_sock

        client = RustCapabilityClient()
        manifest = client.discover_capabilities()
        self.assertEqual(manifest["platform"], "windows")
        self.assertIn("Process.List", manifest["capabilities"])

    @patch("socket.create_connection")
    def test_mock_capability_execution(self, mock_conn):
        """Verify capability execution sends correct payload and receives data."""
        mock_sock = MagicMock()
        mock_file = MagicMock()
        mock_file.readline.return_value = json.dumps({
            "request_id": "test-req-123",
            "success": True,
            "data": {"path": "C:\\safe\\path", "is_safe": True, "blocked": False},
        }) + "\n"
        mock_sock.makefile.return_value = mock_file
        mock_sock.__enter__.return_value = mock_sock
        mock_conn.return_value = mock_sock

        client = RustCapabilityClient()
        resp = client.execute_capability(
            "Filesystem.SafePathCheck",
            parameters={"path": "C:\\safe\\path"},
            request_id="test-req-123",
        )
        self.assertTrue(resp["success"])
        self.assertEqual(resp["request_id"], "test-req-123")
        self.assertTrue(resp["data"]["is_safe"])


if __name__ == "__main__":
    unittest.main()
