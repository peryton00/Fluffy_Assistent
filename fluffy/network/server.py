"""
Availability Server - Simple HTTP server for client (availability) mode.

Exposes /data and /ping endpoints so admin machines can poll for live
system monitoring data (CPU, RAM, processes, etc.).
No authentication required.
"""

import json
import socket
import sys
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from fluffy.network.data_formatter import format_monitoring_data


def get_local_ip() -> str:
    """Get local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class _DataHandler(BaseHTTPRequestHandler):
    """HTTP request handler for availability server."""

    def log_message(self, format, *args):
        # Suppress default HTTP logging
        pass

    def _send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/ping":
            self._send_json({
                "ok": True,
                "machine": socket.gethostname(),
                "ip": get_local_ip()
            })

        elif self.path == "/data":
            data = format_monitoring_data()
            self._send_json({"ok": True, "data": data})

        else:
            self._send_json({"error": "Not found"}, 404)

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()


class AvailabilityServer:
    """Simple HTTP server that exposes system monitoring data on the LAN."""

    def __init__(self, port: int = 8765, host: str = "0.0.0.0"):
        self.port = port
        self._port = port  # alias for status endpoint
        self.host = host
        self.running = False
        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> bool:
        """Start the HTTP server. Returns True on success."""
        if self.running:
            print("[AvailabilityServer] Already running")
            return True

        try:
            self._server = HTTPServer((self.host, self.port), _DataHandler)
            self._server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

            self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
            self._thread.start()

            self.running = True
            print(f"[AvailabilityServer] Started on {self.host}:{self.port}")
            return True

        except Exception as e:
            print(f"[AvailabilityServer] Failed to start: {e}")
            self.running = False
            return False

    def stop(self):
        """Stop the HTTP server and release the port."""
        if not self.running:
            print("[AvailabilityServer] Not running")
            return

        print("[AvailabilityServer] Stopping...")
        try:
            if self._server:
                self._server.shutdown()
                self._server.server_close()
                self._server = None

            self.running = False
            self._thread = None
            print("[AvailabilityServer] Stopped and port released")
        except Exception as e:
            print(f"[AvailabilityServer] Error stopping: {e}")
            self.running = False

    def is_running(self) -> bool:
        return self.running

    def get_active_connections_count(self) -> int:
        # HTTP is stateless — no persistent connections to count
        return 0


# Global singleton
_availability_server: Optional[AvailabilityServer] = None


def get_availability_server(port: int = 8765) -> AvailabilityServer:
    """Get or create the global AvailabilityServer instance."""
    global _availability_server
    if _availability_server is None:
        _availability_server = AvailabilityServer(port=port)
    elif not _availability_server.running and _availability_server.port != port:
        _availability_server.port = port
        _availability_server._port = port
    return _availability_server
