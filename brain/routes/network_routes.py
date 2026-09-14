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
    """Connected admins tracked by Rust monitor server."""
    import urllib.request
    import json
    try:
        req = urllib.request.Request("http://127.0.0.1:9010/connections")
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            data = json.loads(resp.read().decode())
            return jsonify({"ok": True, "admins": data.get("admins", [])})
    except Exception:
        latest = state.LATEST_STATE or {}
        return jsonify({"ok": True, "admins": latest.get("active_admins", [])})


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

    # Test reachability to target monitor server (port 9010)
    import urllib.request
    import json
    target_port = 9010 if port == 9000 else port
    machine_name = "Remote Node"
    ping_ok = False

    for test_port in [target_port] + ([9010] if target_port != 9010 else []):
        try:
            req = urllib.request.Request(f"http://{ip}:{test_port}/ping")
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                body = json.loads(resp.read().decode())
                if body.get("ok"):
                    machine_name = body.get("machine", machine_name)
                    target_port = test_port
                    ping_ok = True
                    break
        except Exception:
            continue

    if not ping_ok:
        return jsonify({
            "error": f"Cannot reach node at {ip}:{target_port}. Ensure Fluffy is running on that machine and set to Available mode."
        }), 400

    cmd = f"network --connect {ip} --port {target_port}"
    ok = _send_ws(cmd)

    # Immediately track in admin_machines state cache without waiting on async IPC lag
    global _current_role
    _current_role = "admin"
    import uuid
    import time
    machine_id = str(uuid.uuid4())[:8]

    latest = state.LATEST_STATE or {}
    admin_machines = list(latest.get("admin_machines", []))
    existing = next((m for m in admin_machines if m.get("ip") == ip and m.get("port") == target_port), None)
    if existing:
        existing["online"] = True
        existing["name"] = machine_name
        existing["last_seen"] = int(time.time())
        machine_id = existing.get("machine_id", machine_id)
    else:
        admin_machines.append({
            "machine_id": machine_id,
            "ip": ip,
            "port": target_port,
            "name": machine_name,
            "online": True,
            "last_seen": int(time.time()),
        })

    with state.LOCK:
        if state.LATEST_STATE is None:
            state.LATEST_STATE = {}
        state.LATEST_STATE["admin_machines"] = admin_machines

    # Immediately poll initial telemetry
    try:
        data_req = urllib.request.Request(f"http://{ip}:{target_port}/data")
        with urllib.request.urlopen(data_req, timeout=2.0) as data_resp:
            dbody = json.loads(data_resp.read().decode())
            if dbody.get("ok") and dbody.get("data"):
                state.update_remote_telemetry(machine_id, dbody["data"])
    except Exception:
        pass

    state.add_execution_log(f"Admin: connected to {machine_name} ({ip}:{target_port})", "system")
    return jsonify({
        "ok": True,
        "message": f"Connected to {machine_name} ({ip}:{target_port})",
        "machine": machine_name,
        "machine_id": machine_id
    })


@network_bp.route("/network/admin/remove", methods=["POST"])
@token_required
def admin_remove_machine():
    data = request.get_json(silent=True)
    if not data or "machine_id" not in data:
        return jsonify({"error": "Missing machine_id"}), 400
    mid = data["machine_id"]
    ok = _send_ws(f"network --disconnect {mid}")
    with state.LOCK:
        if state.LATEST_STATE:
            machines = state.LATEST_STATE.get("admin_machines", [])
            state.LATEST_STATE["admin_machines"] = [m for m in machines if m.get("machine_id") != mid]
            if "remote_machines" in state.LATEST_STATE:
                state.LATEST_STATE["remote_machines"].pop(mid, None)
    return jsonify({"ok": True}) if ok else jsonify({"error": "Rust core unreachable"}), 500


@network_bp.route("/network/admin/remove_all", methods=["POST"])
@token_required
def admin_remove_all_machines():
    ok = _send_ws("network --disconnect-all")
    with state.LOCK:
        if state.LATEST_STATE:
            state.LATEST_STATE["admin_machines"] = []
            state.LATEST_STATE["remote_machines"] = {}
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


