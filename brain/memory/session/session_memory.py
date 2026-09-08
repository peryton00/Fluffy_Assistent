"""
Session Memory Manager for Fluffy Assistant
Tracks temporary conversation state, pending intents, validation confirmations, and action context.
"""

from typing import Any, Optional
from collections import deque


class SessionMemory:
    """
    Runtime memory for current session (resets on restart)
    
    Tracks:
    - Multi-step intents (pending actions)
    - Conversation history (last 5 exchanges)
    - Action context (last search, last killed process, etc.)
    - Validation confirmations
    - Self-improvement state
    """
    
    def __init__(self, max_history: int = 5):
        self.max_history = max_history
        self.reset()
    
    def reset(self):
        """Clear all session memory"""
        self.pending_intent: Optional[str] = None
        self.parameters: dict[str, Any] = {}
        self.current_question: Optional[str] = None
        
        # Self-improvement state
        self.pending_improvement_understanding: Optional[dict] = None
        
        # Validation confirmation state
        self.pending_validation_command: Optional[Any] = None
        self.pending_validation_result: Optional[Any] = None
        
        self.last_user_text: Optional[str] = None
        self.last_ai_response: Optional[str] = None
        
        # Action context
        self.last_search: Optional[dict] = None
        self.last_killed_process: Optional[dict] = None
        self.last_trusted_process: Optional[str] = None
        self.last_guardian_action: Optional[str] = None
        self.last_normalized_scope: Optional[str] = None
        
        # Conversation history
        self.conversation_history: deque = deque(maxlen=self.max_history)
    
    # === Pending Intent Management ===
    
    def set_pending_intent(self, intent: str):
        """Set a pending multi-step intent"""
        self.pending_intent = intent
        print(f"[SessionMemory] Pending intent set: {intent}")
    
    def clear_pending_intent(self):
        """Clear pending intent and parameters"""
        if self.pending_intent:
            print(f"[SessionMemory] Cleared pending intent: {self.pending_intent}")
        self.pending_intent = None
        self.parameters = {}
        self.current_question = None
    
    def has_pending_intent(self) -> bool:
        """Check if there's a pending intent"""
        return self.pending_intent is not None
    
    def get_pending_intent(self) -> Optional[str]:
        """Get current pending intent"""
        return self.pending_intent
    
    # === Self-Improvement Management ===
    
    def set_pending_improvement(self, understanding: dict):
        """Set a pending improvement request"""
        self.pending_improvement_understanding = understanding
        print("[SessionMemory] Pending improvement set")
        
    def get_pending_improvement(self) -> Optional[dict]:
        """Get the pending improvement understanding"""
        return self.pending_improvement_understanding
        
    def clear_pending_improvement(self):
        """Clear the pending improvement"""
        self.pending_improvement_understanding = None
        print("[SessionMemory] Cleared pending improvement")
    
    # === Validation Confirmation Management ===
    
    def set_pending_validation(self, command: Any, validation_result: Any):
        """Set a pending validation confirmation"""
        self.pending_validation_command = command
        self.pending_validation_result = validation_result
        print("[SessionMemory] Pending validation confirmation set")
    
    def get_pending_validation(self) -> tuple:
        """Get pending validation command and result"""
        return (self.pending_validation_command, self.pending_validation_result)
    
    def has_pending_validation(self) -> bool:
        """Check if there's a pending validation confirmation"""
        return self.pending_validation_command is not None
    
    def clear_pending_validation(self):
        """Clear pending validation confirmation"""
        self.pending_validation_command = None
        self.pending_validation_result = None
        print("[SessionMemory] Cleared pending validation")
    
    # === Parameters Management ===
    
    def set_parameters(self, params: dict):
        """Set parameters for pending intent"""
        self.parameters = params
    
    def get_parameters(self) -> dict:
        """Get parameters for pending intent"""
        return self.parameters
    
    def update_parameter(self, key: str, value: Any):
        """Update a single parameter"""
        self.parameters[key] = value
    
    # === Question Management ===
    
    def set_current_question(self, question: str):
        """Set the current clarification question being asked"""
        self.current_question = question
    
    def get_current_question(self) -> Optional[str]:
        """Get the current clarification question"""
        return self.current_question
    
    # === Conversation History ===
    
    def add_exchange(self, user_text: str, ai_response: str):
        """Add a conversation exchange to history"""
        self.last_user_text = user_text
        self.last_ai_response = ai_response
        self.conversation_history.append({
            "user": user_text,
            "ai": ai_response
        })
        print(f"[SessionMemory] Added conversation exchange: {user_text[:30]}...")
    
    def get_conversation_history(self) -> list:
        """Get recent conversation history"""
        return list(self.conversation_history)
    
    def get_last_exchange(self) -> Optional[dict]:
        """Get the most recent conversation exchange"""
        if self.conversation_history:
            return self.conversation_history[-1]
        return None
    
    # === Action Context Management ===
    
    def set_last_search(self, query: str, results: list):
        """Track last web/file search for follow-up questions"""
        self.last_search = {
            "query": query,
            "results": results
        }
    
    def get_last_search(self) -> Optional[dict]:
        """Get last search context"""
        return self.last_search
    
    def set_last_killed_process(self, process_name: str, pid: Optional[int] = None):
        """Track last killed process for undo/status queries"""
        self.last_killed_process = {
            "name": process_name,
            "pid": pid
        }
    
    def get_last_killed_process(self) -> Optional[dict]:
        """Get last killed process context"""
        return self.last_killed_process
    
    def set_last_trusted_process(self, process_name: str):
        """Track last process added to trusted list"""
        self.last_trusted_process = process_name
    
    def get_last_trusted_process(self) -> Optional[str]:
        """Get last trusted process"""
        return self.last_trusted_process
    
    def set_last_guardian_action(self, action: str):
        """Track last Guardian intervention action"""
        self.last_guardian_action = action
    
    def get_last_guardian_action(self) -> Optional[str]:
        """Get last Guardian action"""
        return self.last_guardian_action
    
    def set_last_normalized_scope(self, scope: str):
        """Track last normalization scope (e.g., 'all', 'top5', 'background')"""
        self.last_normalized_scope = scope
    
    def get_last_normalized_scope(self) -> Optional[str]:
        """Get last normalization scope"""
        return self.last_normalized_scope
    
    # === Summary / Export ===
    
    def get_context_summary(self) -> dict:
        """Get a full summary of current session context for LLM prompt injection"""
        return {
            "has_pending_intent": self.has_pending_intent(),
            "pending_intent": self.pending_intent,
            "pending_parameters": self.parameters,
            "has_pending_validation": self.has_pending_validation(),
            "has_pending_improvement": self.pending_improvement_understanding is not None,
            "recent_exchanges": len(self.conversation_history),
            "last_killed_process": self.last_killed_process.get("name") if self.last_killed_process else None,
            "last_search_query": self.last_search.get("query") if self.last_search else None,
            "last_normalized_scope": self.last_normalized_scope
        }

    def get_context_for_llm(self) -> dict:
        """Alias for get_context_summary"""
        return self.get_context_summary()


# Global singleton instance
_session_memory = SessionMemory()


def get_session_memory() -> SessionMemory:
    """Get global session memory instance"""
    return _session_memory


def reset_session_memory():
    """Reset global session memory"""
    _session_memory.reset()
    print("[SessionMemory] Session memory reset")
