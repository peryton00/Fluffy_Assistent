"""
Network / LAN Distributed Monitoring Blueprint
Handles: /network/role, /network/availability/*, /network/admin/*
"""
from flask import Blueprint, jsonify, request
import state
import os
import sys
from auth_utils import token_required

network_bp = Blueprint('network', __name__)

# FLUFFY_TOKEN removed, using auth_utils instead


def _ensure_network_path():
    net_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "fluffy", "network")
    net_path = os.path.abspath(net_path)
    if net_path not in sys.path:
        sys.path.insert(0, net_path)


# ── Role endpoints ─────────────────────────────────────────────────────────────

@network_bp.route("/network/role", methods=["GET"])
@token_required
def get_network_role():
    """Get current network role (standalone/available/admin)"""
    try:
        _ensure_network_path()
        from role_manager import get_role_manager
        role_manager = get_role_manager()
        current_role = role_manager.get_current_role()
        return jsonify({"ok": True, "role": current_role})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/role", methods=["POST"])
@token_required
def set_network_role():
    """Set network role (standalone/available/admin)"""
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
            
            # Sync with Rust Core Terminal
            import asyncio
            from routes.terminal_routes import send_ws_command
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                if role == "admin":
                    loop.run_until_complete(send_ws_command("to --admin"))
                elif role == "standalone":
                    loop.run_until_complete(send_ws_command("client --stop"))
            except Exception as err:
                print(f"[Network Route] Failed to sync role to Core: {err}")
            finally:
                loop.close()

            return jsonify({"ok": True, "message": message})
        else:
            return jsonify({"error": message}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Availability endpoints ─────────────────────────────────────────────────────

@network_bp.route("/network/availability/start", methods=["POST"])
@token_required
def start_availability():
    """Start availability mode (HTTP server, no auth required)"""
    try:
        data = request.get_json(silent=True) or {}
        port = int(data.get("port", 9000))

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
@token_required
def stop_availability():
    """Stop availability mode"""
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
@token_required
def get_availability_status():
    """Get availability mode status"""
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
            "port": server._port if hasattr(server, "_port") else 9000
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/availability/connections", methods=["GET"])
@token_required
def get_availability_connections():
    """Get list of admin IPs currently connected (polling) this client."""
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
@token_required
def admin_add_machine():
    """Add a client machine to the admin's watch list."""
    try:
        data = request.get_json(silent=True)
        if not data or "ip" not in data:
            return jsonify({"error": "Missing ip"}), 400

        ip = data["ip"]
        port = int(data.get("port", 9000))

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
@token_required
def admin_remove_machine():
    """Remove a machine from the admin's watch list."""
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
@token_required
def admin_remove_all_machines():
    """Remove all machines and stop polling."""
    try:
        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        client.disconnect_all()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/machines", methods=["GET"])
@token_required
def get_admin_machines():
    """Get list of all known machines and their status."""
    try:
        _ensure_network_path()
        from client import get_admin_client
        import asyncio
        from routes.terminal_routes import fetch_ws_clients

        client = get_admin_client()
        machines = client.get_all_machines()

        # Query active TCP clients from Core Terminal bridge
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            tcp_clients = loop.run_until_complete(fetch_ws_clients())
        except Exception as err:
            print(f"[Network Route] Failed to query Core TCP clients: {err}")
            tcp_clients = []
        finally:
            loop.close()

        # Merge them
        for tc in tcp_clients:
            machines.append({
                "machine_id": f"tcp_{tc['tag']}",
                "ip": tc["ip"],
                "port": 9000,
                "name": f"{tc['hostname']} (TCP Terminal)",
                "online": True
            })

        return jsonify({
            "ok": True,
            "machines": machines,
            "active_machine": client.get_active_machine_id()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/switch", methods=["POST"])
@token_required
def admin_switch_machine():
    """Switch the active machine view."""
    try:
        data = request.get_json(silent=True)
        if not data or "machine_id" not in data:
            return jsonify({"error": "Missing machine_id"}), 400

        machine_id = data["machine_id"]
        if machine_id.startswith("tcp_"):
            # Simply report OK for switching to TCP machine in UI
            return jsonify({"ok": True})

        _ensure_network_path()
        from client import get_admin_client

        client = get_admin_client()
        if client.switch_active(machine_id):
            return jsonify({"ok": True})
        else:
            return jsonify({"error": "Machine not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/data/<machine_id>", methods=["GET"])
@token_required
def get_machine_data(machine_id):
    """Get the latest polled data for a specific machine."""
    try:
        if machine_id.startswith("tcp_"):
            tag = machine_id.replace("tcp_", "")
            import asyncio
            from routes.terminal_routes import fetch_ws_clients

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                tcp_clients = loop.run_until_complete(fetch_ws_clients())
            except Exception:
                tcp_clients = []
            finally:
                loop.close()

            client_info = next((c for c in tcp_clients if c["tag"] == tag), None)
            if client_info:
                # Return standardized metrics dictionary matching Network section
                return jsonify({
                    "ok": True,
                    "data": {
                        "system": {
                            "hostname": client_info["hostname"],
                            "os": client_info["os"],
                            "os_version": client_info["os_version"],
                            "arch": client_info["arch"],
                            "uptime": "Connected via TCP",
                        },
                        "cpu": {"usage_percent": 0.0},
                        "ram": {"total_mb": 0, "used_mb": 0, "free_mb": 0},
                        "network": {"status": "online"},
                        "processes": {"top_ram": []}
                    }
                })
            else:
                return jsonify({"error": "TCP client not found or disconnected"}), 404

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
@token_required
def admin_machine_action():
    """Execute an action on a specific machine."""
    try:
        data = request.get_json(silent=True)
        if not data or "machine_id" not in data or "action" not in data:
            return jsonify({"error": "Missing machine_id or action"}), 400

        machine_id = data["machine_id"]
        action_payload = data.get("payload", {})
        action_name = data["action"]

        if machine_id.startswith("tcp_"):
            tag = machine_id.replace("tcp_", "")
            import asyncio
            from routes.terminal_routes import send_ws_command

            # Route actions directly over WS connection to the terminal
            cmd_text = f"{tag} {action_name}"
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                success = loop.run_until_complete(send_ws_command(cmd_text))
            except Exception as err:
                print(f"[Network Route] Action routing failed: {err}")
                success = False
            finally:
                loop.close()
            
            if success:
                state.add_execution_log(f"Admin: executed '{action_name}' on TCP machine {tag}", "system")
                return jsonify({"ok": True, "result": f"Command '{cmd_text}' sent successfully"})
            else:
                return jsonify({"error": "Failed to send command to TCP agent"}), 500

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