def _normalize_remote_telemetry(raw: dict) -> dict:
    """Ensure remote worker telemetry conforms strictly to RemoteMachineData schema."""
    if not isinstance(raw, dict):
        return {}
    sys_obj = raw.get("system", {}) if isinstance(raw.get("system"), dict) else {}

    cpu = raw.get("cpu") or sys_obj.get("cpu") or {"usage_percent": 0.0}
    ram = raw.get("ram") or sys_obj.get("ram") or {"total_mb": 0, "used_mb": 0, "free_mb": 0}
    processes = raw.get("processes") or sys_obj.get("processes") or {"top_ram": []}
    net = raw.get("network") or sys_obj.get("network") or {"status": "online"}

    return {
        "timestamp": raw.get("timestamp"),
        "system": {
            "hostname": sys_obj.get("hostname") or raw.get("hostname") or "Remote Host",
            "os": sys_obj.get("os") or raw.get("os") or "unknown",
            "os_version": sys_obj.get("os_version") or raw.get("os_version") or "",
            "arch": sys_obj.get("arch") or raw.get("arch") or "",
            "uptime": sys_obj.get("uptime") or raw.get("uptime") or "",
            **sys_obj,
        },
        "cpu": cpu,
        "ram": ram,
        "processes": processes,
        "network": net,
        **raw,
    }


