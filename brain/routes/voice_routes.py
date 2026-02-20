"""
Voice & TTS/STT Blueprint
Handles: /stop_tts, /tts_test, /tts/speak, /tts/stop, /test_stt, /stop_stt, /stt_status
"""
from flask import Blueprint, jsonify, request
import state
import sys

voice_bp = Blueprint('voice', __name__)

# Hardcoded token for development
FLUFFY_TOKEN = "fluffy_dev_token"


@voice_bp.route("/stop_tts", methods=["POST"])
def stop_tts():
    """Stop all current and pending speech."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    from voice import stop_speech
    stop_speech()
    return jsonify({"ok": True})


@voice_bp.route("/tts_test", methods=["POST"])
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


@voice_bp.route("/tts/speak", methods=["POST"])
def tts_speak():
    """Speak text using TTS engine (for 'Say' button in UI)"""
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
        
        try:
            stop_speech()
        except:
            pass
            
        speak_custom(text)
        return jsonify({"ok": True})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@voice_bp.route("/tts/stop", methods=["POST"])
def tts_stop():
    """Stop current speech (respects priority)."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "Forbidden"}), 403
    
    try:
        print("[API] Received /tts/stop request", file=sys.stderr)
        from voice import stop_speech
        stop_speech(force=False)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@voice_bp.route("/test_stt", methods=["POST"])
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


@voice_bp.route("/stop_stt", methods=["POST"])
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


@voice_bp.route("/stt_status", methods=["GET"])
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
