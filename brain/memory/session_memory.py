"""
Session memory manager for Fluffy Assistant
Tracks temporary conversation state, pending intents, and action context
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
        print(f"🔄 Pending intent set: {intent}")
    
    def clear_pending_intent(self):
        """Clear pending intent and parameters"""
        if self.pending_intent:
            print(f"✅ Cleared pending intent: {self.pending_intent}")
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
        print("🔄 Pending improvement set")
        
    def get_pending_improvement(self) -> Optional[dict]:
        """Get the pending improvement understanding"""
        return self.pending_improvement_understanding
        
    def clear_pending_improvement(self):
        """Clear the pending improvement"""
        self.pending_improvement_understanding = None
        print("✅ Cleared pending improvement")
    
    # === Validation Confirmation Management ===
    
    def set_pending_validation(self, command: Any, validation_result: Any):
        """Set a pending validation confirmation"""
        self.pending_validation_command = command
        self.pending_validation_result = validation_result
        print("🔄 Pending validation confirmation set")
    
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
        print("✅ Cleared pending validation")
    
    # === Parameter Management ===
    
    def update_parameters(self, new_params: dict):
        """Update parameters for pending intent"""
        if not isinstance(new_params, dict):
            return
        for k, v in new_params.items():
            if v not in (None, ""):
                self.parameters[k] = v
                print(f"📝 Parameter updated: {k} = {v}")
    
    def get_parameters(self) -> dict:
        """Get all collected parameters"""
        return self.parameters.copy()
    
    def get_parameter(self, key: str) -> Any:
        """Get specific parameter"""
        return self.parameters.get(key)
    
    def has_all_parameters(self, required: list[str]) -> bool:
        """Check if all required parameters are collected"""
        return all(self.get_parameter(p) for p in required)
    
    # === Clarification Questions ===
    
    def set_current_question(self, param_name: str):
        """Set the parameter we're currently asking about"""
        self.current_question = param_name
        print(f"❓ Asking for parameter: {param_name}")
    
    def get_current_question(self) -> Optional[str]:
        """Get the parameter we're asking about"""
        return self.current_question
    
    def clear_current_question(self):
        """Clear current question"""
        self.current_question = None
    
    # === Conversation History ===
    
    def add_exchange(self, user_text: str, ai_response: str):
        """Add a conversation exchange"""
        self.last_user_text = user_text
        self.last_ai_response = ai_response
        
        self.conversation_history.append({
            "user": user_text,
            "ai": ai_response
        })
    
    def get_history_for_llm(self) -> str:
        """Get formatted history for LLM context"""
        lines = []
        for exchange in self.conversation_history:
            lines.append(f"User: {exchange['user']}")
            lines.append(f"AI: {exchange['ai']}")
        return "\n".join(lines)
    
    def get_last_user_text(self) -> Optional[str]:
        """Get last user input"""
        return self.last_user_text
    
    def get_last_ai_response(self) -> Optional[str]:
        """Get last AI response"""
        return self.last_ai_response
    
    # === Action Context ===
    
    def set_last_search(self, query: str, answer: str):
        """Remember last search for follow-up questions"""
        self.last_search = {"query": query, "answer": answer}
    
    def get_last_search(self) -> Optional[dict]:
        """Get last search context"""
        return self.last_search
    
    def set_last_killed_process(self, name: str, pid: int):
        """Remember last killed process"""
        self.last_killed_process = {"name": name, "pid": pid}
    
    def get_last_killed_process(self) -> Optional[dict]:
        """Get last killed process"""
        return self.last_killed_process
    
    def set_last_trusted_process(self, name: str):
        """Remember last trusted process"""
        self.last_trusted_process = name
    
    def get_last_trusted_process(self) -> Optional[str]:
        """Get last trusted process"""
        return self.last_trusted_process
    
    def set_last_guardian_action(self, action: str):
        """Remember last Guardian action"""
        self.last_guardian_action = action
    
    def get_last_guardian_action(self) -> Optional[str]:
        """Get last Guardian action"""
        return self.last_guardian_action
    
    def set_last_normalized_scope(self, scope: str):
        """Remember last normalization scope"""
        self.last_normalized_scope = scope
    
    def get_last_normalized_scope(self) -> Optional[str]:
        """Get last normalization scope"""
        return self.last_normalized_scope
    
    # === Context Summary ===
    
    def get_context_summary(self) -> dict:
        """Get full context for debugging or LLM"""
        return {
            "pending_intent": self.pending_intent,
            "parameters": self.parameters,
            "current_question": self.current_question,
            "last_search": self.last_search,
            "last_killed_process": self.last_killed_process,
            "last_trusted_process": self.last_trusted_process,
            "last_guardian_action": self.last_guardian_action,
            "last_normalized_scope": self.last_normalized_scope,
            "conversation_turns": len(self.conversation_history)
        }
    
    def get_context_for_llm(self) -> dict:
        """Get minimal context for LLM (reduces tokens)"""
        context = {}
        
        if self.pending_intent:
            context["pending_intent"] = self.pending_intent
            context["collected_params"] = list(self.parameters.keys())
        
        if self.last_search:
            context["last_search_query"] = self.last_search["query"]
        
        if self.last_killed_process:
            context["last_killed"] = self.last_killed_process["name"]
        
        if self.last_guardian_action:
            context["last_guardian_action"] = self.last_guardian_action
        
        return context


# Global session memory instance
_session_memory = SessionMemory()


def get_session_memory() -> SessionMemory:
    """Get global session memory instance"""
    return _session_memory


def reset_session_memory():
    """Reset global session memory"""
    _session_memory.reset()
    print("🔄 Session memory reset")