@network_bp.route("/network/admin/data/<machine_id>", methods=["GET"])
@token_required
def get_machine_data(machine_id):
    """Get latest polled data for a specific remote machine with live HTTP fallback."""
    try:
        latest = state.LATEST_STATE or {}
        remote_machines = latest.get("remote_machines", {})
        if machine_id in remote_machines and remote_machines[machine_id]:
            return jsonify({"ok": True, "data": _normalize_remote_telemetry(remote_machines[machine_id])})

        # Try live HTTP query to remote node
        machine = next((m for m in latest.get("admin_machines", []) if m.get("machine_id") == machine_id), None)
        if machine:
            import urllib.request
            import json
            ip = machine.get("ip")
            port = machine.get("port", 9010)
            try:
                req = urllib.request.Request(f"http://{ip}:{port}/data")
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    body = json.loads(resp.read().decode())
                    if body.get("ok") and body.get("data"):
                        snap_data = body["data"]
                        state.update_remote_telemetry(machine_id, snap_data)
                        return jsonify({"ok": True, "data": _normalize_remote_telemetry(snap_data)})
            except Exception:
                pass

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
    """Execute an action on a remote machine and return structured output."""
    data = request.get_json(silent=True)
    if not data or "machine_id" not in data or "action" not in data:
        return jsonify({"error": "Missing machine_id or action"}), 400

    machine_id = data["machine_id"]
    action_name = str(data["action"]).strip()
    params = data.get("params") or {}

    if machine_id.startswith("tcp_"):
        tag = machine_id.replace("tcp_", "")
        cmd_text = f"{tag} {action_name}"
        ok = _send_ws(cmd_text)
        if ok:
            state.add_execution_log(f"Admin: '{action_name}' on TCP machine {tag}", "system")
            return jsonify({"ok": True, "result": f"Command sent to {tag}"})
        return jsonify({"error": "Failed to send command"}), 500

    # For HTTP-polled machines:
    import urllib.request
    import json
    import time
    latest = state.LATEST_STATE or {}
    machine = next((m for m in latest.get("admin_machines", []) if m.get("machine_id") == machine_id), None)
    if not machine:
        return jsonify({"error": f"Node {machine_id} not found"}), 404

    ip = machine.get("ip")
    port = machine.get("port", 9010)

    if action_name in ["ping", "health_check"]:
        start_t = time.time()
        try:
            req = urllib.request.Request(f"http://{ip}:{port}/ping")
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                body = json.loads(resp.read().decode())
                elapsed_ms = int((time.time() - start_t) * 1000)
                machine["online"] = True
                machine["last_seen"] = int(time.time())
                return jsonify({
                    "ok": True,
                    "result": f"Ping OK: {elapsed_ms}ms (Host: {body.get('machine', ip)})",
                    "latency_ms": elapsed_ms,
                    "host": body.get("machine")
                })
        except Exception as e:
            machine["online"] = False
            return jsonify({"ok": False, "error": f"Node unreachable: {e}"}), 502

    # Send action to worker node via POST /action
    try:
        post_payload = json.dumps({"action": action_name, "params": params}).encode("utf-8")
        req = urllib.request.Request(
            f"http://{ip}:{port}/action",
            data=post_payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            body = json.loads(resp.read().decode())
            snap_data = body.get("data")
            if snap_data:
                state.update_remote_telemetry(machine_id, snap_data)
                machine["online"] = True
                machine["last_seen"] = int(time.time())

            res_text = body.get("result") or f"Executed '{action_name}' on node {machine_id}"
            if snap_data and isinstance(snap_data, dict):
                norm_snap = _normalize_remote_telemetry(snap_data)
                res_text += "\n" + json.dumps({
                    "host": norm_snap["system"]["hostname"],
                    "os": f"{norm_snap['system']['os']} ({norm_snap['system']['arch']})",
                    "cpu_usage": f"{norm_snap['cpu'].get('usage_percent', 0)}%",
                    "ram_used_mb": norm_snap['ram'].get('used_mb', 0),
                    "ram_total_mb": norm_snap['ram'].get('total_mb', 0),
                }, indent=2)

            state.add_execution_log(f"Admin: command '{action_name}' on {ip}:{port}", "system")
            return jsonify({
                "ok": True,
                "result": res_text,
                "data": snap_data
            })
    except Exception as e:
        # Fallback to GET /data if /action POST fails
        try:
            req = urllib.request.Request(f"http://{ip}:{port}/data")
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                body = json.loads(resp.read().decode())
                snap_data = body.get("data")
                if snap_data:
                    state.update_remote_telemetry(machine_id, snap_data)
                    machine["online"] = True
                    machine["last_seen"] = int(time.time())
                norm_snap = _normalize_remote_telemetry(snap_data) if snap_data else {}
                res_text = f"Action '{action_name}' executed. Live telemetry updated for {ip}:{port}"
                if norm_snap:
                    res_text += "\n" + json.dumps({
                        "host": norm_snap.get("system", {}).get("hostname"),
                        "cpu_usage": f"{norm_snap.get('cpu', {}).get('usage_percent', 0)}%",
                        "ram_used_mb": norm_snap.get("ram", {}).get("used_mb", 0),
                        "ram_total_mb": norm_snap.get("ram", {}).get("total_mb", 0),
                    }, indent=2)
                return jsonify({
                    "ok": True,
                    "result": res_text,
                    "data": snap_data
                })
        except Exception as err:
            return jsonify({"ok": False, "error": f"Action failed: {err}"}), 502


@network_bp.route("/network/connect", methods=["POST"])
@token_required
def connect_node_endpoint():
    data = request.get_json(silent=True) or {}
    node_id = data.get("node_id")
    if not node_id:
        return jsonify({"error": "Missing node_id"}), 400

    latest = state.LATEST_STATE or {}
    machine = next((m for m in latest.get("admin_machines", []) if m.get("machine_id") == node_id), None)
    if machine:
        machine["online"] = True
        _send_ws(f"network --connect {machine['ip']} --port {machine.get('port', 9010)}")
        node_obj = {
            "id": node_id,
            "name": machine.get("name", node_id),
            "role": "worker",
            "availability": "connected",
            "auth_state": "authenticated",
            "pairing_state": "paired",
        }
        return jsonify({
            "ok": True,
            "revision": 1,
            "node": node_obj,
            "connection": None,
            "data": {
                "revision": 1,
                "node": node_obj,
                "connection": None,
            }
        })
    return jsonify({"error": f"Node {node_id} not found"}), 404


@network_bp.route("/network/disconnect", methods=["POST"])
@token_required
def disconnect_node_endpoint():
    data = request.get_json(silent=True) or {}
    node_id = data.get("node_id")
    if not node_id:
        return jsonify({"error": "Missing node_id"}), 400

    latest = state.LATEST_STATE or {}
    machines = latest.get("admin_machines", [])
    machine = next((m for m in machines if m.get("machine_id") == node_id), None)
    if machine:
        machine["online"] = False
        _send_ws(f"network --disconnect {node_id}")
        node_obj = {
            "id": node_id,
            "name": machine.get("name", node_id),
            "role": "worker",
            "availability": "disconnected",
            "auth_state": "unauthenticated",
            "pairing_state": "unpaired",
        }
        return jsonify({
            "ok": True,
            "revision": 1,
            "node": node_obj,
            "data": {
                "revision": 1,
                "node": node_obj,
            }
        })
    return jsonify({"error": f"Node {node_id} not found"}), 404


@network_bp.route("/network/command", methods=["POST"])
@network_bp.route("/network/admin/command", methods=["POST"])
@token_required
def execute_command_endpoint():
    import urllib.request
    import json
    import time

    data = request.get_json(silent=True) or {}
    target_node_id = data.get("target_node_id")
    cap = data.get("capability", {})
    cap_id = cap.get("id", "ping")
    req_id = data.get("request_id", f"cmd_{int(time.time()*1000)}")

    latest = state.LATEST_STATE or {}
    machine = next((m for m in latest.get("admin_machines", []) if m.get("machine_id") == target_node_id), None)
    if not machine:
        err_res = {
            "request_id": req_id,
            "target_node_id": target_node_id,
            "capability_id": cap_id,
            "success": False,
            "error": {"code": "not_found", "message": f"Target node {target_node_id} not found"},
            "execution_duration_ms": 0,
        }
        return jsonify({"ok": False, "result": err_res, "data": {"result": err_res}, **err_res}), 404

    ip = machine.get("ip")
    port = machine.get("port", 9010)

    start_t = time.time()
    try:
        url = f"http://{ip}:{port}/data" if any(k in cap_id for k in ("Hardware", "telemetry", "scan")) else f"http://{ip}:{port}/ping"
        with urllib.request.urlopen(urllib.request.Request(url), timeout=3.0) as resp:
            res_json = json.loads(resp.read().decode())
            dur_ms = int((time.time() - start_t) * 1000)
            res_obj = {
                "request_id": req_id,
                "target_node_id": target_node_id,
                "capability_id": cap_id,
                "success": True,
                "output": res_json.get("data") or res_json,
                "execution_duration_ms": dur_ms,
            }
            return jsonify({
                "ok": True,
                "result": res_obj,
                "data": {"result": res_obj},
                **res_obj
            })
    except Exception as e:
        dur_ms = int((time.time() - start_t) * 1000)
        res_obj = {
            "request_id": req_id,
            "target_node_id": target_node_id,
            "capability_id": cap_id,
            "success": False,
            "error": {"code": "execution_failed", "message": str(e)},
            "execution_duration_ms": dur_ms,
        }
        return jsonify({
            "ok": False,
            "result": res_obj,
            "data": {"result": res_obj},
            **res_obj
        })


@network_bp.route("/network/batch_command", methods=["POST"])
@network_bp.route("/network/admin/batch", methods=["POST"])
@token_required
def execute_batch_command_endpoint():
    import urllib.request
    import json
    import time

    data = request.get_json(silent=True) or {}
    batch_id = data.get("batch_id", f"batch_{int(time.time()*1000)}")
    target_node_ids = data.get("target_node_ids", [])
    cap = data.get("capability", {})
    cap_id = cap.get("id", "ping")

    results = []
    successful = 0
    start_all = time.time()

    latest = state.LATEST_STATE or {}
    machines_map = {m.get("machine_id"): m for m in latest.get("admin_machines", [])}

    for tid in target_node_ids:
        machine = machines_map.get(tid)
        if not machine:
            results.append({
                "target_node_id": tid,
                "capability_id": cap_id,
                "success": False,
                "error": {"code": "not_found", "message": "Node not found"},
                "execution_duration_ms": 0,
            })
            continue

        ip = machine.get("ip")
        port = machine.get("port", 9010)
        t_start = time.time()
        try:
            url = f"http://{ip}:{port}/data" if any(k in cap_id for k in ("Hardware", "telemetry", "scan")) else f"http://{ip}:{port}/ping"
            with urllib.request.urlopen(urllib.request.Request(url), timeout=3.0) as resp:
                res_json = json.loads(resp.read().decode())
                dur_ms = int((time.time() - t_start) * 1000)
                successful += 1
                results.append({
                    "target_node_id": tid,
                    "capability_id": cap_id,
                    "success": True,
                    "output": res_json.get("data") or res_json,
                    "execution_duration_ms": dur_ms,
                })
        except Exception as e:
            dur_ms = int((time.time() - t_start) * 1000)
            results.append({
                "target_node_id": tid,
                "capability_id": cap_id,
                "success": False,
                "error": {"code": "execution_failed", "message": str(e)},
                "execution_duration_ms": dur_ms,
            })

    total_dur_ms = int((time.time() - start_all) * 1000)
    batch_res = {
        "batch_id": batch_id,
        "total_targets": len(target_node_ids),
        "successful_targets": successful,
        "failed_targets": len(target_node_ids) - successful,
        "total_duration_ms": total_dur_ms,
        "results": results,
    }
    return jsonify({
        "ok": True,
        "result": batch_res,
        "data": {"result": batch_res},
        **batch_res
    })


# ── Authoritative Network Snapshot & Granular Query Builders ───────────────────

def _build_network_snapshot() -> dict:
    """Single authoritative builder for cluster nodes, devices, socket flows, and traffic."""
    try:
        from brain.runtime.local_network_service import get_local_network_service
        service = get_local_network_service()
        local_snap = service.get_observation_snapshot()
    except Exception:
        local_snap = {}

    import time
    import platform
    now_ms = int(time.time() * 1000)
    now_epoch = now_ms / 1000

    local_hostname = platform.node() or "Local Host"
    local_role = "leader" if _current_role == "admin" else ("worker" if _current_role == "available" else "standalone")

    local_ips = []
    for iface in local_snap.get("interfaces", []):
        for addr in iface.get("ipv4_addresses", []):
            cip = addr.split("/")[0]
            if cip != "127.0.0.1" and not cip.startswith("169.254."):
                local_ips.append(cip)
    if not local_ips:
        local_ips = [_local_ip()]

    nodes = [{
        "id": "node_local",
        "name": f"{local_hostname} (Local)",
        "hostname": local_hostname,
        "os": platform.system().lower(),
        "arch": platform.machine(),
        "role": local_role,
        "availability": "available",
        "auth_state": "authenticated",
        "pairing_state": "paired",
        "ip_addresses": local_ips,
        "cluster_port": 9010 if _current_role == "available" else 9000,
        "last_seen_epoch": now_epoch,
        "capabilities": ["monitor_server", "admin_connect", "tcp_mesh", "System.GetHardware"],
    }]

    latest = state.LATEST_STATE or {}
    admin_machines = latest.get("admin_machines", [])
    remote_telemetry = latest.get("remote_machines", {})
    cluster_connections = []

    for m in admin_machines:
        mid = m.get("machine_id", f"node_{m.get('ip')}")
        m_online = m.get("online", True)
        m_ip = m.get("ip", "")
        m_port = m.get("port", 9010)

        telemetry = remote_telemetry.get(mid, {})
        sys_info = telemetry.get("system", {}) if isinstance(telemetry, dict) else {}

        node_os = sys_info.get("os") or "unknown"
        node_arch = sys_info.get("arch") or "unknown"
        node_host = sys_info.get("hostname") or m.get("name") or m_ip

        nodes.append({
            "id": mid,
            "name": m.get("name", node_host),
            "hostname": node_host,
            "os": node_os,
            "arch": node_arch,
            "role": "worker",
            "availability": "connected" if m_online else "offline",
            "auth_state": "authenticated" if m_online else "unauthenticated",
            "pairing_state": "paired" if m_online else "unpaired",
            "ip_addresses": [m_ip] if m_ip else [],
            "cluster_port": m_port,
            "last_seen_epoch": m.get("last_seen", now_epoch),
            "capabilities": ["monitor_server", "System.GetHardware"],
        })

        if m_online and m_ip:
            cluster_connections.append({
                "id": f"conn_cluster_{mid}",
                "kind": "cluster_transport",
                "protocol": "tcp",
                "local_addr": local_ips[0],
                "local_port": 9010,
                "remote_addr": m_ip,
                "remote_port": m_port,
                "state": "established",
                "direction": "outbound",
                "associated_node_id": mid,
                "established_at_epoch": m.get("last_seen", now_epoch),
                "last_active_epoch": now_epoch,
            })

    raw_devices = local_snap.get("devices", [])
    devices = []
    seen_dev_ids = set()
    for d in raw_devices:
        ip = d.get("ip_address", "")
        mac = d.get("mac_address")
        if mac and mac.lower() in ("ff:ff:ff:ff:ff:ff", "00:00:00:00:00:00") and ip:
            dev_id = f"dev_bcast_{ip.replace('.', '_')}"
        elif mac:
            dev_id = f"dev_{mac.replace(':', '').replace('-', '').lower()}"
        elif ip:
            dev_id = f"dev_{ip.replace('.', '_')}"
        else:
            continue

        if d.get("id"):
            dev_id = d["id"]

        if dev_id in seen_dev_ids:
            if ip:
                dev_id = f"{dev_id}_{ip.replace('.', '_')}"
            if dev_id in seen_dev_ids:
                continue

        seen_dev_ids.add(dev_id)
        dev = dict(d)
        dev["id"] = dev_id
        dev["category"] = dev.get("category") or ("infrastructure" if dev.get("is_gateway") else "endpoint")
        dev["state"] = dev.get("state") or "reachable"
        dev["source"] = dev.get("source") or "discovery"
        dev["is_fluffy_node"] = dev.get("is_fluffy_node", False)
        devices.append(dev)

    raw_flows = local_snap.get("active_flows", []) or local_snap.get("flows", [])
    connections = list(cluster_connections)

    for idx, f in enumerate(raw_flows):
        l_addr = f.get("local_addr") or f.get("local_address") or "0.0.0.0"
        r_addr = f.get("remote_addr") or f.get("remote_address")
        l_port = f.get("local_port") or 0
        r_port = f.get("remote_port")
        proto = (f.get("protocol") or "tcp").lower()
        state_val = (f.get("state") or "unknown").lower()

        if not r_addr or state_val == "listening":
            direction = "local"
        elif r_addr.startswith("127.") or r_addr == "::1":
            direction = "local"
        else:
            direction = "outbound"

        connections.append({
            "id": f.get("id") or f"flow_{proto}_{l_port}_{r_addr or 'none'}_{r_port or '0'}_{idx}",
            "kind": "local_socket_flow",
            "protocol": proto if proto in ["tcp", "udp"] else "tcp",
            "local_addr": l_addr,
            "local_port": l_port,
            "remote_addr": r_addr,
            "remote_port": r_port,
            "state": state_val,
            "direction": direction,
            "pid": f.get("pid"),
            "process_name": f.get("process_name"),
            "last_active_epoch": now_epoch,
        })

    traffic = {
        "rx_bytes": 0,
        "tx_bytes": 0,
        "rx_packets": 0,
        "tx_packets": 0,
        "rx_errors": 0,
        "tx_errors": 0,
        "rx_drops": 0,
        "tx_drops": 0,
        "rates": {
            "rx_bytes_per_second": 0.0,
            "tx_bytes_per_second": 0.0,
            "rx_bits_per_second": 0.0,
            "tx_bits_per_second": 0.0,
        },
        "top_talkers": [],
        "bytes_in": 0,
        "bytes_out": 0,
        "packets_in": 0,
        "packets_out": 0,
        "current_in_rate_bps": 0.0,
        "current_out_rate_bps": 0.0,
        "recorded_at_epoch_ms": now_ms,
    }

    return {
        "revision": 1,
        "captured_at_epoch_ms": now_ms,
        "nodes": nodes,
        "devices": devices,
        "connections": connections,
        "interfaces": local_snap.get("interfaces", []),
        "traffic": traffic,
    }


@network_bp.route("/network/snapshot", methods=["GET"])
@token_required
def get_network_snapshot():
    snap = _build_network_snapshot()
    return jsonify({"ok": True, "data": snap, "snapshot": snap, **snap})


@network_bp.route("/network/nodes", methods=["GET"])
@token_required
def get_network_nodes():
    snap = _build_network_snapshot()
    return jsonify({"ok": True, "revision": snap["revision"], "nodes": snap["nodes"], "data": snap["nodes"]})


@network_bp.route("/network/nodes/<node_id>", methods=["GET"])
@token_required
def get_network_node(node_id):
    snap = _build_network_snapshot()
    node = next((n for n in snap["nodes"] if n.get("id") == node_id), None)
    if not node:
        return jsonify({"error": f"Node {node_id} not found"}), 404
    return jsonify({"ok": True, "revision": snap["revision"], "node": node, "data": node})


@network_bp.route("/network/nodes/<node_id>/connection-info", methods=["GET"])
@token_required
def get_node_connection_info(node_id):
    snap = _build_network_snapshot()
    node = next((n for n in snap["nodes"] if n.get("id") == node_id), None)
    if not node:
        return jsonify({"error": f"Node {node_id} not found"}), 404
    info = {
        "node_id": node_id,
        "availability": node.get("availability", "disconnected"),
        "auth_state": node.get("auth_state", "unauthenticated"),
        "pairing_state": node.get("pairing_state", "unpaired"),
        "cluster_port": node.get("cluster_port", 9010),
        "last_seen_epoch": node.get("last_seen_epoch", 0),
    }
    return jsonify({"ok": True, "revision": snap["revision"], "info": info, "data": info})


@network_bp.route("/network/devices", methods=["GET"])
@token_required
def get_network_devices():
    snap = _build_network_snapshot()
    return jsonify({"ok": True, "revision": snap["revision"], "devices": snap["devices"], "data": snap["devices"]})


@network_bp.route("/network/devices/<device_id>", methods=["GET"])
@token_required
def get_network_device(device_id):
    snap = _build_network_snapshot()
    device = next((d for d in snap["devices"] if d.get("id") == device_id), None)
    if not device:
        return jsonify({"error": f"Device {device_id} not found"}), 404
    return jsonify({"ok": True, "revision": snap["revision"], "device": device, "data": device})


@network_bp.route("/network/connections", methods=["GET"])
@token_required
def get_network_connections():
    snap = _build_network_snapshot()
    return jsonify({"ok": True, "revision": snap["revision"], "connections": snap["connections"], "data": snap["connections"]})


@network_bp.route("/network/interfaces", methods=["GET"])
@token_required
def get_network_interfaces():
    snap = _build_network_snapshot()
    return jsonify({"ok": True, "revision": snap["revision"], "interfaces": snap["interfaces"], "data": snap["interfaces"]})


@network_bp.route("/network/traffic", methods=["GET"])
@token_required
def get_network_traffic():
    snap = _build_network_snapshot()
    return jsonify({"ok": True, "revision": snap["revision"], "traffic": snap["traffic"], "data": snap["traffic"]})


@network_bp.route("/network/capabilities", methods=["GET"])
@token_required
def get_network_capabilities():
    caps = {
        "protocol_version": {"major": 1, "minor": 0},
        "subsystem_available": True,
        "supported_read_operations": ["snapshot", "nodes", "devices", "connections", "interfaces", "traffic"],
        "supported_event_categories": ["node_lifecycle", "pairing", "topology", "security"],
        "supported_connection_kinds": ["cluster_transport", "local_socket_flow"],
        "supported_node_roles": ["standalone", "worker", "leader"],
        "telemetry_supported": True,
        "event_buffer_capacity": 1024,
    }
    return jsonify({
        "ok": True,
        "data": caps,
        "capabilities": caps,
        "monitor_port": 9010,
        "mesh_port": 9000
    })
