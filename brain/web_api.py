from flask import Flask, jsonify, send_from_directory, request
import state
from commands import send_command
import os

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
    ui_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "ui", "frontend")
    )
    return send_from_directory(ui_path, "index.html")


@app.route("/status")
def status():
    if state.LATEST_STATE is None:
        return jsonify({"status": "initializing"})
    
    full_state = state.LATEST_STATE.copy()
    full_state["pending_confirmations"] = state.get_confirmations()
    return jsonify(full_state)


@app.route("/logs")
def logs():
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


@app.route("/<path:filename>")
def static_files(filename):
    ui_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "ui", "frontend")
    )
    return send_from_directory(ui_path, filename)


def start_api():
    app.run(host="127.0.0.1", port=5123, debug=False, use_reloader=False)
