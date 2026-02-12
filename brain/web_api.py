from flask import Flask, jsonify, send_from_directory, request
import state
from commands import send_command
import os
import socket
import json
import sys

app = Flask(__name__)


@app.after_request
def add_csp_headers(response):
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self'; "
        "connect-src 'self';"
    )
    return response


@app.route("/.well-known/appspecific/<path:_>")
def chrome_probe(_):
    return "", 204


@app.route("/")
def root():
    return jsonify({"service": "Fluffy Brain API", "status": "active", "dashboard": "Tauri (Native) Only"})


@app.route("/status")
def status():
    if not state.UI_ACTIVE:
        return jsonify({"error": "UI Disconnected"}), 403
    
    if state.SHUTDOWN_MODE:
        return jsonify({"status": "shutdown"})

    with state.LOCK:
        if state.LATEST_STATE is None:
            return jsonify({"status": "initializing"})
        full_state = state.LATEST_STATE.copy()
    
    full_state["pending_confirmations"] = state.get_confirmations()
    full_state["security_alerts"] = state.SECURITY_ALERTS
    full_state["notifications"] = state.get_notifications()
    return jsonify(full_state)


@app.route("/logs")
def logs():
    if not state.UI_ACTIVE:
        return jsonify({"error": "UI Disconnected"}), 403
    return jsonify(state.EXECUTION_LOGS)


# Hardcoded token for development
FLUFFY_TOKEN = "fluffy_dev_token"

@app.route("/command", methods=["POST"])
def command():
    # 1. Restrict to loopback
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden - Loopback execution only"}), 403

    # 2. Token guard
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized - Invalid token"}), 401

    # 3. Validate JSON payload
    cmd_data = request.get_json(silent=True)
    if not cmd_data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    # 4. Handle confirmation removal if applicable
    if "Confirm" in cmd_data:
        state.remove_confirmation(cmd_data["Confirm"]["command_id"])
    elif "Cancel" in cmd_data:
        state.remove_confirmation(cmd_data["Cancel"]["command_id"])

    send_command(cmd_data)
    return jsonify({"ok": True})


@app.route("/security_action", methods=["POST"])
def security_action():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    if not data or "pid" not in data or "action" not in data:
        return jsonify({"error": "Invalid payload"}), 400
    
    pid = int(data["pid"])
    action = data["action"]
    
    # 1. Resolve Name from State
    process_name = None
    if state.LATEST_STATE:
        procs = state.LATEST_STATE.get("system", {}).get("processes", {}).get("top_ram", [])
        for p in procs:
            if p["pid"] == pid:
                process_name = p["name"]
                break
    
    # 2. Update Monitors and Memory
    from guardian_manager import GUARDIAN_MEMORY, GUARDIAN_AUDIT
    
    if state.MONITOR:
        if action == "ignore":
            state.MONITOR.mark_ignored(pid)
            if process_name:
                GUARDIAN_MEMORY.mark_ignored(process_name)
                GUARDIAN_AUDIT.log_event("UserDecision", process_name, {"action": "Ignore"})
            state.add_execution_log(f"Process {pid} ignored by user", "info")
        elif action == "trust":
            state.MONITOR.mark_trusted(pid)
            if process_name:
                GUARDIAN_MEMORY.mark_trusted(process_name)
                GUARDIAN_AUDIT.log_event("UserDecision", process_name, {"action": "Trust"})
            state.add_execution_log(f"Process {pid} marked as trusted", "info")
        elif action == "mark_dangerous" and process_name: # Extended action for phase 11
            GUARDIAN_MEMORY.mark_dangerous(process_name)
            GUARDIAN_AUDIT.log_event("UserDecision", process_name, {"action": "Mark Dangerous"})
            state.add_execution_log(f"Process {process_name} marked as DANGEROUS", "warning")
            
    return jsonify({"ok": True})


