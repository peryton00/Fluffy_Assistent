"""
Cluster Management Blueprint
Handles: /cluster/start_manager, /cluster/start_worker, /cluster/stop,
         /cluster/status, /cluster/credentials, /cluster/submit_task, /cluster/logs
"""
from flask import Blueprint, jsonify, request
import state
import os
import sys
import json

cluster_bp = Blueprint('cluster', __name__)

FLUFFY_TOKEN = "fluffy_dev_token"


def _ensure_services_path():
    services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "services")
    services_path = os.path.abspath(services_path)
    if services_path not in sys.path:
        sys.path.insert(0, services_path)


@cluster_bp.route("/cluster/start_manager", methods=["POST"])
def start_cluster_manager_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        _ensure_services_path()
        from cluster import start_cluster_manager
        data = request.get_json(silent=True) or {}
        port = data.get("port", 5050)
        result = start_cluster_manager(port)
        if result["status"] == "started":
            state.add_execution_log(f"Cluster Manager started on {result['manager_ip']}:{result['port']}", "action")
        return jsonify(result)
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/cluster/start_worker", methods=["POST"])
def start_cluster_worker_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        _ensure_services_path()
        from cluster import start_cluster_worker
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Missing configuration"}), 400
        manager_ip = data.get("manager_ip")
        port = data.get("port", 5050)
        username = data.get("username")
        password = data.get("password")
        if not all([manager_ip, username, password]):
            return jsonify({"error": "Missing required fields: manager_ip, username, password"}), 400
        result = start_cluster_worker(manager_ip, port, username, password)
        if result["status"] == "connected":
            state.add_execution_log(f"Cluster Worker connected to {manager_ip}:{port}", "action")
        return jsonify(result)
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/cluster/stop", methods=["POST"])
def stop_cluster_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        _ensure_services_path()
        from cluster import stop_cluster_manager, stop_cluster_worker
        stop_cluster_manager()
        stop_cluster_worker()
        state.add_execution_log("Cluster service stopped", "action")
        return jsonify({"ok": True, "status": "stopped"})
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/cluster/status", methods=["GET"])
def cluster_status_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        _ensure_services_path()
        from cluster import get_cluster_status, get_worker_status
        manager_status = get_cluster_status()
        if manager_status["status"] == "running":
            return jsonify({"mode": "manager", **manager_status})
        worker_status = get_worker_status()
        if worker_status["status"] in ["connected", "disconnected"]:
            return jsonify({"mode": "worker", **worker_status})
        return jsonify({"mode": "disabled", "status": "stopped"})
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/cluster/credentials", methods=["GET"])
def get_cluster_credentials():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        _ensure_services_path()
        from cluster import get_or_create_credentials
        credentials = get_or_create_credentials()
        return jsonify({"ok": True, "credentials": credentials})
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/cluster/submit_task", methods=["POST"])
def submit_cluster_task_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        _ensure_services_path()
        from cluster import submit_cluster_task
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Missing task data"}), 400
        task_type = data.get("task_type", "process_file")
        description = data.get("description", "")
        payload = data.get("payload", {})
        result = submit_cluster_task(task_type, description, payload)
        if result["status"] == "created":
            state.add_execution_log(f"Cluster task submitted: {description}", "action")
        return jsonify(result)
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@cluster_bp.route("/cluster/logs", methods=["GET"])
def get_cluster_logs():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        log_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "services", "cluster", "logs", "cluster_logs.json")
        log_file = os.path.abspath(log_file)
        if not os.path.exists(log_file):
            return jsonify({"ok": True, "logs": []})
        with open(log_file, 'r') as f:
            logs = json.load(f)
        return jsonify({"ok": True, "logs": logs[-50:]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
