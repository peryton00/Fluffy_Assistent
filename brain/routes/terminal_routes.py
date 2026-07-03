import asyncio
import json
import os
import websockets
from flask import Blueprint, jsonify, request, send_from_directory
from auth_utils import token_required

terminal_bp = Blueprint('terminal', __name__)

CORE_WS_URL = "ws://127.0.0.1:9003"

async def fetch_ws_clients():
    try:
        async def do_fetch():
            async with websockets.connect(CORE_WS_URL) as ws:
                for _ in range(10):
                    msg = await ws.recv()
                    data = json.loads(msg)
                    if data.get("type") == "client_list":
                        return data.get("clients", [])
            return []
        
        return await asyncio.wait_for(do_fetch(), timeout=2.0)
    except Exception as e:
        print(f"[Terminal Route] Error fetching WS clients: {e}")
    return []

async def send_ws_command(cmd_text):
    try:
        async def do_send():
            async with websockets.connect(CORE_WS_URL) as ws:
                await ws.send(json.dumps({
                    "type": "command",
                    "text": cmd_text
                }))
                return True
        
        return await asyncio.wait_for(do_send(), timeout=2.0)
    except Exception as e:
        print(f"[Terminal Route] Error sending WS command: {e}")
        return False

@terminal_bp.route("/terminal/clients", methods=["GET"])
@token_required
def get_terminal_clients():
    try:
        # Use new_event_loop since Flask runs in synchronous threads
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        clients = loop.run_until_complete(fetch_ws_clients())
        loop.close()
        return jsonify({"ok": True, "clients": clients})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@terminal_bp.route("/terminal/command", methods=["POST"])
@token_required
def post_terminal_command():
    data = request.get_json(silent=True)
    if not data or "command" not in data:
        return jsonify({"error": "Missing command parameter"}), 400
    
    cmd_text = data["command"]
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        success = loop.run_until_complete(send_ws_command(cmd_text))
        loop.close()
        
        if success:
            return jsonify({"ok": True})
        else:
            return jsonify({"error": "Failed to send command to Core"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@terminal_bp.route("/terminal/client-download", methods=["GET"])
@token_required
def download_terminal_client():
    # Serve fluffy-client.exe from core program directory or build target
    bin_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "dist", "bin")
    bin_dir = os.path.abspath(bin_dir)
    filename = "fluffy-client.exe"
    
    if not os.path.exists(os.path.join(bin_dir, filename)):
        bin_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "core", "target", "release")
        bin_dir = os.path.abspath(bin_dir)
        
    if not os.path.exists(os.path.join(bin_dir, filename)):
        # Check target/debug for testing
        bin_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "core", "target", "debug")
        bin_dir = os.path.abspath(bin_dir)
        
    if not os.path.exists(os.path.join(bin_dir, filename)):
        return jsonify({"error": f"fluffy-client.exe binary not found in {bin_dir}. Run build_all.ps1 first."}), 404
        
    return send_from_directory(bin_dir, filename, as_attachment=True)
