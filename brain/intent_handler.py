"""
Multi-step intent handler for Fluffy Assistant
Manages conversational flows that require multiple turns
"""

from typing import Optional, Dict, Any
from memory.session_memory import get_session_memory


# Intent parameter requirements
INTENT_REQUIREMENTS = {
    "kill_process": {
        "params": ["pid"],
        "questions": {
            "pid": "Which process should I terminate? (Provide PID or name)"
        }
    },
    "trust_process": {
        "params": ["process_name", "confirm"],
        "questions": {
            "process_name": "Which process should I trust?",
            "confirm": "Are you sure you want to trust this process permanently? (yes/no)"
        }
    },
    "normalize_system": {
        "params": ["scope"],
        "questions": {
            "scope": "What should I normalize? Options: volume, brightness, temp_files, all"
        }
    },
    "ignore_process": {
        "params": ["process_name", "confirm"],
        "questions": {
            "process_name": "Which process should I ignore?",
            "confirm": "Ignore this process in Guardian analysis? (yes/no)"
        }
    }
}


def get_clarification_question(intent: str, param: str) -> str:
    """Get clarification question for a parameter"""
    if intent in INTENT_REQUIREMENTS:
        questions = INTENT_REQUIREMENTS[intent]["questions"]
        return questions.get(param, f"Please provide {param}")
    return f"Please provide {param}"


def requires_clarification(intent: str, parameters: dict) -> bool:
    """Check if intent needs clarification"""
    if intent not in INTENT_REQUIREMENTS:
        return False
    
    required = INTENT_REQUIREMENTS[intent]["params"]
    return not all(param in parameters and parameters[param] for param in required)


def handle_multi_step_intent(intent: str, parameters: dict, user_input: str) -> dict:
    """
    Handle multi-step intent flow
    
    Args:
        intent: The intent name (e.g., "kill_process")
        parameters: Parameters extracted from user input
        user_input: Raw user input text
    
    Returns:
        {
            "needs_clarification": bool,
            "question": str or None,
            "ready_to_execute": bool,
            "parameters": dict
        }
    """
    session = get_session_memory()
    
    # Check if we're continuing a pending intent
    if session.has_pending_intent():
        # Fill in the answer to the current question
        current_question = session.get_current_question()
        if current_question:
            # Special handling for confirmation parameters
            if current_question == "confirm":
                # Convert yes/no to boolean
                user_input_lower = user_input.lower().strip()
                if user_input_lower in ["yes", "y", "yeah", "sure", "ok", "okay"]:
                    session.update_parameters({current_question: True})
                elif user_input_lower in ["no", "n", "nope", "cancel"]:
                    session.update_parameters({current_question: False})
                else:
                    # Invalid response - ask again
                    return {
                        "needs_clarification": True,
                        "question": "Please answer yes or no.",
                        "ready_to_execute": False,
                        "parameters": session.get_parameters()
                    }
            else:
                session.update_parameters({current_question: user_input})
            
            session.clear_current_question()
    else:
        # New intent - store initial parameters
        session.set_pending_intent(intent)
        session.update_parameters(parameters)
    
    # Check if we have all required parameters
    if intent in INTENT_REQUIREMENTS:
        required = INTENT_REQUIREMENTS[intent]["params"]
        
        if session.has_all_parameters(required):
            # All parameters collected - ready to execute
            params = session.get_parameters()
            
            # Check for negative confirmation
            if "confirm" in params and not params["confirm"]:
                session.clear_pending_intent()
                return {
                    "needs_clarification": False,
                    "question": None,
                    "ready_to_execute": False,
                    "cancelled": True,
                    "parameters": {}
                }
            
            session.clear_pending_intent()
            return {
                "needs_clarification": False,
                "question": None,
                "ready_to_execute": True,
                "parameters": params
            }
        else:
            # Find next missing parameter
            for param in required:
                if not session.get_parameter(param):
                    question = get_clarification_question(intent, param)
                    session.set_current_question(param)
                    return {
                        "needs_clarification": True,
                        "question": question,
                        "ready_to_execute": False,
                        "parameters": session.get_parameters()
                    }
    
    # No requirements or unknown intent - execute immediately
    return {
        "needs_clarification": False,
        "question": None,
        "ready_to_execute": True,
        "parameters": parameters
    }


def cancel_pending_intent() -> bool:
    """Cancel any pending intent"""
    session = get_session_memory()
    if session.has_pending_intent():
        session.clear_pending_intent()
        return True
    return False


def get_pending_intent_status() -> Optional[Dict[str, Any]]:
    """Get status of pending intent"""
    session = get_session_memory()
    if not session.has_pending_intent():
        return None
    
    return {
        "intent": session.get_pending_intent(),
        "parameters": session.get_parameters(),
        "current_question": session.get_current_question()
    }