@app.route("/trust_process", methods=["POST"])
def trust_process():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    process_name = data.get("process")
    if not process_name:
        return jsonify({"error": "Missing process name"}), 400
    
    from guardian_manager import GUARDIAN_BASELINE
    import time
    
    baseline = GUARDIAN_BASELINE.get_baseline(process_name)
    if not baseline:
        # Create minimal baseline entry for newly trusted process
        GUARDIAN_BASELINE.baselines[process_name] = {
            "trusted": True,
            "samples": 0,
            "first_seen": time.time(),
            "last_seen": time.time(),
            "avg_cpu": 0.0,
            "peak_cpu": 0.0,
            "avg_ram": 0.0,
            "peak_ram": 0.0,
            "ram_growth_rate": 0.0,
            "avg_children": 0.0,
            "child_spawn_rate": 0.0,
            "avg_net_sent": 0.0,
            "avg_net_received": 0.0,
            "avg_lifespan": 0.0,
            "restart_count": 0
        }
        GUARDIAN_BASELINE.save()
        state.add_execution_log(f"Manual trust: {process_name} marked as trusted (baseline created)", "info")
    else:
        GUARDIAN_BASELINE.mark_trusted(process_name)
        state.add_execution_log(f"Manual trust: {process_name} behaviors are now whitelisted", "info")
    
    return jsonify({"ok": True, "message": f"Behavior for {process_name} marked as trusted."})


@app.route("/clear_guardian_data", methods=["POST"])
def clear_guardian_data():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    from guardian_manager import reset_guardian
    reset_guardian()
    return jsonify({"ok": True, "message": "All Guardian recognition data cleared and state reset. Re-entering learning phase."})





@app.route("/normalize", methods=["POST"])
def normalize_system():
    # 1. Trigger Rust Normalization via IPC
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", 9002))
        s.sendall((json.dumps("NormalizeSystem") + "\n").encode())
        s.close()
    except Exception as e:
        state.add_execution_log(f"Normalization failed: {e}", "error")
        return jsonify({"error": f"Failed to reach core: {e}"}), 500

    # 2. Check for unusual processes
    unusual = []
    if state.MONITOR:
        unusual = state.MONITOR.get_unusual_processes()

    state.add_execution_log("System normalization initiated", "action")
    
    return jsonify({
        "ok": True,
        "cleanup": "Temp files cleanup triggered",
        "settings": "Volume (50%), Brightness (70%) reset",
        "unusual_processes": unusual
    })


@app.route("/ui_connected", methods=["GET", "POST"])
def ui_connected():
    if not state.UI_ACTIVE:
        state.UI_ACTIVE = True
        state.add_execution_log("UI Dashboard connected", "system")
    return jsonify({"status": "UI_CONNECTED", "ui_active": state.UI_ACTIVE})


@app.route("/ui_disconnected", methods=["GET", "POST"])
def ui_disconnected():
    if state.UI_ACTIVE:
        state.UI_ACTIVE = False
        state.add_execution_log("UI Dashboard disconnected", "system")
    return jsonify({"status": "UI_DISCONNECTED", "ui_active": state.UI_ACTIVE})


# Browser Dashboard (ui/frontend) routes removed per user request.



@app.route("/net-speed", methods=["POST"])
def net_speed():
    if not state.UI_ACTIVE:
        return jsonify({"error": "UI Disconnected"}), 403
    
    import net_utils
    
    state.add_execution_log("Initiating network speed test...", "action")
    
    # We run it synchronously for simplicity in this dev environment.
    speed = net_utils.run_speed_test()
    latency = net_utils.get_ping()
    
    state.add_execution_log(f"Speed test complete: {speed} Mbps, Latency: {latency} ms", "info")
    
    return jsonify({
        "status": "success",
        "download_mbps": speed,
        "ping_ms": latency
    })

def start_api():
    app.run(host="127.0.0.1", port=5123, debug=False, use_reloader=False)
