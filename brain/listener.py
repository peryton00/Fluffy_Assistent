from state import update_state, add_execution_log
from web_api import start_api
from threading import Thread
from interpreter import interpret
from recommender import recommend
from tray import FluffyTray

import socket
import json
import sys
import signal
import time

IPC_HOST = "127.0.0.1"
IPC_PORT = 9001

tray = None
shutting_down = False
ipc_socket = None


# -----------------------------
# IPC CONNECTION (NEW)
# -----------------------------
def connect_ipc():
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect((IPC_HOST, IPC_PORT))
            s.settimeout(1.0)
            return s

        except (ConnectionRefusedError, TimeoutError):
            time.sleep(0.5)


# -----------------------------
# SHUTDOWN HANDLING
# -----------------------------
def shutdown(signum=None, frame=None):
    global shutting_down, ipc_socket

    if shutting_down:
        return
    shutting_down = True

    print("\n[Fluffy Brain] Shutting down...", file=sys.stderr)

    if ipc_socket:
        try:
            ipc_socket.close()
        except Exception:
            pass


# -----------------------------
# MAIN LOOP
# -----------------------------
def main():
    global tray, ipc_socket

    # Start Web API
    Thread(target=start_api, daemon=True).start()

    # Signals
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Tray
    tray = FluffyTray()
    tray.run()

    # Connect to Rust IPC
    ipc_socket = connect_ipc()
    print("[Fluffy Brain] Connected to IPC", file=sys.stderr)

    buffer = ""

    try:
        while not shutting_down:
            try:
                data = ipc_socket.recv(4096)
            except socket.timeout:
                continue

            if not data:
                add_execution_log("IPC disconnected. Waiting for core...", "error")
                ipc_socket.close()
                ipc_socket = connect_ipc()
                add_execution_log("Reconnected to IPC", "system")
                continue

            buffer += data.decode()

            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)

                if not line.strip():
                    continue

                try:
                    raw = json.loads(line)
                    msg = raw.get("payload", raw)

                    handle_message(msg)
                    update_state(msg)

                except json.JSONDecodeError as e:
                    print(f"[JSON ERROR] {e}", file=sys.stderr)

    finally:
        shutdown()


# -----------------------------
# MESSAGE HANDLER (UNCHANGED LOGIC)
# -----------------------------
def handle_message(msg):
    interpretations = interpret(msg)
    recommendations = recommend(msg)
    add_execution_log("Telemetry received from core", "system")

    # Expose to UI
    msg["_insights"] = interpretations
    msg["_recommendations"] = recommendations

    signals = msg.get("signals", {})
    mem_level = signals.get("memory_pressure", "LOW")
    cpu_level = signals.get("cpu_pressure", "NORMAL")

    tray_level = mem_level if mem_level in ("HIGH", "CRITICAL") else cpu_level
    tray.set_status(tray_level)

    if interpretations:
        print("\n[Fluffy Insight]")
        for line in interpretations:
            print(f"• {line}")

    if recommendations:
        print("\n[Fluffy Suggestion]")
        for rec in recommendations:
            print(f"→ {rec}")


if __name__ == "__main__":
    main()
