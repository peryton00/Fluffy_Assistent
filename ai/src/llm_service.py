"""
LLM Service
High-level orchestrator for LLM interactions
Integrates intent classification, LLM client, and voice output
"""

import sys
import os
from typing import Iterator, Optional, List, Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from ai.src.llm_client import get_client
from brain.action_validator import ActionValidator
from brain.command_executor import CommandExecutor


class LLMService:
    """
    High-level LLM service that orchestrates:
    - Unified Command & Chat processing (MarkX style)
    - Command execution (local)
    - Voice output integration
    """
    
    def __init__(self):
        """Initialize the LLM service"""
        self.llm_client = get_client()
        self.validator = ActionValidator()
        self.executor = CommandExecutor()
        
        # System prompt for Fluffy's personality
        self.system_prompt = (
            "You are Fluffy, a helpful and friendly AI assistant. "
            "Your creator is peryton, who designed you with the unique ability to learn new things and expand your own capabilities over time. "
            "Be concise, clear, and friendly in your responses. "
            "If asked about your identity or creator, proudly mention peryton and your self-learning nature."
        )
        
        # Conversation history (simple in-memory for now)
        self.conversation_history: List[Dict[str, str]] = []
    
    def process_message(
        self,
        user_message: str,
        context_messages: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Consolidated MarkX-style message processing.
        Processes ANY message through LLMCommandParser to get intent, text, and memory updates.
        """
        from brain.llm_command_parser import get_llm_parser
        parser = get_llm_parser()
        
        # 0. Check for pending confirmations (Self-Improvement)
        from brain.memory.session_memory import get_session_memory
        session = get_session_memory()
        pending_improvement = session.get_pending_improvement()
        
        if pending_improvement:
            confirmations = ["yes", "y", "sure", "do it", "proceed", "okay", "ok"]
            is_confirmation = any(word in user_message.lower() for word in confirmations)
            
            if is_confirmation:
                print(f"[LLMService] 🚀 Execution confirmed for: {pending_improvement.get('intent')}")
                # Clear before executing to avoid loops
                session.clear_pending_improvement()
                
                from brain.self_improver import get_self_improver
                improver = get_self_improver()
                # execute_improvement handles re-hydration from dict
                result = improver.execute_improvement(
                    user_command=pending_improvement.get("original_text", ""),
                    understanding=pending_improvement
                )
                
                return {
                    "type": "command",
                    "success": result.get("success", False),
                    "message": result.get("message", "Extension created and installed!"),
                    "stream": None,
                    "result": result
                }
            else:
                # If not a confirmation, clear it (user said 'no' or something else)
                print("[LLMService] Improvement confirmation declined or bypassed.")
                session.clear_pending_improvement()

        # Get understanding from unified parser
        understanding = parser.parse_with_llm(user_message)
        
        print(f"[LLMService] Unified Understanding: {understanding}")
        
        # Apply memory updates if any
        if understanding.memory_update:
            try:
                from brain.memory.long_term_memory import update_memory
                update_memory(understanding.memory_update)
                print(f"[LLMService] Applied memory update: {understanding.memory_update}")
            except Exception as e:
                print(f"[LLMService] Memory update failed: {e}")
        
        # 1. Handle self-improvement requests
        if understanding.requires_new_functionality:
            try:
                from brain.self_improver import get_self_improver
                improver = get_self_improver()
                # Pass understanding directly to avoid re-parsing
                result = improver.handle_improvement_request(understanding)
                
                # Save to session so we can handle the "yes/no" follow-up
                if result.get("action") == "needs_confirmation":
                    session.set_pending_improvement(understanding.to_dict())
                
                return {
                    "type": "command",
                    "success": result.get("success", False),
                    "message": result.get("message", ""),
                    "stream": None,
                    "result": result
                }
            except Exception as e:
                print(f"[LLMService] Self-improvement failed to initialize: {e}")
        
        # 2. Determine if we should execute a local command
        if understanding.intent and understanding.intent != "chat" and not understanding.needs_clarification:
            return self._execute_unified_command(understanding)
        
        # Otherwise, treat as conversational chat (using the text returned by parser)
        return {
            "type": "llm",
            "success": True,
            "message": understanding.text,
            "stream": [understanding.text], # Wrapped as stream for compatibility
            "result": None
        }
    
    def _execute_unified_command(self, understanding) -> Dict[str, Any]:
        """Execute a command directly from LLM understanding strings"""
        from brain.command_parser import Command, Intent
        
        try:
            intent_obj = Intent(understanding.intent)
        except ValueError:
            # If it's a new intent, try to use it as a string (extensions support this)
            intent_obj = understanding.intent
            
        # Create Command object manually from LLM results
        cmd = Command(
            intent=intent_obj, 
            parameters=understanding.parameters,
            raw_text=understanding.original_text
        )
        
        # Validate and execute
        validation = self.validator.validate(cmd)
        result = self.executor.execute(cmd, validation)
        
        # Combine execution result with LLM's response text
        # If execution failed, use the executor's message to inform the user correctly
        success = result.get("success", False)
        if success:
            response_text = understanding.text or result.get("message", "Done!")
        else:
            response_text = f"I'm sorry, I couldn't do that. {result.get('message', 'An error occurred.')}"
        
        return {
            "type": "command",
            "success": success,
            "message": response_text,
            "stream": None,
            "result": result
        }

    def _query_llm(self, user_message: str, context_messages: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        """Query the LLM - now used internally by LLMCommandParser"""
        # Build messages list
        messages = []
        messages.append({"role": "system", "content": self.system_prompt})
        
        if context_messages:
            for msg in context_messages:
                if "role" in msg and "content" in msg:
                    messages.append({"role": msg["role"], "content": msg["content"]})
        
        messages.append({"role": "user", "content": user_message})
        
        # Get streaming response
        stream = self.llm_client.chat(messages)
        
        return {
            "type": "llm",
            "success": True,
            "message": None,
            "stream": stream,
            "result": None
        }
    
    def add_assistant_message(self, message: str):
        """Add assistant message to conversation history"""
        self.conversation_history.append({
            "role": "assistant",
            "content": message
        })
    
    def clear_history(self):
        """Clear conversation history"""
        self.conversation_history = []
    
    def get_history(self) -> List[Dict[str, str]]:
        """Get conversation history"""
        return self.conversation_history.copy()
    
    def query_llm(self, prompt: str, context_messages: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        """
        Directly query the LLM without classification
        Useful for code generation, project creation, etc.
        
        Args:
            prompt: The prompt to send to LLM
            context_messages: Optional conversation context
            
        Returns:
            Dict with LLM response stream
        """
        return self._query_llm(prompt, context_messages)


# Global singleton instance
_service = None


def get_service() -> LLMService:
    """Get or create the global LLMService instance"""
    global _service
    if _service is None:
        _service = LLMService()
    return _service


# Test function
if __name__ == "__main__":
    print("=" * 60)
    print("LLM Service Test")
    print("=" * 60)
    
    service = get_service()
    
    test_inputs = [
        "what is the capital of France?",
        "open notepad",
        "explain how AI works",
    ]
    
    for user_input in test_inputs:
        print(f"\n{'='*60}")
        print(f"User: {user_input}")
        print("-" * 60)
        
        result = service.process_message(user_input)
        
        if result["type"] == "command":
            print(f"Type: LOCAL COMMAND")
            print(f"Success: {result['success']}")
            print(f"Message: {result['message']}")
        else:
            print(f"Type: LLM QUERY")
            print("Response: ", end="", flush=True)
            
            # Collect response for history
            full_response = ""
            for chunk in result["stream"]:
                print(chunk, end="", flush=True)
                full_response += chunk
            
            # Add to history
            service.add_assistant_message(full_response)
            print()
    
    print("\n" + "=" * 60)
    print(f"Conversation history: {len(service.get_history())} messages")
    print("=" * 60)
