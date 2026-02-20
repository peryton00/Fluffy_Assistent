"""
Admin Client - HTTP poller for admin (controller) mode.

Maintains a list of known client machines. Polls each machine's
/data endpoint every 2 seconds to get live monitoring data.
No authentication required.
"""

import json
import threading
import time
import uuid
from typing import Optional, Dict, List
from urllib.request import urlopen, Request
from urllib.error import URLError


class MachineEntry:
    """Represents a known client machine."""

    def __init__(self, machine_id: str, ip: str, port: int, name: str = ""):
        self.machine_id = machine_id
        self.ip = ip
        self.port = port
        self.name = name or f"{ip}:{port}"
        self.online = False
        self.last_seen: Optional[float] = None
        self.last_data: Optional[dict] = None

    def to_dict(self) -> dict:
        return {
            "machine_id": self.machine_id,
            "ip": self.ip,
            "port": self.port,
            "name": self.name,
            "online": self.online,
            "last_seen": self.last_seen,
        }


class AdminClient:
    """Polls known client machines for live monitoring data."""

    POLL_INTERVAL = 2.0   # seconds between polls
    TIMEOUT = 3.0         # HTTP request timeout

    def __init__(self):
        self._machines: Dict[str, MachineEntry] = {}
        self._lock = threading.Lock()
        self._running = False
        self._poll_thread: Optional[threading.Thread] = None
        self._active_machine_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_machine(self, ip: str, port: int = 8765) -> tuple:
        """
        Ping a machine and add it to the known list.

        Returns:
            (success: bool, machine_id_or_error: str)
        """
        # Check reachability first
        ok, info = self._ping(ip, port)
        if not ok:
            return False, info  # info is the error message

        machine_id = str(uuid.uuid4())[:8]
        name = info.get("machine", f"{ip}:{port}")

        entry = MachineEntry(machine_id, ip, port, name)
        entry.online = True
        entry.last_seen = time.time()

        with self._lock:
            self._machines[machine_id] = entry
            if self._active_machine_id is None:
                self._active_machine_id = machine_id

        self._ensure_polling()
        print(f"[AdminClient] Added machine {name} ({ip}:{port}) → id={machine_id}")
        return True, machine_id

    def remove_machine(self, machine_id: str) -> bool:
        """Remove a machine from the known list."""
        with self._lock:
            if machine_id not in self._machines:
                return False
            del self._machines[machine_id]
            if self._active_machine_id == machine_id:
                ids = list(self._machines.keys())
                self._active_machine_id = ids[0] if ids else None
        print(f"[AdminClient] Removed machine {machine_id}")
        return True

    def get_all_machines(self) -> List[dict]:
        """Return list of all known machines as dicts."""
        with self._lock:
            return [m.to_dict() for m in self._machines.values()]

    def get_active_machine_id(self) -> Optional[str]:
        return self._active_machine_id

    def switch_active(self, machine_id: str) -> bool:
        with self._lock:
            if machine_id not in self._machines:
                return False
            self._active_machine_id = machine_id
        return True

    def get_machine_data(self, machine_id: str) -> Optional[dict]:
        with self._lock:
            entry = self._machines.get(machine_id)
            return entry.last_data if entry else None

    def send_action(self, machine_id: str, action_data: dict) -> tuple:
        """
        Send an action request to a client machine.
        
        Returns:
            (success: bool, result_dict_or_error_str)
        """
        with self._lock:
            entry = self._machines.get(machine_id)
            if not entry:
                return False, "Machine not found"
            
            ip, port = entry.ip, entry.port

        url = f"http://{ip}:{port}/action"
        
        # Add token
        from brain.routes.cluster_routes import FLUFFY_TOKEN
        headers = {
            "Content-Type": "application/json",
            "X-Fluffy-Token": FLUFFY_TOKEN
        }
        
        try:
            data = json.dumps(action_data).encode("utf-8")
            req = Request(url, data=data, headers=headers, method="POST")
            with urlopen(req, timeout=self.TIMEOUT) as resp:
                body = json.loads(resp.read().decode())
                if body.get("ok"):
                    return True, body
                return False, body.get("error", "Unknown error")
        except Exception as e:
            return False, str(e)

    def disconnect_all(self):
        """Remove all machines and stop polling."""
        with self._lock:
            self._machines.clear()
            self._active_machine_id = None
        self._running = False
        print("[AdminClient] Disconnected all machines")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ping(self, ip: str, port: int) -> tuple:
        """
        Ping a machine's /ping endpoint.

        Returns:
            (success: bool, info_dict_or_error_str)
        """
        url = f"http://{ip}:{port}/ping"
        try:
            with urlopen(url, timeout=self.TIMEOUT) as resp:
                body = json.loads(resp.read().decode())
                if body.get("ok"):
                    return True, body
                return False, body.get("error", "Unknown error")
        except URLError as e:
            reason = str(e.reason) if hasattr(e, "reason") else str(e)
            return False, f"Cannot reach {ip}:{port} — {reason}"
        except Exception as e:
            return False, str(e)

    def _fetch_data(self, entry: MachineEntry):
        """Fetch /data from a machine and update its entry."""
        url = f"http://{entry.ip}:{entry.port}/data"
        try:
            with urlopen(url, timeout=self.TIMEOUT) as resp:
                body = json.loads(resp.read().decode())
                if body.get("ok"):
                    with self._lock:
                        entry.last_data = body.get("data", {})
                        entry.online = True
                        entry.last_seen = time.time()
                else:
                    with self._lock:
                        entry.online = False
        except Exception:
            with self._lock:
                entry.online = False

    def _poll_loop(self):
        """Background thread: poll all machines every POLL_INTERVAL seconds."""
        print("[AdminClient] Polling started")
        while self._running:
            with self._lock:
                machines = list(self._machines.values())

            for entry in machines:
                if not self._running:
                    break
                self._fetch_data(entry)

            time.sleep(self.POLL_INTERVAL)
        print("[AdminClient] Polling stopped")

    def _ensure_polling(self):
        """Start the polling thread if not already running."""
        if self._running and self._poll_thread and self._poll_thread.is_alive():
            return
        self._running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()


# Global singleton
_admin_client: Optional[AdminClient] = None


def get_admin_client() -> AdminClient:
    """Get or create the global AdminClient instance."""
    global _admin_client
    if _admin_client is None:
        _admin_client = AdminClient()
    return _admin_client
