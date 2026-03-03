---
description: Refactor chat and command parsing into a robust, multi-stage, memory-aware pipeline
---

# Workflow: Chat & Command Parsing Refactor

This workflow implements a clean, reliable pipeline for Fluffy's chat and command execution.
Follow these steps in order. Each step is a self-contained implementation task.

---

## Phase 1 — Context Manager (Foundation)

**Goal:** Create a single object that provides all context the LLM needs.

1. Create `brain/context_manager.py` with a `ContextManager` class.
2. It should expose a single method: `build_context(session_id) -> dict` that returns:
   - `user_profile`: from `long_term_memory.get_minimal_memory_for_llm()`
   - `conversation_turns`: last 10 messages from `chat_history.load_session(session_id)` formatted as `[{"role": "user"|"assistant", "content": "..."}]`
   - `session_state`: from `session_memory.get_context_for_llm()` (pending intent, last actions)
3. Export a `get_context_manager()` singleton.

---

## Phase 2 — Intent Router (Core Logic)

**Goal:** Remove routing logic from `llm_service.py` into a dedicated, testable router.

1. Create `brain/intent_router.py` with a `route(understanding, context) -> dict` function.
2. Routing priority order:
   - If `session_memory.has_pending_validation()` and message is a confirmation word → Execute pending validation.
   - If `session_memory.get_pending_improvement()` and message is a confirmation word → Execute pending improvement.
   - If `understanding.requires_new_functionality` is True → `SelfImprover.handle_improvement_request()`
   - If intent is in `Intent` enum (system command) → `CommandExecutor.execute()`
   - If intent is in `ExtensionLoader.extensions` → `ExtensionLoader.execute()`
   - If intent is `"chat"` or unrecognized → Return `{"type": "chat", "text": understanding.text}`
3. The function must always return a standardized `{"type", "message", "success"}` dict.

---

## Phase 3 — Two-Stage Parser (Reliability Fix)

**Goal:** Split parsing into cheap classification + targeted extraction.

1. Refactor `brain/llm_command_parser.py`:

   **Stage 1 — Fast Classify** (`_classify_intent(message, last_2_turns) -> str`):
   - Tight prompt: ~200 tokens. Goal: return ONLY one of: `command | chat | new_feature | confirmation`.
   - No JSON — just a single word response.
   - Use last 2 conversation turns for context.

   **Stage 2 — Parameter Extract** (`_extract_parameters(message, intent, context) -> dict`):
   - Only called if Stage 1 returns `"command"`.
   - Ask LLM for structured JSON with `intent`, `parameters`, and `text` only.
   - Use the intent schema for the specific identified command, not the full schema.

2. Update `parse_with_llm()` to call both stages in sequence.
3. For `chat` classification, set `intent = "chat"` and call the full LLM for a response.

---

## Phase 4 — LLM Service Cleanup (Simplification)

**Goal:** Make `llm_service.py` a thin orchestrator.

1. Remove the routing `if/elif` chain from `process_message()`.
2. Replace with:
   ```python
   context = get_context_manager().build_context(session_id)
   understanding = parser.parse_with_llm(user_message, context)
   return get_intent_router().route(understanding, context)
   ```
3. Remove the now-redundant `_execute_unified_command()` and `_execute_multi_step_command()` methods (move to `intent_router.py`).

---

## Phase 5 — Executor Intent Normalization (Bug Fix)

**Goal:** Ensure both enum and string intents work in the executor and validator.

1. At the top of `CommandExecutor.execute()`, normalize intent:
   ```python
   intent_value = command.intent.value if hasattr(command.intent, 'value') else str(command.intent)
   ```
2. Replace all `if command.intent == Intent.OPEN_APP:` checks with `if intent_value == "open_app":`.
3. Apply the same normalization in `ActionValidator.validate()`.

---

## Phase 6 — Memory Extension (Behavioral Learning)

**Goal:** Make Fluffy learn from usage patterns.

1. Extend `brain/memory/long_term_memory.py` memory schema with a `behavior` key:
   ```json
   "behavior": {
     "frequent_intents": {},
     "learned_apps": [],
     "command_history": []
   }
   ```
2. Add a `record_command(intent: str, success: bool)` function that:
   - Appends to `command_history` (keep last 100).
   - Increments `frequent_intents[intent]` counter.
3. Call `record_command()` from the `IntentRouter` after every execution.

---

## Verification Steps

1. Send: `"open notepad"` → should launch Notepad (system command).
2. Send: `"what is the capital of France?"` → should return a text answer (chat, no command).
3. Send: `"write python code to add two numbers"` → should return code as text (chat fallback).
4. Send: `"create a folder named test on Desktop"` → should create the folder (system command).
5. Send: `"my name is Alex"` → should remember name and confirm (memory update).
6. Send: `"my name is Alex"` → then send `"what is my name?"` → should say "Alex" (context memory).
7. Verify no "Unknown command type" errors occur for any of the above.
