"""
Sandbox Network Policy and Isolation
Enforces strict offline policy, technical socket blocking, and localhost protection.
"""

from typing import Dict, Any


class SandboxNetworkPolicy:
    """
    Defines network restrictions for sandboxed code.
    Default: strict denial of all network activity and localhost interfaces.
    """

    def __init__(self, allow_network: bool = False):
        # Default is strictly False for sovereign offline safety
        self.allow_network = allow_network

    def get_interceptor_code(self) -> str:
        """
        Generate Python containment code to be executed inside the runner before user code.
        Overrides socket primitives, DNS resolution, and HTTP libraries to enforce offline containment.
        """
        if self.allow_network:
            return ""

        return """
# --- SANDBOX NETWORK ISOLATION BOOTSTRAP ---
import sys

class _BlockedSocket:
    def __init__(self, *args, **kwargs):
        raise PermissionError("Network access is strictly disabled by Sandbox Security Policy.")

def _blocked_network_call(*args, **kwargs):
    raise PermissionError("Network access is strictly disabled by Sandbox Security Policy.")

try:
    import socket
    socket.socket = _BlockedSocket
    socket.create_connection = _blocked_network_call
    socket.getaddrinfo = _blocked_network_call
    socket.gethostbyname = _blocked_network_call
    socket.gethostbyname_ex = _blocked_network_call
    socket.gethostbyaddr = _blocked_network_call
    socket.getnameinfo = _blocked_network_call
    socket.getfqdn = _blocked_network_call
except Exception:
    pass

try:
    import urllib.request
    urllib.request.urlopen = _blocked_network_call
except Exception:
    pass

try:
    import http.client
    http.client.HTTPConnection = _BlockedSocket
    http.client.HTTPSConnection = _BlockedSocket
except Exception:
    pass

try:
    import asyncio
    asyncio.open_connection = _blocked_network_call
    asyncio.start_server = _blocked_network_call
except Exception:
    pass
# --- END SANDBOX NETWORK ISOLATION ---
"""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "allow_network": self.allow_network,
            "policy": "DENY_ALL" if not self.allow_network else "ALLOW",
        }
