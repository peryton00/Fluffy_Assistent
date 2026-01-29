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
    return jsonify(state.LATEST_STATE)


@app.route("/logs")
def logs():
    return jsonify(state.EXECUTION_LOGS)


@app.route("/command", methods=["POST"])
def command():
    send_command(request.json)
    return jsonify({"ok": True})


@app.route("/<path:filename>")
def static_files(filename):
    ui_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "ui", "frontend")
    )
    return send_from_directory(ui_path, filename)


def start_api():
    app.run(host="127.0.0.1", port=5123, debug=False, use_reloader=False)
