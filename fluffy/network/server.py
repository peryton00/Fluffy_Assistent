"""
Availability Server - Simple HTTP server for client (availability) mode.

Exposes /data, /ping, and /connections endpoints so admin machines can poll
for live system monitoring data (CPU, RAM, processes, etc.).
Tracks which admin IPs are actively polling and notifies the client UI.
No authentication required.
"""

import json
import socket
import sys
import os
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Dict

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


# Global registry of active admin connections: { ip -> last_seen_timestamp }
_admin_connections: Dict[str, float] = {}
_admin_connections_lock = threading.Lock()
ADMIN_TIMEOUT = 10.0  # seconds without a poll before considered disconnected


def record_admin_poll(ip: str):
    """Record that an admin at this IP just polled."""
    with _admin_connections_lock:
        _admin_connections[ip] = time.time()


def get_active_admins() -> list:
    """Return list of admin IPs that polled within the last ADMIN_TIMEOUT seconds."""
    now = time.time()
    with _admin_connections_lock:
        # Prune stale entries
        stale = [ip for ip, ts in _admin_connections.items() if now - ts > ADMIN_TIMEOUT]
        for ip in stale:
            del _admin_connections[ip]
        return list(_admin_connections.keys())


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
        client_ip = self.client_address[0]

        if self.path == "/ping":
            self._send_json({
                "ok": True,
                "machine": socket.gethostname(),
                "ip": get_local_ip()
            })

        elif self.path == "/data":
            # Track this admin as active
            record_admin_poll(client_ip)
            data = format_monitoring_data()
            self._send_json({"ok": True, "data": data})

        elif self.path == "/connections":
            # Return list of currently active admin IPs
            admins = get_active_admins()
            self._send_json({"ok": True, "admins": admins})

        else:
            self._send_json({"error": "Not found"}, 404)

    def do_POST(self):
        client_ip = self.client_address[0]
        
        # Simple token-based auth
        auth_token = self.headers.get("X-Fluffy-Token")
        from brain.routes.cluster_routes import FLUFFY_TOKEN
        
        if auth_token != FLUFFY_TOKEN:
            self._send_json({"error": "Unauthorized"}, 401)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self._send_json({"error": "Missing payload"}, 400)
            return

        try:
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            action = data.get("action")
            
            if action == "kill_process":
                pid = data.get("pid")
                if not pid:
                    self._send_json({"error": "Missing pid"}, 400)
                    return
                
                # Execute kill
                import subprocess
                import platform as _platform
                try:
                    if _platform.system() == "Windows":
                        result = subprocess.run(
                            ["taskkill", "/PID", str(pid), "/F"],
                            capture_output=True, text=True
                        )
                    else:
                        result = subprocess.run(
                            ["kill", "-9", str(pid)],
                            capture_output=True, text=True
                        )
                    if result.returncode == 0:
                        self._send_json({"ok": True, "message": f"Terminated PID {pid}"})
                    else:
                        self._send_json({"error": result.stderr or "Failed to kill process"}, 500)
                except Exception as e:
                    self._send_json({"error": str(e)}, 500)
            
            else:
                self._send_json({"error": f"Unknown action: {action}"}, 400)
                
        except Exception as e:
            self._send_json({"error": str(e)}, 500)

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Fluffy-Token, Content-Type")
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

            # Clear admin connections
            with _admin_connections_lock:
                _admin_connections.clear()

            print("[AvailabilityServer] Stopped and port released")
        except Exception as e:
            print(f"[AvailabilityServer] Error stopping: {e}")
            self.running = False

    def is_running(self) -> bool:
        return self.running

    def get_active_admins(self) -> list:
        return get_active_admins()


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
