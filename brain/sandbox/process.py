"""
Sandbox Process Policy and Subprocess Containment
Blocks arbitrary process creation, shell execution, fork, and native OS execution from sandboxed code.
"""

from typing import Dict, Any


class SandboxProcessPolicy:
    """
    Defines process control constraints for sandboxed code execution.
    Default: strict denial of subprocess spawning, shell execution, and fork mechanisms.
    """

    def __init__(self, allow_subprocesses: bool = False):
        self.allow_subprocesses = allow_subprocesses

    def get_interceptor_code(self) -> str:
        """
        Generate containment code to disable subprocess spawning inside the runner.
        """
        if self.allow_subprocesses:
            return ""

        return """
# --- SANDBOX PROCESS ISOLATION BOOTSTRAP ---
def _blocked_process_spawn(*args, **kwargs):
    raise PermissionError("Subprocess creation and shell execution are strictly disabled by Sandbox Security Policy.")

try:
    import subprocess
    subprocess.Popen = _blocked_process_spawn
    subprocess.run = _blocked_process_spawn
    subprocess.call = _blocked_process_spawn
    subprocess.check_call = _blocked_process_spawn
    subprocess.check_output = _blocked_process_spawn
except Exception:
    pass

try:
    import os
    os.system = _blocked_process_spawn
    os.popen = _blocked_process_spawn
    if hasattr(os, "spawnl"):
        os.spawnl = _blocked_process_spawn
        os.spawnle = _blocked_process_spawn
        os.spawnlp = _blocked_process_spawn
        os.spawnlpe = _blocked_process_spawn
        os.spawnv = _blocked_process_spawn
        os.spawnve = _blocked_process_spawn
        os.spawnvp = _blocked_process_spawn
        os.spawnvpe = _blocked_process_spawn
    if hasattr(os, "fork"):
        os.fork = _blocked_process_spawn
    if hasattr(os, "execv"):
        os.execv = _blocked_process_spawn
        os.execve = _blocked_process_spawn
        os.execvp = _blocked_process_spawn
        os.execvpe = _blocked_process_spawn
except Exception:
    pass
# --- END SANDBOX PROCESS ISOLATION ---
"""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "allow_subprocesses": self.allow_subprocesses,
            "policy": "DENY_ALL" if not self.allow_subprocesses else "ALLOW",
        }
