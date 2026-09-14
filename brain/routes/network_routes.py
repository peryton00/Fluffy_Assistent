"""
Network / LAN Distributed Monitoring Blueprint

Role and machine management now delegated to Rust core via WS bridge (port 9003).
Python is a thin HTTP proxy — it translates REST calls to Rust REPL commands and
reads back IPC telemetry already in state.LATEST_STATE.
"""
from flask import Blueprint, jsonify, request
import state
import os
import sys
import asyncio
import socket as _socket
from auth_utils import token_required

network_bp = Blueprint('network', __name__)

# ── Role state (local cache, mirrors Rust state) ───────────────────────────────
_current_role = "standalone"


def _send_ws(cmd: str) -> bool:
    """Send a command to Rust core via WS bridge. Synchronous wrapper."""
    from routes.terminal_routes import send_ws_command
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(send_ws_command(cmd))
    except Exception as e:
        print(f"[NetworkRoute] WS command failed: {e}")
        return False
    finally:
        loop.close()


def _local_ip() -> str:
    try:
        s = _socket.socket(_socket.AF_INET, _socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ── Role endpoints ─────────────────────────────────────────────────────────────

@network_bp.route("/network/role", methods=["GET"])
@token_required
def get_network_role():
    return jsonify({"ok": True, "role": _current_role})


@network_bp.route("/network/role", methods=["POST"])
@token_required
def set_network_role():
    global _current_role
    data = request.get_json(silent=True)
    if not data or "role" not in data:
        return jsonify({"error": "Missing role parameter"}), 400

    role = data["role"]
    if role not in ("standalone", "available", "admin"):
        return jsonify({"error": f"Invalid role: {role}"}), 400

    # Tell Rust core to start/stop monitor server + update its mode
    ok = _send_ws(f"network --role {role}")
    if ok:
        _current_role = role
        state.add_execution_log(f"Network role changed to: {role}", "system")
        return jsonify({"ok": True, "message": f"Role changed to {role}"})
    else:
        return jsonify({"error": "Failed to communicate with Rust core"}), 500


# ── Availability status ────────────────────────────────────────────────────────

@network_bp.route("/network/availability/start", methods=["POST"])
@token_required
def start_availability():
    """Start availability mode (port 9010 HTTP monitor server in Rust)."""
    global _current_role
    data = request.get_json(silent=True) or {}
    port = int(data.get("port", 9010))
    ok = _send_ws(f"network --role available")
    if ok:
        _current_role = "available"
        state.add_execution_log(f"Availability mode started on port {port}", "system")
        return jsonify({"ok": True, "message": f"Availability server started on port {port}"})
    return jsonify({"error": "Failed to start availability server"}), 500


@network_bp.route("/network/availability/stop", methods=["POST"])
@token_required
def stop_availability():
    global _current_role
    ok = _send_ws("network --role standalone")
    if ok:
        _current_role = "standalone"
        state.add_execution_log("Availability mode stopped", "system")
        return jsonify({"ok": True, "message": "Availability server stopped"})
    return jsonify({"error": "Failed to stop availability server"}), 500


@network_bp.route("/network/availability/status", methods=["GET"])
@token_required
def get_availability_status():
    running = _current_role == "available"
    return jsonify({
        "ok": True,
        "running": running,
        "ip": _local_ip(),
        "port": 9010
    })


@network_bp.route("/network/availability/connections", methods=["GET"])
@token_required
def get_availability_connections():
    """Connected admins tracked by Rust monitor server (best-effort from LATEST_STATE)."""
    admins = []
    try:
        latest = state.LATEST_STATE or {}
        admins = latest.get("active_admins", [])
    except Exception:
        pass
    return jsonify({"ok": True, "admins": admins})


# ── Admin endpoints ────────────────────────────────────────────────────────────

@network_bp.route("/network/admin/add", methods=["POST"])
@token_required
def admin_add_machine():
    """Tell Rust core to connect to a remote machine's monitor server."""
    data = request.get_json(silent=True)
    if not data or "ip" not in data:
        return jsonify({"error": "Missing ip"}), 400

    ip_raw = str(data["ip"]).strip()
    port = int(data.get("port", 9010))

    # Sanitize IP: strip scheme, CIDR, embedded port
    if "://" in ip_raw:
        ip_raw = ip_raw.split("://", 1)[1]
    if "/" in ip_raw:
        ip_raw = ip_raw.split("/")[0]
    if ":" in ip_raw:
        parts = ip_raw.split(":")
        ip = parts[0].strip()
        try:
            port = int(parts[1])
        except Exception:
            pass
    else:
        ip = ip_raw.strip()

    if not ip:
        return jsonify({"error": "Invalid IP address"}), 400

    cmd = f"network --connect {ip} --port {port}"
    ok = _send_ws(cmd)
    if ok:
        state.add_execution_log(f"Admin: connecting to {ip}:{port}", "system")
        # machine_id comes back via IPC broadcast — return optimistic OK
        return jsonify({"ok": True, "message": f"Connection to {ip}:{port} initiated"})
    else:
        return jsonify({"error": f"Could not send connect command to Rust core"}), 500


@network_bp.route("/network/admin/remove", methods=["POST"])
@token_required
def admin_remove_machine():
    data = request.get_json(silent=True)
    if not data or "machine_id" not in data:
        return jsonify({"error": "Missing machine_id"}), 400
    ok = _send_ws(f"network --disconnect {data['machine_id']}")
    return jsonify({"ok": True}) if ok else jsonify({"error": "Rust core unreachable"}), 500


@network_bp.route("/network/admin/remove_all", methods=["POST"])
@token_required
def admin_remove_all_machines():
    ok = _send_ws("network --disconnect-all")
    return jsonify({"ok": True}) if ok else jsonify({"error": "Rust core unreachable"}), 500


@network_bp.route("/network/admin/machines", methods=["GET"])
@token_required
def get_admin_machines():
    """Return connected machines. Rust pushes list via IPC; read from state cache."""
    machines = []
    try:
        latest = state.LATEST_STATE or {}
        machines = latest.get("admin_machines", [])
    except Exception:
        pass

    # Also merge TCP terminal clients from WS bridge
    try:
        from routes.terminal_routes import fetch_ws_clients
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            tcp_clients = loop.run_until_complete(fetch_ws_clients())
        except Exception:
            tcp_clients = []
        finally:
            loop.close()

        for tc in tcp_clients:
            machines.append({
                "machine_id": f"tcp_{tc['tag']}",
                "ip": tc["ip"],
                "port": 9000,
                "name": f"{tc['hostname']} (TCP Terminal)",
                "online": True
            })
    except Exception:
        pass

    return jsonify({"ok": True, "machines": machines, "active_machine": None})


@network_bp.route("/network/admin/switch", methods=["POST"])
@token_required
def admin_switch_machine():
    data = request.get_json(silent=True)
    if not data or "machine_id" not in data:
        return jsonify({"error": "Missing machine_id"}), 400
    # Purely UI-side selection — no Rust action needed
    return jsonify({"ok": True})


@network_bp.route("/network/admin/data/<machine_id>", methods=["GET"])
@token_required
def get_machine_data(machine_id):
    """Get latest polled data for a specific remote machine."""
    # Rust pushes remote_telemetry into LATEST_STATE.remote_machines keyed by machine_id
    try:
        latest = state.LATEST_STATE or {}
        remote_machines = latest.get("remote_machines", {})
        if machine_id in remote_machines:
            return jsonify({"ok": True, "data": remote_machines[machine_id]})

        # Fallback: TCP terminal client
        if machine_id.startswith("tcp_"):
            tag = machine_id.replace("tcp_", "")
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
                return jsonify({
                    "ok": True,
                    "data": {
                        "system": {
                            "hostname": client_info["hostname"],
                            "os": client_info["os"],
                            "os_version": client_info.get("os_version", ""),
                            "arch": client_info.get("arch", ""),
                        },
                        "cpu": {"usage_percent": 0.0},
                        "ram": {"total_mb": 0, "used_mb": 0, "free_mb": 0},
                        "network": {"status": "online"},
                        "processes": {"top_ram": []}
                    }
                })

        return jsonify({"error": "No data available yet"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@network_bp.route("/network/admin/action", methods=["POST"])
@token_required
def admin_machine_action():
    """Execute an action on a remote machine."""
    data = request.get_json(silent=True)
    if not data or "machine_id" not in data or "action" not in data:
        return jsonify({"error": "Missing machine_id or action"}), 400

    machine_id = data["machine_id"]
    action_name = data["action"]

    if machine_id.startswith("tcp_"):
        tag = machine_id.replace("tcp_", "")
        cmd_text = f"{tag} {action_name}"
        ok = _send_ws(cmd_text)
        if ok:
            state.add_execution_log(f"Admin: '{action_name}' on TCP machine {tag}", "system")
            return jsonify({"ok": True, "result": f"Command sent to {tag}"})
        return jsonify({"error": "Failed to send command"}), 500

    # For HTTP-polled machines: forward via Rust (future: action over monitor channel)
    # For now return not-implemented gracefully
    return jsonify({"error": "Actions on HTTP-polled machines not yet supported"}), 501


# ── Network snapshot (for NetworkSystemsView) ──────────────────────────────────

@network_bp.route("/network/snapshot", methods=["GET"])
@token_required
def get_network_snapshot():
    """Coherent snapshot of network state — built from Rust IPC data."""
    try:
        from brain.runtime.local_network_service import get_local_network_service
        service = get_local_network_service()
        local_snap = service.get_observation_snapshot()
    except Exception:
        local_snap = {}

    import time
    now_ms = int(time.time() * 1000)
    nodes = []

    # Remote machines from Rust IPC
    try:
        latest = state.LATEST_STATE or {}
        for m in latest.get("admin_machines", []):
            nodes.append({
                "id": m.get("machine_id", f"node_{m.get('ip')}"),
                "name": m.get("name", m.get("ip", "Remote Node")),
                "hostname": m.get("name"),
                "os": "unknown",
                "arch": "unknown",
                "role": "worker",
                "availability": "connected" if m.get("online") else "available",
                "auth_state": "authenticated" if m.get("online") else "unauthenticated",
                "pairing_state": "paired" if m.get("online") else "unpaired",
                "ip_addresses": [m["ip"]] if m.get("ip") else [],
                "cluster_port": m.get("port", 9010),
                "last_seen_epoch": now_ms / 1000,
            })
    except Exception:
        pass

    # Local node if in available mode
    if _current_role == "available":
        nodes.append({
            "id": f"local_node_{_local_ip().replace('.', '_')}",
            "name": f"Local Host ({_local_ip()})",
            "hostname": _socket.gethostname(),
            "os": sys.platform,
            "arch": "x86_64",
            "role": "available",
            "availability": "available",
            "auth_state": "unauthenticated",
            "pairing_state": "unpaired",
            "ip_addresses": [_local_ip()],
            "cluster_port": 9010,
            "last_seen_epoch": now_ms / 1000,
        })

    raw_devices = local_snap.get("devices", [])
    devices = []
    for d in raw_devices:
        ip = d.get("ip_address", "")
        mac = d.get("mac_address")
        dev_id = d.get("id") or (f"dev_{mac.replace(':', '').replace('-', '').lower()}" if mac else (f"dev_{ip.replace('.', '_')}" if ip else None))
        if not dev_id:
            continue
        dev = dict(d)
        dev["id"] = dev_id
        dev["category"] = dev.get("category") or ("infrastructure" if dev.get("is_gateway") else "endpoint")
        dev["state"] = dev.get("state") or "reachable"
        dev["source"] = dev.get("source") or "discovery"
        dev["is_fluffy_node"] = dev.get("is_fluffy_node", False)
        devices.append(dev)

    snapshot = {
        "revision": 1,
        "captured_at_epoch_ms": now_ms,
        "nodes": nodes,
        "devices": devices,
        "connections": local_snap.get("flows", []),
        "interfaces": local_snap.get("interfaces", []),
        "traffic": {
            "bytes_in": 0, "bytes_out": 0,
            "packets_in": 0, "packets_out": 0,
            "current_in_rate_bps": 0.0,
            "current_out_rate_bps": 0.0,
            "recorded_at_epoch_ms": now_ms,
        }
    }
    return jsonify({"ok": True, "data": snapshot})


@network_bp.route("/network/capabilities", methods=["GET"])
@token_required
def get_network_capabilities():
    return jsonify({
        "ok": True,
        "capabilities": ["monitor_server", "admin_connect", "tcp_mesh"],
        "monitor_port": 9010,
        "mesh_port": 9000
    })
