"""
Rust Native Capability Client Bridge
Enables the Python Agent layer to discover and invoke native capabilities via TCP IPC.
"""

import json
import socket
from typing import Dict, Any, Optional
import uuid


class RustCapabilityClient:
    """
    Client for communicating with the Rust Core capability layer over TCP Port 9002.
    Provides structured request/response semantics with timeout and error handling.
    """

    def __init__(self, host: str = "127.0.0.1", port: int = 9002):
        self.host = host
        self.port = port

    def is_core_reachable(self, timeout: float = 1.0) -> bool:
        """Check if the Rust Core command server is reachable."""
        try:
            with socket.create_connection((self.host, self.port), timeout=timeout):
                return True
        except (socket.error, OSError):
            return False

    def discover_capabilities(self, timeout: float = 3.0) -> Dict[str, Any]:
        """
        Query the Rust Core for its dynamically generated CapabilityManifest.
        """
        payload = "DiscoverCapabilities"
        return self._send_request(payload, timeout=timeout)

    def execute_capability(
        self,
        capability_id: str,
        parameters: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        timeout: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Execute a native Rust capability with structured arguments.
        """
        req_id = request_id or str(uuid.uuid4())
        payload = {
            "Capability": {
                "request": {
                    "id": capability_id,
                    "parameters": parameters or {},
                    "request_id": req_id,
                }
            }
        }
        return self._send_request(payload, timeout=timeout)

    def _send_request(self, payload: Any, timeout: float = 5.0) -> Dict[str, Any]:
        """Send a newline-delimited JSON payload over TCP and read the response."""
        try:
            with socket.create_connection((self.host, self.port), timeout=timeout) as sock:
                sock.settimeout(timeout)
                # Send request
                raw_data = json.dumps(payload) + "\n"
                sock.sendall(raw_data.encode("utf-8"))

                # Read response line
                sock_file = sock.makefile("r", encoding="utf-8")
                line = sock_file.readline()
                if not line:
                    return {
                        "success": False,
                        "error": {"code": "empty_response", "message": "Rust core returned an empty response."},
                    }

                return json.loads(line.strip())
        except ConnectionRefusedError:
            return {
                "success": False,
                "error": {
                    "code": "core_unreachable",
                    "message": f"Could not connect to Rust Core on {self.host}:{self.port}. Is fluffy-core running?",
                },
            }
        except (socket.timeout, TimeoutError):
            return {
                "success": False,
                "error": {
                    "code": "timeout",
                    "message": f"Timed out waiting for Rust Core response after {timeout}s.",
                },
            }
        except Exception as e:
            return {
                "success": False,
                "error": {"code": "client_error", "message": str(e)},
            }


# Global singleton instance
_capability_client: Optional[RustCapabilityClient] = None


def get_capability_client() -> RustCapabilityClient:
    """Get or create the global RustCapabilityClient instance."""
    global _capability_client
    if _capability_client is None:
        _capability_client = RustCapabilityClient()
    return _capability_client
