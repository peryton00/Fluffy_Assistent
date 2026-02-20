"""
FTP Server Blueprint
Handles: /ftp/start, /ftp/stop, /ftp/status, /ftp/logs, /ftp/clear_logs, /ftp/disconnect, /ftp/qr
"""
from flask import Blueprint, jsonify, request
import state
import os
import sys

ftp_bp = Blueprint('ftp', __name__)

FLUFFY_TOKEN = "fluffy_dev_token"


def _ensure_services_path():
    services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "services")
    services_path = os.path.abspath(services_path)
    if services_path not in sys.path:
        sys.path.insert(0, services_path)


@ftp_bp.route("/ftp/start", methods=["POST"])
def ftp_start():
    """Start the FTP server"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_services_path()
        from ftp_service import start_ftp_server
        from utils.qr_generator import generate_ftp_qr
        
        data = request.get_json() or {}
        shared_dir = data.get("shared_dir")
        
        result = start_ftp_server(shared_dir=shared_dir)
        
        if result["success"]:
            qr_code = generate_ftp_qr(
                result["username"],
                result["password"],
                result["ip"],
                result["port"]
            )
            result["qr_code"] = qr_code
            state.add_execution_log(f"FTP server started on {result['ip']}:{result['port']}", "action")
        
        return jsonify(result)
    
    except ImportError as e:
        error_msg = f"FTP service not available: {e}. Install dependencies: pip install pyftpdlib qrcode[pil]"
        state.add_execution_log(error_msg, "error")
        return jsonify({"success": False, "error": error_msg}), 500
    except Exception as e:
        error_msg = f"Failed to start FTP server: {str(e)}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"success": False, "error": error_msg}), 500


@ftp_bp.route("/ftp/stop", methods=["POST"])
def ftp_stop():
    """Stop the FTP server"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_services_path()
        from ftp_service import stop_ftp_server
        
        result = stop_ftp_server()
        if result["success"]:
            state.add_execution_log("FTP server stopped", "action")
        return jsonify(result)
    
    except ImportError as e:
        return jsonify({"success": False, "error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        error_msg = f"Failed to stop FTP server: {str(e)}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"success": False, "error": error_msg}), 500


@ftp_bp.route("/ftp/status", methods=["GET"])
def ftp_status():
    """Get FTP server status"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_services_path()
        from ftp_service import get_ftp_status
        from utils.qr_generator import generate_ftp_qr
        
        status = get_ftp_status()
        if status["status"] == "running":
            qr_code = generate_ftp_qr(
                status["username"], status["password"],
                status["ip"], status["port"]
            )
            status["qr_code"] = qr_code
        return jsonify(status)
    
    except ImportError as e:
        return jsonify({"status": "unavailable", "error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


@ftp_bp.route("/ftp/logs", methods=["GET"])
def ftp_logs():
    """Get FTP activity logs"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_services_path()
        from ftp_service import get_logs
        limit = request.args.get("limit", 50, type=int)
        logs = get_logs(limit=limit)
        return jsonify({"ok": True, "logs": logs})
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ftp_bp.route("/ftp/clear_logs", methods=["POST"])
def ftp_clear_logs():
    """Clear FTP activity logs"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_services_path()
        from ftp_service import clear_logs
        clear_logs()
        state.add_execution_log("FTP logs cleared", "action")
        return jsonify({"ok": True, "message": "Logs cleared successfully"})
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ftp_bp.route("/ftp/disconnect", methods=["POST"])
def ftp_disconnect_client():
    """Disconnect a specific FTP client"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        client_ip = data.get("client_ip")
        if not client_ip:
            return jsonify({"error": "client_ip is required"}), 400
        
        _ensure_services_path()
        from ftp_service import disconnect_client
        result = disconnect_client(client_ip)
        
        if result.get("success"):
            state.add_execution_log(f"Disconnected FTP client: {client_ip}", "action")
            return jsonify({"ok": True, "message": result.get("message")})
        else:
            return jsonify({"error": result.get("error")}), 400
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ftp_bp.route("/ftp/qr", methods=["GET"])
def ftp_qr():
    """Get FTP QR code (only if server is running)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        _ensure_services_path()
        from ftp_service import get_ftp_status
        from utils.qr_generator import generate_ftp_qr
        
        status = get_ftp_status()
        if status["status"] != "running":
            return jsonify({"error": "FTP server is not running"}), 400
        
        qr_code = generate_ftp_qr(
            status["username"], status["password"],
            status["ip"], status["port"]
        )
        return jsonify({"ok": True, "qr_code": qr_code})
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
