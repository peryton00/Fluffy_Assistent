"""
Voice & TTS/STT Blueprint
Handles: /stop_tts, /tts_test, /tts/speak, /tts/stop, /test_stt, /stop_stt, /stt_status
"""
from flask import Blueprint, jsonify, request
import state
import os
import sys
from auth_utils import token_required

voice_bp = Blueprint('voice', __name__)

# FLUFFY_TOKEN removed, using auth_utils instead


@voice_bp.route("/stop_tts", methods=["POST"])
@token_required
def stop_tts():
    """Stop all current and pending speech."""
    from voice import stop_speech
    stop_speech()
    return jsonify({"ok": True})


@voice_bp.route("/tts_test", methods=["POST"])
@token_required
def tts_test():
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
@token_required
def tts_speak():
    """Speak text using TTS engine (for 'Say' button in UI)"""
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
@token_required
def tts_stop():
    """Stop current speech (respects priority)."""
    try:
        print("[API] Received /tts/stop request", file=sys.stderr)
        from voice import stop_speech
        stop_speech(force=False)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@voice_bp.route("/test_stt", methods=["POST"])
@token_required
def test_stt():
    """Start STT listening test"""
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
@token_required
def stop_stt():
    """Stop STT listening test"""
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
@token_required
def stt_status():
    """Get current STT status and transcription"""
    try:
        from voice import get_stt_status
        status_data = get_stt_status()
        return jsonify(status_data)
    except ImportError as e:
        return jsonify({"error": f"Voice module not found: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"STT Failure: {str(e)}"}), 500


@voice_bp.route("/tts/mute", methods=["POST"])
@token_required
def toggle_tts_mute():
    """Toggle or set the TTS mute state."""
    data = request.get_json(silent=True) or {}
    import state
    from voice import stop_speech
    
    current_muted = getattr(state, "TTS_MUTED", False)
    new_muted = data.get("muted", not current_muted)
    
    state.TTS_MUTED = new_muted
    if new_muted:
        # Stop any currently playing speech immediately
        try:
            stop_speech(force=True)
        except Exception as e:
            print(f"[Voice] Error stopping speech on mute: {e}")
            
    state.add_execution_log(f"TTS service {'muted' if new_muted else 'unmuted'}", "system")
    return jsonify({"ok": True, "muted": new_muted})


@voice_bp.route("/tts/mute/status", methods=["GET"])
@token_required
def get_tts_mute_status():
    """Get the current TTS mute status."""
    import state
    return jsonify({"ok": True, "muted": getattr(state, "TTS_MUTED", False)})
