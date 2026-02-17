from flask import Flask, jsonify, send_from_directory, request
import state
from commands import send_command
import os
import sys
import socket
import json

# Add parent directory to path to ensure voice module is discoverable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    # Allow CORS from Tauri dev server
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Fluffy-Token"
    response.headers["Access-Control-Max-Age"] = "3600"
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
    
    # Add to long-term memory (persists across restarts)
    try:
        from memory.long_term_memory import add_trusted_process
        add_trusted_process(process_name)
    except Exception as e:
        print(f"⚠️ Failed to add to long-term memory: {e}")
    
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
        state.add_execution_log(f"Manual trust: {process_name} marked as trusted (baseline created + memory saved)", "info")
    else:
        GUARDIAN_BASELINE.mark_trusted(process_name)
        state.add_execution_log(f"Manual trust: {process_name} behaviors are now whitelisted (saved to memory)", "info")
    
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
        from voice import stop_speech
        stop_speech()
        state.add_execution_log("UI Dashboard disconnected", "system")
    return jsonify({"status": "UI_DISCONNECTED", "ui_active": state.UI_ACTIVE})

@app.route("/stop_tts", methods=["POST"])
def stop_tts():
    """Stop all current and pending speech."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    from voice import stop_speech
    stop_speech()
    return jsonify({"ok": True})


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

@app.route("/tts_test", methods=["POST"])
def tts_test():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Malformed JSON or empty payload"}), 400
        
    text = data.get("text")
    if not text:
        return jsonify({"error": "No text provided"}), 400
    
    # Import and use the voice module
    try:
        from voice import speak_custom
        speak_custom(text)
        state.add_execution_log(f"TTS Test: '{text[:40]}...'", "action")
        return jsonify({"ok": True})
    except ImportError as e:
        state.add_execution_log(f"TTS Import Error: {e}", "error")
        return jsonify({"error": f"Voice module not found: {e}"}), 500
    except Exception as e:
        state.add_execution_log(f"TTS Execution Error: {e}", "error")
        return jsonify({"error": f"TTS Failure: {str(e)}"}), 500


@app.route("/test_stt", methods=["POST"])
def test_stt():
    """Start STT listening test"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        from voice import start_stt_test
        success = start_stt_test()
        if success:
            state.add_execution_log("STT listening started", "action")
            return jsonify({"ok": True, "status": "listening"})
        else:
            return jsonify({"error": "Failed to start STT (check if Vosk is installed)"}), 500
    except ImportError as e:
        state.add_execution_log(f"STT Import Error: {e}", "error")
        return jsonify({"error": f"Voice module not found: {e}"}), 500
    except Exception as e:
        state.add_execution_log(f"STT Start Error: {e}", "error")
        return jsonify({"error": f"STT Failure: {str(e)}"}), 500


