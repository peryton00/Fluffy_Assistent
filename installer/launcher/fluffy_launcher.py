"""
Fluffy Assistant Launcher
=========================
Entry point for the installed application. This script:
  1. Detects the installation directory
  2. Patches .env to point to the embedded Python
  3. Launches fluffy-core.exe (which chains the Brain and UI)
  4. Shows a system tray icon with status / quit option
  5. Monitors processes and restarts them if they crash
  6. Handles graceful shutdown on exit

Compiled to fluffy-launcher.exe via PyInstaller (see build_launcher.ps1).
Runs with the EMBEDDED Python in {app}/python/python.exe.
"""

import os
import sys
import time
import json
import signal
import threading
import subprocess
import ctypes
from pathlib import Path
import traceback

def show_error(title: str, message: str):
    """Show a native Windows error message box without Tkinter."""
    ctypes.windll.user32.MessageBoxW(0, message, title, 0x10) # 0x10 is MB_ICONERROR | MB_OK

# ── Resolve installation directory ───────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running as compiled .exe, sys.executable is {app}\launcher\fluffy-launcher.exe
    LAUNCHER_DIR = Path(sys.executable).parent.resolve()
else:
    # Running as normal .py script
    LAUNCHER_DIR = Path(__file__).parent.resolve()

APP_DIR       = LAUNCHER_DIR.parent            # {app}
BIN_DIR       = APP_DIR / "bin"
BRAIN_DIR     = APP_DIR / "brain"
PYTHON_EXE    = APP_DIR / "python" / "python.exe"
CORE_EXE      = BIN_DIR / "fluffy-core.exe"
ENV_FILE      = APP_DIR / ".env"
STATUS_FILE   = APP_DIR / "status.json"
LOG_FILE      = APP_DIR / "fluffy_launcher.log"

# Track child processes
_processes: dict[str, subprocess.Popen] = {}
_running = True
_log_lock = threading.Lock()


def log(msg: str):
    """Write timestamped message to log file and stdout."""
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with _log_lock:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


def patch_env():
    """
    Update .env file so PYTHON_PATH points to the embedded Python exe.
    Also ensures FLUFFY_DATA_DIR points inside the app directory.
    """
    python_path = str(PYTHON_EXE).replace("\\", "/")
    
    if not ENV_FILE.exists():
        log("WARNING: .env not found — creating minimal one.")
        ENV_FILE.write_text(
            f"PYTHON_PATH={python_path}\n"
            f"LLM_PROVIDER=groq\n",
            encoding="utf-8"
        )
        return

    lines = ENV_FILE.read_text(encoding="utf-8").splitlines()
    new_lines = []
    patched_python = False

    for line in lines:
        if line.startswith("PYTHON_PATH="):
            new_lines.append(f"PYTHON_PATH={python_path}")
            patched_python = True
        else:
            new_lines.append(line)

    if not patched_python:
        new_lines.insert(0, f"PYTHON_PATH={python_path}")

    ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    log(f"Patched .env: PYTHON_PATH → {python_path}")


def start_process(name: str, cmd: list, cwd: Path = None, restart_on_crash: bool = True):
    """Start a child process and optionally restart it on crash."""
    cwd = cwd or APP_DIR

    def _run():
        global _running
        while _running:
            log(f"Starting [{name}]: {' '.join(str(c) for c in cmd)}")
            try:
                proc = subprocess.Popen(
                    [str(c) for c in cmd],
                    cwd=str(cwd),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    env={
                        **os.environ,
                        "FLUFFY_APP_DIR": str(APP_DIR),
                        "PYTHONUTF8": "1",
                        "PYTHONIOENCODING": "utf-8",
                    },
                )
                _processes[name] = proc
                # Stream output to log
                for line in proc.stdout:
                    try:
                        log(f"[{name}] {line.decode('utf-8', errors='replace').rstrip()}")
                    except Exception:
                        pass
                proc.wait()
                log(f"[{name}] Process exited with code {proc.returncode}")
            except FileNotFoundError as e:
                log(f"[{name}] FATAL: {e}")
                break
            except Exception as e:
                log(f"[{name}] ERROR: {e}\n{traceback.format_exc()}")

            if not _running:
                break
            if not restart_on_crash:
                break
            log(f"[{name}] Restarting in 5 seconds...")
            time.sleep(5)

    t = threading.Thread(target=_run, name=f"thread-{name}", daemon=True)
    t.start()
    return t


def stop_all():
    """Terminate all child processes gracefully."""
    global _running
    _running = False
    log("Shutting down all Fluffy processes...")

    for name, proc in list(_processes.items()):
        try:
            if proc.poll() is None:
                log(f"Terminating [{name}] (PID {proc.pid})")
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        except Exception as e:
            log(f"Error stopping [{name}]: {e}")

    _processes.clear()
    log("All processes stopped.")


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    log("=" * 60)
    log(f"Fluffy Assistant Launcher v1.0")
    log(f"App directory: {APP_DIR}")
    log("=" * 60)

    # Validate install
    if not CORE_EXE.exists():
        show_error(
            "Fluffy — Missing Files",
            f"Could not find the Fluffy Core:\n{CORE_EXE}\n\n"
            "Please reinstall Fluffy Assistant."
        )
        sys.exit(1)

    if not PYTHON_EXE.exists():
        show_error(
            "Fluffy — Missing Python",
            f"Embedded Python not found:\n{PYTHON_EXE}\n\n"
            "Please reinstall Fluffy Assistant."
        )
        sys.exit(1)

    # Patch .env
    patch_env()

    # Signal handler for Ctrl+C
    signal.signal(signal.SIGINT, lambda s, f: stop_all() or sys.exit(0))

    # Start Fluffy Core (it will spawn the Brain internally via .env PYTHON_PATH)
    start_process(
        name="core",
        cmd=[CORE_EXE],
        cwd=APP_DIR,
        restart_on_crash=True,
    )

    # Start Fluffy UI
    UI_EXE = BIN_DIR / "fluffy-ui.exe"
    if UI_EXE.exists():
        start_process(
            name="ui",
            cmd=[UI_EXE],
            cwd=APP_DIR,
            restart_on_crash=False, # User can close UI manually, don't restart it
        )

    # Give the core 3 seconds to start, then start monitoring
    time.sleep(3)
    log("All processes launched. Monitoring running state...")

    # Headless monitoring loop
    while _running:
        # 1. If the UI process exists and exited, trigger complete shutdown
        if "ui" in _processes:
            ui_proc = _processes["ui"]
            if ui_proc.poll() is not None:
                log("UI process exited. Initiating complete shutdown.")
                stop_all()
                break

        # 2. If the Core process exists and exited, trigger complete shutdown
        if "core" in _processes:
            core_proc = _processes["core"]
            if core_proc.poll() is not None:
                log("Core process exited. Initiating complete shutdown.")
                stop_all()
                break

        time.sleep(1)


if __name__ == "__main__":
    main()
