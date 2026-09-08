"""
Backward-compatibility shim and module alias for state -> brain.runtime.state
Ensures state singleton identity is shared across all import paths.
"""
import sys
from brain.runtime import state as _runtime_state

# Alias sys.modules entries to guarantee single instance
sys.modules["state"] = _runtime_state
sys.modules["brain.state"] = _runtime_state

from brain.runtime.state import (
    LATEST_STATE,
    EXECUTION_LOGS,
    PENDING_CONFIRMATIONS,
    SECURITY_ALERTS,
    ACTIVE_VERDICTS,
    MONITOR,
    UI_ACTIVE,
    LOCK,
    SHUTDOWN_MODE,
    PENDING_CHAT_COMMAND,
    WELCOME_SPOKEN,
    TTS_MUTED,
    NOTIFICATIONS,
    update_state,
    add_execution_log,
    add_confirmation,
    get_confirmations,
    remove_confirmation,
    update_security_alerts,
    add_notification,
    get_notifications,
)
