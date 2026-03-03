"""
Context Manager for Fluffy Assistant
Merges LongTermMemory + ChatHistory + SessionMemory into a single
context object for the LLM, ensuring consistent, memory-aware responses.
"""

from typing import Optional, List, Dict, Any


class ContextManager:
    """
    Single source of truth for LLM context.
    Combines three memory layers:
      1. Long-term  — user profile, preferences, behavioral history (persisted to disk)
      2. Session    — pending intents, action context (RAM only, resets on restart)
      3. Chat       — labeled conversation turns from disk-backed ChatHistory
    """

    def build_context(
        self,
        session_id: Optional[str] = None,
        max_turns: int = 10
    ) -> Dict[str, Any]:
        """
        Build a unified context dict for LLM prompts.

        Args:
            session_id: Chat history session to load turns from.
            max_turns:  Max number of recent conversation turns to include.

        Returns:
            {
              "user_profile":        dict  — compact memory for LLM,
              "conversation_turns":  list  — [{role, content}, ...],
              "session_state":       dict  — pending actions / context
            }
        """
        context: Dict[str, Any] = {
            "user_profile": {},
            "conversation_turns": [],
            "session_state": {}
        }

        # ── Layer 1: Long-term user profile ──────────────────────────────
        try:
            from memory.long_term_memory import get_minimal_memory_for_llm
            context["user_profile"] = get_minimal_memory_for_llm()
        except Exception as e:
            print(f"[ContextManager] Could not load long-term memory: {e}")

        # ── Layer 2: Chat history turns ───────────────────────────────────
        if session_id:
            try:
                from chat_history import ChatHistory
                history = ChatHistory()
                session = history.load_session(session_id)

                if session and "messages" in session:
                    messages = session["messages"][-max_turns:] if len(session["messages"]) > max_turns else session["messages"]
                    turns = []
                    for msg in messages:
                        # Handle both role/content and type/text formats
                        role = msg.get("role") or ("user" if msg.get("type") == "user" else "assistant")
                        content = msg.get("content") or msg.get("text") or ""
                        if content and role in ("user", "assistant"):
                            turns.append({"role": role, "content": content})
                    context["conversation_turns"] = turns
            except Exception as e:
                print(f"[ContextManager] Could not load chat history: {e}")

        # ── Layer 3: Session state ────────────────────────────────────────
        try:
            from memory.session_memory import get_session_memory
            session_mem = get_session_memory()
            context["session_state"] = session_mem.get_context_for_llm()
        except Exception as e:
            print(f"[ContextManager] Could not load session memory: {e}")

        return context

    def format_turns_for_prompt(self, turns: List[Dict[str, str]]) -> str:
        """Format conversation turns as a readable string for prompt injection."""
        lines = []
        for turn in turns:
            role_label = "User" if turn["role"] == "user" else "Fluffy"
            lines.append(f"{role_label}: {turn['content']}")
        return "\n".join(lines)


# ── Singleton ─────────────────────────────────────────────────────────────────
_context_manager: Optional[ContextManager] = None


def get_context_manager() -> ContextManager:
    """Get or create the global ContextManager instance."""
    global _context_manager
    if _context_manager is None:
        _context_manager = ContextManager()
    return _context_manager