@app.route("/stop_stt", methods=["POST"])
def stop_stt():
    """Stop STT listening test"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        from voice import stop_stt_test
        stop_stt_test()
        state.add_execution_log("STT listening stopped", "action")
        return jsonify({"ok": True, "status": "stopped"})
    except ImportError as e:
        return jsonify({"error": f"Voice module not found: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"STT Failure: {str(e)}"}), 500


@app.route("/stt_status", methods=["GET"])
def stt_status():
    """Get current STT status and transcription"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        from voice import get_stt_status
        status_data = get_stt_status()
        return jsonify(status_data)
    except ImportError as e:
        return jsonify({"error": f"Voice module not found: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"STT Failure: {str(e)}"}), 500


@app.route("/apps", methods=["GET"])
def get_apps():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        from app_utils import list_installed_apps
        apps = list_installed_apps()
        return jsonify(apps)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/apps/refresh", methods=["POST"])
def refresh_apps():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        from app_utils import scan_and_cache_apps
        apps = scan_and_cache_apps()
        return jsonify({"ok": True, "count": len(apps)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/apps/launch", methods=["POST"])
def launch_application():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True)
    location = data.get("location")
    exe_path = data.get("exe_path")
    name = data.get("name")
    if not location and not exe_path:
        return jsonify({"error": "Missing executable path"}), 400
    try:
        from app_utils import launch_app
        if launch_app(exe_path, location, name):
            state.add_execution_log(f"Launched application: {name}", "action")
            return jsonify({"ok": True})
        else:
            return jsonify({"error": "Failed to launch app"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/apps/uninstall", methods=["POST"])
def uninstall_application():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True)
    uninstall_string = data.get("uninstall_string")
    name = data.get("name")
    if not uninstall_string:
        return jsonify({"error": "Missing uninstall string"}), 400
    try:
        from app_utils import uninstall_app
        if uninstall_app(uninstall_string):
            state.add_execution_log(f"Triggered uninstaller for: {name}", "warning")
            return jsonify({"ok": True})
        else:
            return jsonify({"error": "Failed to trigger uninstaller"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/execute_command", methods=["POST"])
def execute_command():
    """
    Execute a voice command using the unified AI flow.
    Parses, validates, and executes with TTS feedback.
    """
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        command_text = data.get("command", "").strip()
        
        if not command_text:
            return jsonify({"error": "No command provided"}), 400
        
        # Import LLM service - add project root to path
        import os, sys
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)

        from ai.src.llm_service import get_service
        from voice import speak_custom, stop_speech
        
        # Stop any ongoing speech
        stop_speech()
        
        # Use unified AI flow
        llm_service = get_service()
        result = llm_service.process_message(command_text)
        
        # Handle execution and TTS
        response_text = result.get("message", "")
        if response_text:
            speak_custom(response_text)
            state.add_execution_log(f"Voice Command: {command_text} -> {response_text}", "action")
        
        return jsonify({
            "ok": True,
            "command": command_text,
            "type": result["type"],
            "result": result.get("result") or result
        })
        
    except ImportError as e:
        error_msg = f"Module not found: {e}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"error": error_msg}), 500
    except Exception as e:
        error_msg = f"Command execution failed: {str(e)}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"error": error_msg}), 500


@app.route("/pending_confirmations", methods=["GET"])
def get_pending_confirmations():
    """Get list of commands awaiting confirmation"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Placeholder for now - will implement confirmation queue later
    return jsonify({"pending": []})


# ============================================================================
# CHAT HISTORY ENDPOINTS
# ============================================================================

@app.route("/chat/create_session", methods=["POST"])
def create_chat_session():
    """Create a new chat session"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from chat_history import ChatHistory
        history = ChatHistory()
        session_id = history.create_session()
        
        return jsonify({
            "ok": True,
            "session_id": session_id
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/save_message", methods=["POST"])
def save_chat_message():
    """Save a message to the current session"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from chat_history import ChatHistory
        history = ChatHistory()
        
        data = request.get_json()
        session_id = data.get("session_id")
        message = data.get("message")
        
        if not session_id or not message:
            return jsonify({"error": "Missing session_id or message"}), 400
        
        success = history.save_message(session_id, message)
        
        return jsonify({
            "ok": success
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/sessions", methods=["GET"])
def list_chat_sessions():
    """List all chat sessions"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from chat_history import ChatHistory
        history = ChatHistory()
        sessions = history.list_sessions()
        
        return jsonify({
            "ok": True,
            "sessions": sessions
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/session/<session_id>", methods=["GET"])
def get_chat_session(session_id):
    """Get a specific chat session"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from chat_history import ChatHistory
        history = ChatHistory()
        session = history.load_session(session_id)
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        return jsonify({
            "ok": True,
            "session": session
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/session/<session_id>", methods=["DELETE"])
def delete_chat_session(session_id):
    """Delete a chat session"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from chat_history import ChatHistory
        history = ChatHistory()
        success = history.delete_session(session_id)
        
        return jsonify({
            "ok": success
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/current_session", methods=["GET"])
def get_current_session():
    """Get the current active session ID"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from chat_history import ChatHistory
        history = ChatHistory()
        session_id = history.get_current_session_id()
        
        return jsonify({
            "ok": True,
            "session_id": session_id
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# LLM CHAT ENDPOINTS
# ============================================================================

@app.route("/chat/message", methods=["POST"])
def chat_message():
    """
    Process a chat message - either execute as command or query LLM
    Returns immediate response for commands, streaming response for LLM queries
    """
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        user_message = data.get("message", "").strip()
        session_id = data.get("session_id")
        use_voice = data.get("use_voice", False)  # Whether to use TTS
        
        if not user_message:
            return jsonify({"error": "No message provided"}), 400
        
        # Import LLM service - add project root to path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        from ai.src.llm_service import get_service
        from voice import speak_custom, speak_stream, stop_speech
        
        # Stop any ongoing speech
        if use_voice:
            stop_speech()
        
        # Load chat history for context if session_id provided
        context_messages = []
        if session_id:
            try:
                from chat_history import ChatHistory
                history_manager = ChatHistory()
                session_data = history_manager.load_session(session_id)
                
                if session_data and "messages" in session_data:
                    # Get last 10 messages for context
                    for msg in session_data["messages"][-10:]:
                        # Handle different message formats (legacy vs new)
                        role = msg.get("role")
                        if not role:
                            msg_type = msg.get("type")
                            role = "user" if msg_type == "user" else "assistant"
                        
                        content = msg.get("content") or msg.get("text") or ""
                        
                        if content:
                            context_messages.append({"role": role, "content": content})
            except Exception as e:
                print(f"Error loading context history: {e}")
        
        # Process message through LLM service with context
        llm_service = get_service()
        result = llm_service.process_message(user_message, context_messages=context_messages)
        
        # Save user message to chat history
        if session_id:
            from chat_history import ChatHistory
            history = ChatHistory()
            history.save_message(session_id, {
                "role": "user",
                "content": user_message,
                "timestamp": __import__('time').time()
            })
        
        if result["type"] == "command":
            # Local command execution - immediate response
            response_text = result["message"]
            
            # Save assistant response to history
            if session_id:
                history.save_message(session_id, {
                    "role": "assistant",
                    "content": response_text,
                    "timestamp": __import__('time').time(),
                    "command_result": result["result"]
                })
            
            # Speak if voice enabled
            if use_voice:
                speak_custom(response_text)
            
            state.add_execution_log(f"Command: {user_message} → {response_text}", "action")
            
            return jsonify({
                "ok": True,
                "type": "command",
                "message": response_text,
                "result": result["result"]
            })
        
        else:
            # LLM query - collect streaming response
            response_chunks = []
            
            for chunk in result["stream"]:
                response_chunks.append(chunk)
            
            full_response = "".join(response_chunks)
            
            # Add to service history
            llm_service.add_assistant_message(full_response)
            
            # Save assistant response to history
            if session_id:
                history.save_message(session_id, {
                    "role": "assistant",
                    "content": full_response,
                    "timestamp": __import__('time').time()
                })
            
            # Speak if voice enabled
            if use_voice:
                speak_custom(full_response)
            
            state.add_execution_log(f"LLM Query: {user_message[:50]}...", "action")
            
            return jsonify({
                "ok": True,
                "type": "llm",
                "message": full_response
            })
    
    except ImportError as e:
        error_msg = f"LLM module not found: {e}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"error": error_msg}), 500
    except Exception as e:
        error_msg = f"Chat processing failed: {str(e)}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"error": error_msg}), 500


@app.route("/chat/stream", methods=["POST"])
def chat_stream():
    """
    Stream LLM response with Server-Sent Events
    Use this for real-time streaming responses in the UI
    """
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        user_message = data.get("message", "").strip()
        use_voice = data.get("use_voice", False)
        
        if not user_message:
            return jsonify({"error": "No message provided"}), 400
        
        # Import LLM service
        # Import LLM service - add project root to path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        from ai.src.llm_service import get_service
        from flask import Response, stream_with_context
        from voice import speak_stream, stop_speech
        
        # Stop any ongoing speech
        if use_voice:
            stop_speech()
        
        # Process message
        llm_service = get_service()
        result = llm_service.process_message(user_message)
        
        if result["type"] == "command":
            # Return command result immediately (not streaming)
            return jsonify({
                "ok": True,
                "type": "command",
                "message": result["message"]
            })
        
        # Stream LLM response
        def generate():
            """Generator for SSE streaming"""
            chunks_for_voice = []
            
            for chunk in result["stream"]:
                # Send chunk to client
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                
                # Collect for voice
                if use_voice:
                    chunks_for_voice.append(chunk)
            
            # Send completion signal
            yield f"data: {json.dumps({'done': True})}\n\n"
            
            # Speak collected response
            if use_voice and chunks_for_voice:
                full_text = "".join(chunks_for_voice)
                llm_service.add_assistant_message(full_text)
                
                # Use streaming TTS
                def chunk_generator():
                    yield full_text
                
                speak_stream(chunk_generator())
        
        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'
            }
        )
    
    except Exception as e:
        error_msg = f"Streaming failed: {str(e)}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"error": error_msg}), 500


# ============================================================================
# LLM SETTINGS ENDPOINTS
# ============================================================================

@app.route("/llm/config", methods=["GET"])
def get_llm_config():
    """Get current LLM configuration"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        # Import LLM config - add project root to path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        from ai.src.llm_config import get_config
        
        config = get_config()
        return jsonify({
            "ok": True,
            "config": config.get_config_dict()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/llm/config", methods=["POST"])
def update_llm_config():
    """Update LLM configuration (API key and/or model)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        api_key = data.get("api_key")
        model = data.get("model")
        
        if not api_key and not model:
            return jsonify({"error": "No configuration provided"}), 400
        
        # Import LLM config - add project root to path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        from ai.src.llm_config import get_config
        
        config = get_config()
        success = config.update_config(api_key=api_key, model=model)
        
        if success:
            state.add_execution_log("LLM configuration updated", "action")
            return jsonify({
                "ok": True,
                "message": "Configuration updated successfully",
                "config": config.get_config_dict()
            })
        else:
            return jsonify({"error": "Failed to update configuration"}), 500
    
    except Exception as e:
        error_msg = f"Failed to update LLM config: {str(e)}"
        state.add_execution_log(error_msg, "error")
        return jsonify({"error": error_msg}), 500


@app.route("/tts/speak", methods=["POST"])
def tts_speak():
    """
    Speak text using TTS engine (for 'Say' button in UI)
    """
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        text = data.get("text", "").strip()
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
            
        from voice import speak_custom, stop_speech
        
        # Stop any ongoing speech
        try:
            stop_speech()
        except:
            pass
            
        # Speak text
        speak_custom(text)
        
        return jsonify({"ok": True})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/tts/stop", methods=["POST"])
def tts_stop():
    """
    Stop current speech (respects priority).
    """
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        print("[API] Received /tts/stop request", file=sys.stderr)
        from voice import stop_speech
        stop_speech(force=False) # Only stop if not HIGH priority
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/llm/models", methods=["GET"])
def get_available_models():
    """Get list of available LLM models"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    # List of popular OpenRouter models
    models = [
        {
            "id": "moonshotai/kimi-k2:free",
            "name": "Kimi K2 (Free)",
            "description": "Free tier model with 60 RPM, 500K tokens/day",
            "cost": "Free",
            "recommended": True
        },
        {
            "id": "openai/gpt-3.5-turbo",
            "name": "GPT-3.5 Turbo",
            "description": "Fast and affordable OpenAI model",
            "cost": "Paid"
        },
        {
            "id": "openai/gpt-4",
            "name": "GPT-4",
            "description": "Most capable OpenAI model",
            "cost": "Paid"
        },
        {
            "id": "anthropic/claude-3-haiku",
            "name": "Claude 3 Haiku",
            "description": "Fast and balanced Anthropic model",
            "cost": "Paid"
        },
        {
            "id": "anthropic/claude-3-opus",
            "name": "Claude 3 Opus",
            "description": "Most capable Anthropic model",
            "cost": "Paid"
        },
        {
            "id": "meta-llama/llama-3.1-8b-instruct",
            "name": "Llama 3.1 8B",
            "description": "Open source Meta model",
            "cost": "Paid"
        },
        {
            "id": "google/gemini-pro",
            "name": "Gemini Pro",
            "description": "Google's Gemini Pro model",
            "cost": "Paid"
        }
    ]
    
    return jsonify({
        "ok": True,
        "models": models
    })


# ========== Memory System Endpoints ==========

@app.route("/memory", methods=["GET"])
def get_memory():
    """Get user's long-term memory"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from memory.long_term_memory import load_memory
        memory = load_memory()
        return jsonify({"ok": True, "memory": memory})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/memory", methods=["POST"])
def update_memory_endpoint():
    """Update user's long-term memory"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid payload"}), 400
    
    try:
        from memory.long_term_memory import update_memory
        memory = update_memory(data)
        return jsonify({"ok": True, "memory": memory})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/memory/preferences", methods=["GET"])
def get_preferences():
    """Get user preferences"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from memory.long_term_memory import load_memory
        memory = load_memory()
        prefs = memory.get("user_profile", {}).get("preferences", {})
        
        # Extract values
        result = {}
        for key, val in prefs.items():
            if isinstance(val, dict) and "value" in val:
                result[key] = val["value"]
        
        return jsonify({"ok": True, "preferences": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/memory/preferences", methods=["POST"])
def set_preference_endpoint():
    """Set a specific preference"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    if not data or "key" not in data or "value" not in data:
        return jsonify({"error": "Missing key or value"}), 400
    
    try:
        from memory.long_term_memory import set_preference
        set_preference(data["key"], data["value"])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/memory/trusted_processes", methods=["GET"])
def get_trusted_processes():
    """Get list of trusted processes"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from memory.long_term_memory import get_trusted_processes
        trusted = get_trusted_processes()
        return jsonify({"ok": True, "trusted_processes": trusted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/memory/trusted_processes", methods=["POST"])
def add_trusted_process_endpoint():
    """Add a process to trusted list"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    if not data or "process_name" not in data:
        return jsonify({"error": "Missing process_name"}), 400
    
    try:
        from memory.long_term_memory import add_trusted_process
        add_trusted_process(data["process_name"])
        state.add_execution_log(f"Added {data['process_name']} to trusted processes (memory)", "info")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/memory/trusted_processes", methods=["DELETE"])
def remove_trusted_process_endpoint():
    """Remove a process from trusted list"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.get_json(silent=True)
    if not data or "process_name" not in data:
        return jsonify({"error": "Missing process_name"}), 400
    
    try:
        from memory.long_term_memory import remove_trusted_process
        remove_trusted_process(data["process_name"])
        state.add_execution_log(f"Removed {data['process_name']} from trusted processes", "info")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/session/reset", methods=["POST"])
def reset_session():
    """Reset session memory"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        from memory.session_memory import reset_session_memory
        reset_session_memory()
        return jsonify({"ok": True, "message": "Session memory reset"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/session/status", methods=["GET"])
def get_session_status():
    """Get current session status (pending intents, etc.)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from memory.session_memory import get_session_memory
        session = get_session_memory()
        context = session.get_context_summary()
        return jsonify({"ok": True, "session": context})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ========== Interrupt Command Endpoints ==========

@app.route("/interrupt", methods=["POST"])
def interrupt():
    """Handle interrupt command (stop/cancel)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        from interrupt_handler import handle_interrupt
        result = handle_interrupt()
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/interrupt/check", methods=["POST"])
def check_interrupt():
    """Check if text contains interrupt command"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    data = request.get_json(silent=True)
    if not data or "text" not in data:
        return jsonify({"error": "Missing text"}), 400
    
    try:
        from interrupt_handler import is_interrupt_command
        is_interrupt = is_interrupt_command(data["text"])
        return jsonify({"ok": True, "is_interrupt": is_interrupt})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/cancellable_actions", methods=["GET"])
def get_cancellable_actions():
    """Get list of currently cancellable actions"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        from interrupt_handler import get_cancellable_actions
        actions = get_cancellable_actions()
        return jsonify({"ok": True, "actions": actions})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================================
# FTP SERVER ENDPOINTS
# ============================================================================

@app.route("/ftp/start", methods=["POST"])
def ftp_start():
    """Start the FTP server"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        # Add services directory to path
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
        from ftp_service import start_ftp_server
        from utils.qr_generator import generate_ftp_qr
        
        # Get optional shared_dir from request body
        data = request.get_json() or {}
        shared_dir = data.get("shared_dir")
        
        result = start_ftp_server(shared_dir=shared_dir)
        
        if result["success"]:
            # Generate QR code
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


@app.route("/ftp/stop", methods=["POST"])
def ftp_stop():
    """Stop the FTP server"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
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


@app.route("/ftp/status", methods=["GET"])
def ftp_status():
    """Get FTP server status"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
        from ftp_service import get_ftp_status
        from utils.qr_generator import generate_ftp_qr
        
        status = get_ftp_status()
        
        # Add QR code if server is running
        if status["status"] == "running":
            qr_code = generate_ftp_qr(
                status["username"],
                status["password"],
                status["ip"],
                status["port"]
            )
            status["qr_code"] = qr_code
        
        return jsonify(status)
    
    except ImportError as e:
        return jsonify({"status": "unavailable", "error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route("/ftp/logs", methods=["GET"])
def ftp_logs():
    """Get FTP activity logs"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
        from ftp_service import get_logs
        
        # Get limit from query params (default: 50)
        limit = request.args.get("limit", 50, type=int)
        logs = get_logs(limit=limit)
        
        return jsonify({"ok": True, "logs": logs})
    
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/ftp/clear_logs", methods=["POST"])
def ftp_clear_logs():
    """Clear FTP activity logs"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
        from ftp_service import clear_logs
        
        clear_logs()
        state.add_execution_log("FTP logs cleared", "action")
        
        return jsonify({"ok": True, "message": "Logs cleared successfully"})
    
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/ftp/disconnect", methods=["POST"])
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
        
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
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


@app.route("/ftp/qr", methods=["GET"])
def ftp_qr():
    """Get FTP QR code (only if server is running)"""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        
        from ftp_service import get_ftp_status
        from utils.qr_generator import generate_ftp_qr
        
        status = get_ftp_status()
        
        if status["status"] != "running":
            return jsonify({"error": "FTP server is not running"}), 400
        
        qr_code = generate_ftp_qr(
            status["username"],
            status["password"],
            status["ip"],
            status["port"]
        )
        
        return jsonify({"ok": True, "qr_code": qr_code})
    
    except ImportError as e:
        return jsonify({"error": f"FTP service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500




# ============================================================================
# CLUSTER MANAGEMENT ENDPOINTS
# ============================================================================

@app.route("/cluster/start_manager", methods=["POST"])
def start_cluster_manager_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
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

@app.route("/cluster/start_worker", methods=["POST"])
def start_cluster_worker_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
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

@app.route("/cluster/stop", methods=["POST"])
def stop_cluster_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        from cluster import stop_cluster_manager, stop_cluster_worker
        stop_cluster_manager()
        stop_cluster_worker()
        state.add_execution_log("Cluster service stopped", "action")
        return jsonify({"ok": True, "status": "stopped"})
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/cluster/status", methods=["GET"])
def cluster_status_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
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

@app.route("/cluster/credentials", methods=["GET"])
def get_cluster_credentials():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
        from cluster import get_or_create_credentials
        credentials = get_or_create_credentials()
        return jsonify({"ok": True, "credentials": credentials})
    except ImportError as e:
        return jsonify({"error": f"Cluster service not available: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/cluster/submit_task", methods=["POST"])
def submit_cluster_task_endpoint():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        services_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services")
        if services_path not in sys.path:
            sys.path.insert(0, services_path)
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

@app.route("/cluster/logs", methods=["GET"])
def get_cluster_logs():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    token = request.headers.get("X-Fluffy-Token")
    if token != FLUFFY_TOKEN:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        log_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "services", "cluster", "logs", "cluster_logs.json")
        if not os.path.exists(log_file):
            return jsonify({"ok": True, "logs": []})
        with open(log_file, 'r') as f:
            logs = json.load(f)
        return jsonify({"ok": True, "logs": logs[-50:]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def start_api():
    app.run(host="127.0.0.1", port=5123, debug=False, use_reloader=False)

