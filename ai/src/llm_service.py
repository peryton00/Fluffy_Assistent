"""
LLM Service — Thin Orchestrator
Processes chat messages through context → parser → router pipeline.
All routing logic has been moved to intent_router.py.
"""

import sys
import os
from typing import Optional, List, Dict, Any

# Add brain directory and ai/src directory to path so imports work from any CWD
_brain_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.join(_brain_dir, '..', '..')
_ai_src = os.path.join(_brain_dir, '..', 'ai', 'src')

for _p in [_brain_dir, _ai_src, _project_root]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from llm_client import get_client


class LLMService:
    """
    High-level LLM service that orchestrates:
      1. Build context (memory + history + session state)
      2. Parse intent (two-stage: classify → extract)
      3. Route to correct handler (command / chat / extension / self-improve)
    """

    def __init__(self):
        self.llm_client = get_client()
        # System prompt kept for direct LLM queries (not used in main pipeline)
        self.system_prompt = (
            "You are Fluffy, a helpful and friendly AI assistant. "
            "Your creator is peryton, who designed you with the unique ability to learn new things "
            "and expand your own capabilities over time. "
            "Be concise, clear, and friendly in your responses."
        )

    def process_message(
        self,
        user_message: str,
        session_id: Optional[str] = None,
        context_messages: Optional[List[Dict[str, str]]] = None  # Legacy param, still accepted
    ) -> Dict[str, Any]:
        """
        Main entry point. Processes any user message through the full pipeline:
        Context → Parser → Router → Result

        Returns standardized dict:
          {"type": "command"|"llm", "message": str, "success": bool, "stream": list|None, "result": dict|None}
        """
        from llm_command_parser import get_llm_parser
        from context_manager import get_context_manager
        from intent_router import get_intent_router

        # ── Step 1: Build unified context ────────────────────────────────
        context = get_context_manager().build_context(session_id=session_id)

        # Merge any externally-provided legacy context_messages into turns
        if context_messages:
            existing_turn_contents = {t["content"] for t in context.get("conversation_turns", [])}
            for msg in context_messages:
                if msg.get("content") not in existing_turn_contents:
                    context["conversation_turns"].append(msg)

        # ── Step 2: Parse intent (two-stage) ─────────────────────────────
        parser = get_llm_parser()
        understanding = parser.parse_with_llm(user_message, context=context)
        print(f"[LLMService] Understanding: intent={understanding.intent}, text={understanding.text[:60] if understanding.text else ''}...")

        # ── Step 3: Apply memory updates ─────────────────────────────────
        if understanding.memory_update:
            try:
                from memory.long_term_memory import update_memory
                update_memory(understanding.memory_update)
                print("[LLMService] Applied memory update.")
            except Exception as e:
                print(f"[LLMService] Memory update failed: {e}")

        # ── Step 4: Route to correct handler ─────────────────────────────
        router = get_intent_router()
        result = router.route(understanding, original_message=user_message, session_id=session_id)

        return result

    def query_llm(self, prompt: str, context_messages: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        """
        Direct LLM query — bypasses intent classification.
        Used internally by the parser for its own LLM calls.
        """
        messages = [{"role": "system", "content": self.system_prompt}]
        if context_messages:
            for msg in context_messages:
                if "role" in msg and "content" in msg:
                    messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": prompt})

        stream = self.llm_client.chat(messages)
        return {"type": "llm", "success": True, "message": None, "stream": stream, "result": None}

    def add_assistant_message(self, message: str):
        """Legacy compatibility — session history is now managed by context_manager."""
        pass

    def clear_history(self):
        """Legacy compatibility."""
        pass

    def get_history(self) -> List[Dict[str, str]]:
        """Legacy compatibility."""
        return []


# ── Singleton ─────────────────────────────────────────────────────────────────
_service: Optional[LLMService] = None


def get_service() -> LLMService:
    """Get or create the global LLMService instance."""
    global _service
    if _service is None:
        _service = LLMService()
    return _service
