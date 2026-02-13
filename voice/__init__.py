"""Voice module initialization."""
from .voice_controller import (
    get_voice_controller,
    speak_welcome,
    speak_guardian_alert,
    speak_custom,
    start_stt_test,
    stop_stt_test,
    get_stt_status
)

__all__ = [
    'get_voice_controller',
    'speak_welcome',
    'speak_guardian_alert',
    'speak_custom',
    'start_stt_test',
    'stop_stt_test',
    'get_stt_status'
]
