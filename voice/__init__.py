"""Voice module initialization."""
from .voice_controller import (
    get_voice_controller,
    speak_welcome,
    speak_guardian_alert,
    speak_custom
)

__all__ = [
    'get_voice_controller',
    'speak_welcome',
    'speak_guardian_alert',
    'speak_custom'
]
