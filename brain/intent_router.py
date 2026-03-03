"""
Intent Router for Fluffy Assistant
Deterministic routing of parsed intents to the correct handler.
This replaces the scattered routing logic in llm_service.py.
"""

from typing import Dict, Any, Optional


# ── Canonical intent values from command_parser.Intent enum ───────────────────
_SYSTEM_COMMAND_INTENTS = {
    "close_app", "create_file", "create_folder", "delete_file",
    "delete_folder", "system_command", "kill_process", "web_search",
    "open_app", "type_text", "create_project", "bluetooth_control",
    "research", "chat", "help", "confirm", "cancel", "write_code"
}

# Words that count as "yes" confirmations
_CONFIRMATION_WORDS = {"yes", "y", "sure", "do it", "proceed", "okay", "ok", "go ahead", "yeah"}


def _is_confirmation(text: str) -> bool:
    text_lower = text.strip().lower()
    return any(word in text_lower for word in _CONFIRMATION_WORDS)


class IntentRouter:
    """
    Routes a CommandUnderstanding to the correct executor.

    Priority order:
      1. Pending validation confirmation (system command safety check)
      2. Pending self-improvement confirmation
      3. Self-improvement request (new functionality)
      4. Multi-step command
      5. Known system command (Intent enum)
      6. Known extension
      7. Chat / fallback
    """

    def route(
        self,
        understanding,              # CommandUnderstanding
        original_message: str,      # Raw user text (for confirmation checks)
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Route the understanding to the correct handler and return a standard result dict.

        Returns:
            {"type": "command"|"llm", "message": str, "success": bool, ...}
        """
        from memory.session_memory import get_session_memory
        session = get_session_memory()

        # ── Priority 1: Pending safety validation ─────────────────────────
        if session.has_pending_validation():
            if _is_confirmation(original_message):
                print("[IntentRouter] ✅ Safety validation confirmed, executing...")
                pending_cmd, pending_validation = session.get_pending_validation()
                session.clear_pending_validation()
                return self._execute_command(pending_cmd, pending_validation)
            else:
                print("[IntentRouter] Validation declined.")
                session.clear_pending_validation()
                return self._chat_result("Understood, I won't do that.", success=True)

        # ── Priority 2: Pending self-improvement confirmation ──────────────
        pending_improvement = session.get_pending_improvement()
        if pending_improvement:
            if _is_confirmation(original_message):
                print(f"[IntentRouter] 🚀 Running self-improvement: {pending_improvement.get('intent')}")
                session.clear_pending_improvement()
                return self._execute_self_improvement(pending_improvement, original_message)
            else:
                print("[IntentRouter] Self-improvement declined.")
                session.clear_pending_improvement()
                return self._chat_result("No problem, I won't add that feature.", success=True)

        # ── Priority 3: New functionality request ──────────────────────────
        if understanding.requires_new_functionality:
            return self._handle_new_functionality(understanding, session)

        # ── Priority 4: Multi-step command ────────────────────────────────
        if understanding.intent == "multi_step" and understanding.steps:
            return self._execute_multi_step(understanding)

        # ── Priority 5: Known system command ──────────────────────────────
        intent_value = understanding.intent if isinstance(understanding.intent, str) else str(understanding.intent)

        if intent_value in _SYSTEM_COMMAND_INTENTS and intent_value not in ("chat", "confirm", "cancel"):
            return self._execute_system_command(understanding)

        # ── Priority 6: Known extension ───────────────────────────────────
        try:
            from extension_loader import get_extension_loader
            loader = get_extension_loader()
            if loader.has_extension(intent_value):
                return self._execute_extension(understanding, loader)
        except Exception as e:
            print(f"[IntentRouter] Extension check error: {e}")

        # ── Priority 7: Fallback to chat ──────────────────────────────────
        print(f"[IntentRouter] Intent '{intent_value}' treated as chat.")
        return {
            "type": "llm",
            "success": True,
            "message": understanding.text,
            "stream": [understanding.text],
            "result": None
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _execute_system_command(self, understanding) -> Dict[str, Any]:
        """Execute a known system command via the validator + executor pipeline."""
        try:
            from command_parser import Command, Intent
            from action_validator import ActionValidator

            # Normalize intent
            intent_value = understanding.intent if isinstance(understanding.intent, str) else str(understanding.intent)
            try:
                intent_obj = Intent(intent_value)
            except ValueError:
                intent_obj = intent_value  # String fallback for extensions

            # raw_text is the correct attribute name on Command (not original_text)
            cmd = Command(
                intent=intent_obj,
                parameters=understanding.parameters,
                raw_text=understanding.original_text or understanding.text
            )
            cmd.llm_response = understanding.text

            validator = ActionValidator()
            validation = validator.validate(cmd)

            return self._execute_command(cmd, validation)

        except Exception as e:
            return self._error_result(f"Command execution failed: {e}")

    def _execute_command(self, cmd, validation) -> Dict[str, Any]:
        """Run a validated command and return standardized result."""
        from command_executor import CommandExecutor
        from action_validator import SafetyLevel
        from memory.session_memory import get_session_memory

        # Handle confirmation-needed commands
        if validation.safety_level == SafetyLevel.NEEDS_CONFIRMATION:
            session = get_session_memory()
            from action_validator import ValidationResult
            confirmed_validation = ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="User confirmed")
            session.set_pending_validation(cmd, confirmed_validation)
            return self._chat_result(validation.message, success=False)

        executor = CommandExecutor()
        result = executor.execute(cmd, validation)

        # Record to behavioral memory
        try:
            intent_value = cmd.intent.value if hasattr(cmd.intent, "value") else str(cmd.intent)
            from memory.long_term_memory import record_command
            record_command(intent_value, result.get("success", False))
        except Exception:
            pass

        success = result.get("success", False)
        # Build the message: use the LLM-generated text on success, executor message on failure
        if success:
            msg = getattr(cmd, "llm_response", None) or result.get("message", "Done!")
        else:
            msg = f"I'm sorry, I couldn't do that. {result.get('message', 'An error occurred.')}"

        return {
            "type": "command",
            "success": success,
            "message": msg,
            "stream": None,
            "result": result
        }

    def _execute_extension(self, understanding, loader) -> Dict[str, Any]:
        """Execute an extension."""
        try:
            from command_parser import Command
            intent_value = understanding.intent if isinstance(understanding.intent, str) else str(understanding.intent)

            class _MockIntent:
                def __init__(self, v): self.value = v

            cmd = Command(intent=_MockIntent(intent_value), parameters=understanding.parameters, raw_text=understanding.original_text)
            cmd.llm_response = understanding.text

            from action_validator import ActionValidator
            validator = ActionValidator()
            validation = validator.validate(cmd)

            result = loader.execute(cmd, validation)

            try:
                from memory.long_term_memory import record_command
                record_command(intent_value, result.get("success", False))
            except Exception:
                pass

            success = result.get("success", False)
            response_text = understanding.text or result.get("message", "Done!")
            if not success:
                response_text = f"I'm sorry, I couldn't do that. {result.get('message', 'An error occurred.')}"

            return {
                "type": "command",
                "success": success,
                "message": response_text,
                "stream": None,
                "result": result
            }
        except Exception as e:
            return self._error_result(f"Extension error: {e}")

    def _execute_multi_step(self, understanding) -> Dict[str, Any]:
        """Execute multi-step commands sequentially."""
        from command_parser import Command, Intent
        from action_validator import ActionValidator
        from command_executor import CommandExecutor
        import time

        results = []
        all_success = True
        executor = CommandExecutor()
        validator = ActionValidator()

        for i, step in enumerate(understanding.steps):
            try:
                intent_str = step.get("intent", "")
                try:
                    intent_obj = Intent(intent_str)
                except (ValueError, KeyError):
                    intent_obj = intent_str

                cmd = Command(intent=intent_obj, parameters=step.get("parameters", {}), raw_text=understanding.original_text)
                cmd.llm_response = step.get("text", "")

                val = validator.validate(cmd)
                result = executor.execute(cmd, val)

                results.append({"step": i + 1, "success": result.get("success", False), "message": step.get("text", result.get("message", ""))})

                if not result.get("success", False):
                    all_success = False
                    break

                if i < len(understanding.steps) - 1:
                    time.sleep(1.5)

            except Exception as e:
                results.append({"step": i + 1, "success": False, "message": f"Error: {e}"})
                all_success = False
                break

        msg = understanding.text if all_success else f"Completed {len([r for r in results if r['success']])} of {len(understanding.steps)} steps."
        return {
            "type": "command",
            "success": all_success,
            "message": msg,
            "stream": None,
            "result": {"multi_step": True, "steps": results}
        }

    def _handle_new_functionality(self, understanding, session) -> Dict[str, Any]:
        """Trigger self-improvement flow for unknown capability requests."""
        try:
            from self_improver import get_self_improver
            improver = get_self_improver()
            result = improver.handle_improvement_request(understanding)
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
            return self._error_result(f"Self-improvement error: {e}")

    def _execute_self_improvement(self, pending_understanding: dict, user_command: str) -> Dict[str, Any]:
        from self_improver import get_self_improver
        from llm_command_parser import CommandUnderstanding
        improver = get_self_improver()
        understanding = CommandUnderstanding.from_dict(pending_understanding)
        result = improver.execute_improvement(user_command=user_command, understanding=understanding)
        return {
            "type": "command",
            "success": result.get("success", False),
            "message": result.get("message", "Extension created!"),
            "stream": None,
            "result": result
        }

    def _chat_result(self, message: str, success: bool = True) -> Dict[str, Any]:
        return {"type": "llm", "success": success, "message": message, "stream": [message], "result": None}

    def _error_result(self, message: str) -> Dict[str, Any]:
        return {"type": "command", "success": False, "message": message, "stream": None, "result": {"action": "error"}}


def understanding_text_or(result: dict, cmd) -> str:
    """Get the best response text: LLM text if success, executor message if failure."""
    if result.get("success"):
        llm_text = getattr(cmd, "llm_response", None)
        return llm_text or result.get("message", "Done!")
    return f"I'm sorry, I couldn't do that. {result.get('message', 'An error occurred.')}"


# ── Singleton ─────────────────────────────────────────────────────────────────
_intent_router: Optional[IntentRouter] = None


def get_intent_router() -> IntentRouter:
    global _intent_router
    if _intent_router is None:
        _intent_router = IntentRouter()
    return _intent_router
