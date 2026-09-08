"""
Sandbox Execution Cancellation and Process Tree Termination
Ensures reliable termination of in-flight sandboxed processes on cancel or timeout.
"""

import os
import subprocess
import threading
from typing import Dict, Optional, Any


class SandboxCancellationManager:
    """
    Tracks active process handles and terminates them reliably on cancellation.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._active_processes: Dict[str, subprocess.Popen] = {}

    def register_process(self, execution_id: str, process: subprocess.Popen) -> None:
        """Register an active subprocess for an execution ID."""
        with self._lock:
            self._active_processes[execution_id] = process

    def unregister_process(self, execution_id: str) -> None:
        """Unregister process after completion or cleanup."""
        with self._lock:
            self._active_processes.pop(execution_id, None)

    def cancel(self, execution_id: str) -> bool:
        """
        Terminate the running process for the given execution ID.
        Returns True if a process was found and terminated.
        """
        with self._lock:
            proc = self._active_processes.pop(execution_id, None)
            if not proc:
                return False

            return self._terminate_process_tree(proc)

    def _terminate_process_tree(self, proc: subprocess.Popen) -> bool:
        """Kill the subprocess tree deterministically."""
        try:
            if proc.poll() is not None:
                return True

            if os.name == "nt":
                # Windows taskkill with /T (tree) /F (force)
                subprocess.run(
                    ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
            else:
                proc.kill()

            try:
                proc.wait(timeout=1.0)
            except Exception:
                pass

            return True
        except Exception:
            return False
