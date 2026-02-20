"""
Network / LAN Distributed Monitoring Blueprint
Handles: /network/role, /network/availability/*, /network/admin/*
"""
from flask import Blueprint, jsonify, request
import state
import os
import sys

network_bp = Blueprint('network', __name__)

FLUFFY_TOKEN = "fluffy_dev_token"


def _ensure_network_path():
    net_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "fluffy", "network")
    net_path = os.path.abspath(net_path)
    if net_path not in sys.path:
        sys.path.insert(0, net_path)


# ── Role endpoints ─────────────────────────────────────────────────────────────

@network_bp.route("/network/role", methods=["GET"])
def get_network_role():
    """Get current network role (standalone/available/admin)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_network_path()
        from role_manager import get_role_manager
        role_manager = get_role_manager()
        current_role = role_manager.get_current_role()
        return jsonify({"ok": True, "role": current_role})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/role", methods=["POST"])
def set_network_role():
    """Set network role (standalone/available/admin)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json(silent=True)
        if not data or "role" not in data:
            return jsonify({"error": "Missing role parameter"}), 400
        
        role = data["role"]
        _ensure_network_path()
        from role_manager import get_role_manager
        
        role_manager = get_role_manager()
        success, message = role_manager.set_role(role)
        
        if success:
            state.add_execution_log(f"Network role changed to: {role}", "system")
            return jsonify({"ok": True, "message": message})
        else:
            return jsonify({"error": message}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Availability endpoints ─────────────────────────────────────────────────────

@network_bp.route("/network/availability/start", methods=["POST"])
def start_availability():
    """Start availability mode (HTTP server, no auth required)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json(silent=True) or {}
        port = int(data.get("port", 8765))

        _ensure_network_path()
        from server import get_availability_server

        server = get_availability_server(port=port)
        if not server.start():
            return jsonify({"error": "Failed to start availability server"}), 500

        state.add_execution_log(f"Availability mode started on port {port}", "system")
        return jsonify({
            "ok": True,
            "message": f"Availability server started on port {port}"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/availability/stop", methods=["POST"])
def stop_availability():
    """Stop availability mode"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        _ensure_network_path()
        from server import get_availability_server

        server = get_availability_server()
        server.stop()

        state.add_execution_log("Availability mode stopped", "system")
        return jsonify({"ok": True, "message": "Availability server stopped"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/availability/status", methods=["GET"])
def get_availability_status():
    """Get availability mode status"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        _ensure_network_path()
        from server import get_availability_server

        server = get_availability_server()
        running = server.is_running()

        import socket as _socket
        local_ip = "127.0.0.1"
        try:
            s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            pass

        return jsonify({
            "ok": True,
            "running": running,
            "ip": local_ip,
            "port": server._port if hasattr(server, "_port") else 8765
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/availability/connections", methods=["GET"])
def get_availability_connections():
    """Get list of admin IPs currently connected (polling) this client."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        _ensure_network_path()
        from server import get_availability_server

        server = get_availability_server()
        admins = server.get_active_admins() if server.is_running() else []
        return jsonify({"ok": True, "admins": admins})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Admin endpoints ────────────────────────────────────────────────────────────

@network_bp.route("/network/admin/add", methods=["POST"])
def admin_add_machine():
    """Add a client machine to the admin's watch list."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json(silent=True)
        if not data or "ip" not in data:
            return jsonify({"error": "Missing ip"}), 400

        ip = data["ip"]
        port = int(data.get("port", 8765))

        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        success, result = client.add_machine(ip, port)

        if success:
            state.add_execution_log(f"Admin: added machine {ip}:{port}", "system")
            return jsonify({"ok": True, "machine_id": result})
        else:
            return jsonify({"error": result}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/remove", methods=["POST"])
def admin_remove_machine():
    """Remove a machine from the admin's watch list."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json(silent=True)
        if not data or "machine_id" not in data:
            return jsonify({"error": "Missing machine_id"}), 400

        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        if client.remove_machine(data["machine_id"]):
            return jsonify({"ok": True})
        else:
            return jsonify({"error": "Machine not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/remove_all", methods=["POST"])
def admin_remove_all_machines():
    """Remove all machines and stop polling."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        client.disconnect_all()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/machines", methods=["GET"])
def get_admin_machines():
    """Get list of all known machines and their status."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        return jsonify({
            "ok": True,
            "machines": client.get_all_machines(),
            "active_machine": client.get_active_machine_id()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/switch", methods=["POST"])
def admin_switch_machine():
    """Switch the active machine view."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json(silent=True)
        if not data or "machine_id" not in data:
            return jsonify({"error": "Missing machine_id"}), 400

        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        if client.switch_active(data["machine_id"]):
            return jsonify({"ok": True})
        else:
            return jsonify({"error": "Machine not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/data/<machine_id>", methods=["GET"])
def get_machine_data(machine_id):
    """Get the latest polled data for a specific machine."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        data = client.get_machine_data(machine_id)

        if data is not None:
            return jsonify({"ok": True, "data": data})
        else:
            return jsonify({"error": "No data available yet"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@network_bp.route("/network/admin/action", methods=["POST"])
def admin_machine_action():
    """Execute an action on a specific machine."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json(silent=True)
        if not data or "machine_id" not in data or "action" not in data:
            return jsonify({"error": "Missing machine_id or action"}), 400

        machine_id = data["machine_id"]
        action_payload = data.get("payload", {})
        action_name = data["action"]

        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        
        # Build the action data for the client
        remote_data = {"action": action_name}
        remote_data.update(action_payload)

        success, result = client.send_action(machine_id, remote_data)

        if success:
            state.add_execution_log(f"Admin: executed '{action_name}' on machine {machine_id}", "system")
            return jsonify({"ok": True, "result": result})
        else:
            return jsonify({"error": result}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
