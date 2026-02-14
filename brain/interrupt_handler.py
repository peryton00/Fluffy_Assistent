"""
Interrupt command handler for Fluffy Assistant
Allows users to cancel pending actions with commands like "stop", "cancel", etc.
"""

import state
import time

# Interrupt command keywords
INTERRUPT_COMMANDS = [
    "stop", "cancel", "abort", "quit", "exit",
    "mute", "quiet", "shut up", "never mind", "forget it"
]


def is_interrupt_command(text: str) -> bool:
    """Check if text contains an interrupt command"""
    if not text:
        return False
    
    text_lower = text.lower().strip()
    return any(cmd in text_lower for cmd in INTERRUPT_COMMANDS)


def handle_interrupt() -> dict:
    """
    Handle interrupt command
    
    Returns:
        {
            "interrupted": bool,
            "message": str,
            "actions_cancelled": list
        }
    """
    from memory.session_memory import get_session_memory
    
    actions_cancelled = []
    
    # 1. Stop TTS if speaking
    try:
        from voice import stop_speaking
        stop_speaking()
        actions_cancelled.append("voice_output")
    except Exception as e:
        print(f"⚠️ Could not stop TTS: {e}")
    
    # 2. Clear pending intents from session memory
    session = get_session_memory()
    if session.has_pending_intent():
        intent = session.get_pending_intent()
        actions_cancelled.append(f"pending_intent:{intent}")
        session.clear_pending_intent()
    
    # 3. Clear any pending confirmations
    confirmations = state.get_confirmations()
    if confirmations:
        for conf in confirmations:
            state.remove_confirmation(conf.get("command_id"))
            actions_cancelled.append(f"confirmation:{conf.get('command_id')}")
    
    # 4. Add notification
    message = "Action cancelled" if actions_cancelled else "Nothing to cancel"
    state.NOTIFICATIONS.append({
        "type": "info",
        "message": message,
        "timestamp": time.time()
    })
    
    state.add_execution_log(f"🛑 Interrupt: {message} ({', '.join(actions_cancelled)})", "info")
    
    return {
        "interrupted": True,
        "message": message,
        "actions_cancelled": actions_cancelled
    }


def cancel_pending_action(action_type: str = None) -> bool:
    """
    Cancel a specific pending action
    
    Args:
        action_type: Type of action to cancel (e.g., "kill_process", "normalize")
                    If None, cancels all pending actions
    
    Returns:
        True if action was cancelled, False otherwise
    """
    from memory.session_memory import get_session_memory
    
    session = get_session_memory()
    
    if action_type:
        # Cancel specific action
        if session.get_pending_intent() == action_type:
            session.clear_pending_intent()
            state.add_execution_log(f"Cancelled pending action: {action_type}", "info")
            return True
        return False
    else:
        # Cancel all pending actions
        if session.has_pending_intent():
            session.clear_pending_intent()
            state.add_execution_log("Cancelled all pending actions", "info")
            return True
        return False


def get_cancellable_actions() -> list:
    """
    Get list of currently cancellable actions
    
    Returns:
        List of action descriptions
    """
    from memory.session_memory import get_session_memory
    
    actions = []
    
    session = get_session_memory()
    if session.has_pending_intent():
        intent = session.get_pending_intent()
        params = session.get_parameters()
        actions.append({
            "type": "pending_intent",
            "intent": intent,
            "parameters": params,
            "description": f"Multi-step action: {intent}"
        })
    
    confirmations = state.get_confirmations()
    for conf in confirmations:
        actions.append({
            "type": "confirmation",
            "command_id": conf.get("command_id"),
            "description": conf.get("message", "Pending confirmation")
        })
    
    return actions
