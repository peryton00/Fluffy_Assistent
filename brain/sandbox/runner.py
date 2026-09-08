"""
Sandbox Bootstrap Runner
Executed inside the isolated subprocess to enforce runtime security boundaries before executing user code.
"""

import sys
import os
import json
import traceback
import io
from pathlib import Path

_ORIG_OPEN = open


def _install_security_containment(allow_network: bool, allow_subprocess: bool, work_dir: str):
    """Install process-level interceptors into the runtime before executing code."""
    # 1. Network Lockdown
    if not allow_network:
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

    # 2. Process / Shell Lockdown
    if not allow_subprocess:
        def _blocked_process_spawn(*args, **kwargs):
            raise PermissionError("Subprocess creation is strictly disabled by Sandbox Security Policy.")

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

    # 3. Filesystem Path Containment
    work_path = Path(work_dir).resolve()
    exec_root = work_path.parent.resolve()
    orig_open = open
    orig_os_open = os.open

    def _is_safe_path(p) -> bool:
        try:
            target = Path(p)
            # Reserved Windows devices
            name_base = target.name.split(".")[0].upper()
            if name_base in {"CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2"}:
                return False
            if str(p).startswith(("\\\\", "//", "\\\\?\\", "\\\\.\\")):
                return False
            if target.is_absolute():
                resolved = target.resolve()
            else:
                resolved = (work_path / target).resolve()
            return resolved.is_relative_to(work_path)
        except Exception:
            return False

    def _guarded_open(file, *args, **kwargs):
        # Allow integer file descriptors (stdin, stdout, stderr)
        if isinstance(file, int):
            return orig_open(file, *args, **kwargs)
        if not _is_safe_path(file):
            raise PermissionError(f"Filesystem access to '{file}' is blocked by Sandbox Security Policy.")
        return orig_open(file, *args, **kwargs)

    def _guarded_os_open(path, *args, **kwargs):
        if not _is_safe_path(path):
            raise PermissionError(f"Filesystem access to '{path}' is blocked by Sandbox Security Policy.")
        return orig_os_open(path, *args, **kwargs)

    import builtins
    builtins.open = _guarded_open
    io.open = _guarded_open
    os.open = _guarded_os_open


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python runner.py <path_to_payload.json>\n")
        sys.exit(1)

    payload_path = sys.argv[1]
    with open(payload_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    source_code = payload.get("source_code", "")
    execution_id = payload.get("execution_id", "sbx_default")
    allow_network = payload.get("allow_network", False)
    allow_subprocess = payload.get("allow_subprocess", False)
    work_dir = payload.get("work_dir", os.getcwd())
    output_result_file = payload.get("output_result_file")

    # Set working directory to isolated work/
    try:
        os.chdir(work_dir)
    except Exception:
        pass

    # Install in-process security containment hooks
    _install_security_containment(allow_network, allow_subprocess, work_dir)

    # Set up stdout/stderr capture
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    old_stdout = sys.stdout
    old_stderr = sys.stderr

    sys.stdout = stdout_buf
    sys.stderr = stderr_buf

    exec_globals = {
        "__name__": "__main__",
        "__doc__": None,
        "__package__": None,
        "__file__": "sandbox_main.py",
        "__builtins__": __builtins__,
    }

    success = False
    error_msg = None
    error_type = None
    exit_code = 0

    try:
        compiled_code = compile(source_code, "sandbox_main.py", "exec")
        exec(compiled_code, exec_globals)
        success = True
    except PermissionError as pe:
        error_msg = str(pe)
        error_type = "security_denied"
        exit_code = 1
        sys.stderr.write(f"SecurityPolicyViolation: {str(pe)}\n")
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        exit_code = 1
        traceback.print_exc(file=sys.stderr)
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    captured_stdout = stdout_buf.getvalue()
    captured_stderr = stderr_buf.getvalue()

    # Extract result or return variable if set in globals
    returned_output = exec_globals.get("result") or exec_globals.get("output")

    result_data = {
        "execution_id": execution_id,
        "success": success,
        "exit_code": exit_code,
        "stdout": captured_stdout,
        "stderr": captured_stderr,
        "output": returned_output if returned_output is not None else captured_stdout.strip(),
        "error": error_msg,
        "error_type": error_type,
    }

    if output_result_file:
        try:
            with _ORIG_OPEN(output_result_file, "w", encoding="utf-8") as f:
                json.dump(result_data, f)
        except Exception:
            pass

    # Print captured output to outer stdout for stream readers
    if captured_stdout:
        old_stdout.write(captured_stdout)
    if captured_stderr:
        old_stderr.write(captured_stderr)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
