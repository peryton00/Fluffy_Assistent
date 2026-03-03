"""
LLM-Based Command Parser — Two-Stage Architecture
Stage 1 (Fast Classify): Cheap LLM call, returns: command | chat | new_feature | confirmation
Stage 2 (Extract Params): Targeted LLM call only when Stage 1 returns "command"
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional, List

# Add ai module to path so we can import from ai/src directly
_ai_src = str(Path(__file__).parent.parent / "ai" / "src")
if _ai_src not in sys.path:
    sys.path.insert(0, _ai_src)

from command_parser import Intent


class CommandUnderstanding:
    """Result of LLM command understanding."""

    def __init__(self, data: Dict[str, Any]):
        self.intent = data.get("intent", "chat")
        self.parameters = data.get("parameters", {})
        self.needs_clarification = data.get("needs_clarification", False)
        self.text = data.get("text", "")
        self.memory_update = data.get("memory_update")
        self.original_text = data.get("original_text", "")
        self.requires_new_functionality = data.get("requires_new_functionality", False)
        self.suggested_implementation = data.get("suggested_implementation", "")
        self.steps = data.get("steps", [])

    def __repr__(self):
        return f"CommandUnderstanding(intent={self.intent}, clarify={self.needs_clarification})"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.intent,
            "parameters": self.parameters,
            "needs_clarification": self.needs_clarification,
            "text": self.text,
            "memory_update": self.memory_update,
            "original_text": self.original_text,
            "requires_new_functionality": self.requires_new_functionality,
            "suggested_implementation": self.suggested_implementation,
            "steps": self.steps,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CommandUnderstanding":
        return cls(data)


class LLMCommandParser:
    """Parse commands using a two-stage LLM approach for maximum reliability."""

    def __init__(self):
        self.llm_client = None   # Direct LLM client (avoids circular import with LLMService)
        self.extension_loader = None
        self.system_prompt = (
            "You are Fluffy, a helpful and friendly AI assistant created by peryton. "
            "Be concise, clear, and warm."
        )
        self._load_available_intents()

    def _get_extension_loader(self):
        if self.extension_loader is None:
            try:
                from extension_loader import get_extension_loader
                self.extension_loader = get_extension_loader()
            except Exception as e:
                print(f"[LLMCommandParser] Failed to load ExtensionLoader: {e}")
        return self.extension_loader

    def _load_available_intents(self):
        """Load intent schema for Stage 2 extraction."""
        self.intent_schema = {
            "open_app": {"description": "Open an application or program", "parameters": {"app_name": "Name of the app"}},
            "close_app": {"description": "Close a running application", "parameters": {"app_name": "Name of the app"}},
            "create_file": {"description": "Create a new file with optional content", "parameters": {"name": "Filename", "location": "Folder", "content": "Optional content"}},
            "create_folder": {"description": "Create a new folder/directory", "parameters": {"name": "Folder name", "location": "Parent folder"}},
            "delete_file": {"description": "Delete a file", "parameters": {"name": "Filename", "location": "Folder"}},
            "delete_folder": {"description": "Delete a folder", "parameters": {"name": "Folder name", "location": "Parent folder"}},
            "web_search": {"description": "Search the web for information", "parameters": {"query": "Search query"}},
            "system_command": {"description": "System actions: shutdown, restart, lock", "parameters": {"command": "shutdown|restart|lock"}},
            "type_text": {"description": "Type text into active window", "parameters": {"text": "Text to type"}},
            "kill_process": {"description": "Kill a running process by name", "parameters": {"process_name": "Process name"}},
            "create_project": {"description": "Create a code/website project", "parameters": {"project_type": "Type", "description": "Description", "location": "Folder"}},
            "research": {"description": "Research a topic and save notes", "parameters": {"topic": "Topic to research"}},
            "help": {"description": "Show available commands", "parameters": {}},
            "write_code": {"description": "Write code/script/program and SAVE it to a file (not just explain it in chat)", "parameters": {"language": "Programming language (python, js, etc)", "description": "What the code should do", "filename": "Optional filename", "location": "Optional save folder"}},
        }
        self.available_intents = list(self.intent_schema.keys())

        # Load extension intents
        loader = self._get_extension_loader()
        if loader:
            for ext in loader.list_extensions():
                self.intent_schema[ext["intent"]] = {
                    "description": ext["description"],
                    "parameters": ext.get("metadata", {}).get("parameters", {}),
                    "patterns": ext.get("patterns", []),
                }
                if ext["intent"] not in self.available_intents:
                    self.available_intents.append(ext["intent"])

    def _get_llm_client(self):
        """Get the raw LLM client (avoids circular import with LLMService)."""
        if self.llm_client is None:
            try:
                from llm_client import get_client
                self.llm_client = get_client()
            except Exception as e:
                print(f"[LLMCommandParser] Failed to load LLM client: {e}")
        return self.llm_client

    def _query_llm(self, prompt: str) -> str:
        """Run a single prompt through the LLM and return the full response string."""
        client = self._get_llm_client()
        if not client:
            return ""
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": prompt}
        ]
        try:
            stream = client.chat(messages)
            chunks = [str(c) for c in stream]
            return "".join(chunks)
        except Exception as e:
            print(f"[LLMCommandParser] LLM query error: {e}")
            return ""

    def parse_with_llm(
        self,
        user_command: str,
        context: Optional[Dict[str, Any]] = None
    ) -> CommandUnderstanding:
        """
        Two-stage parsing:
          Stage 1 — Fast classify: command | chat | new_feature | confirmation
          Stage 2 — Parameter extraction (only for "command")
        """
        # Hot-reload extensions
        loader = self._get_extension_loader()
        if loader:
            newly = loader.refresh_extensions()
            if newly:
                self._load_available_intents()

        client = self._get_llm_client()
        if not client:
            return CommandUnderstanding({"intent": "chat", "text": "I can't connect to my brain right now.", "original_text": user_command})

        # Build context parts
        context = context or {}
        user_profile = context.get("user_profile", {})
        conversation_turns = context.get("conversation_turns", [])

        # ── Stage 1: Fast Classification ─────────────────────────────────
        classification = self._stage1_classify(user_command, conversation_turns, user_profile)
        print(f"[LLMCommandParser] Stage 1 classification: {classification}")

        if classification == "chat":
            return self._stage_chat_response(client, user_command, conversation_turns, user_profile)

        if classification == "new_feature":
            return self._stage_new_feature(user_command)

        if classification == "confirmation":
            return CommandUnderstanding({"intent": "chat", "text": "", "original_text": user_command})

        # classification == "command"
        # ── Stage 2: Parameter Extraction ────────────────────────────────
        return self._stage2_extract(user_command, conversation_turns, user_profile)

    # ── Stage 1 ───────────────────────────────────────────────────────────────

    def _stage1_classify(self, user_command: str, turns: list, user_profile: dict) -> str:
        """
        Fast, cheap classification. Returns one of:
          command | chat | new_feature | confirmation
        """
        recent_turns = ""
        if turns:
            last2 = turns[-2:] if len(turns) >= 2 else turns
            lines = [f"{'User' if t['role'] == 'user' else 'Fluffy'}: {t['content']}" for t in last2]
            recent_turns = "\n".join(lines)

        available_str = ", ".join(self.available_intents)

        prompt = f"""You are a routing classifier for an AI assistant called Fluffy.
Classify the message into exactly ONE of these categories:
- command       → User wants Fluffy to PERFORM an action on the computer:
                   open/close apps, create/delete files or folders, search the web,
                   system commands (shutdown/restart), type text, create a project,
                   or WRITE AND SAVE a program/script/code to a file.
- chat          → User wants information, explanation, or general knowledge
                   (e.g. "how does X work?", "what is X?", "explain X", "tell me about X")
- new_feature   → User wants Fluffy to do something it clearly cannot do yet
- confirmation  → User is saying yes/no to a previous question from Fluffy

IMPORTANT: Requests like "write a program to X", "write a script to X", "write code for X",
"create a python file that X", "make a program that X" are COMMANDS (they must create and save files).
NOT chat.

Available system commands: {available_str}

Recent conversation (last 2 turns):
{recent_turns or "(none)"}

User's message: "{user_command}"

Reply with ONLY one word: command, chat, new_feature, or confirmation."""

        try:
            response = self._query_llm(prompt).strip().lower()
            first_word = response.split()[0] if response.split() else "chat"
            if first_word in ("command", "chat", "new_feature", "confirmation"):
                return first_word
            return "chat"
        except Exception as e:
            print(f"[LLMCommandParser] Stage 1 error: {e}")
            return "chat"

    # ── Stage 2 ───────────────────────────────────────────────────────────────

    def _stage2_extract(self, user_command: str, turns: list, user_profile: dict) -> CommandUnderstanding:
        """
        Targeted parameter extraction. Only called when Stage 1 returns "command".
        """
        memory_str = json.dumps(user_profile, indent=2) if user_profile else "None"
        schema_str = json.dumps(self.intent_schema, indent=2)

        recent_turns = ""
        if turns:
            last2 = turns[-2:] if len(turns) >= 2 else turns
            lines = [f"{'User' if t['role'] == 'user' else 'Fluffy'}: {t['content']}" for t in last2]
            recent_turns = "\n".join(lines)

        prompt = f"""You are Fluffy, an AI Computer Assistant. Extract the intent and parameters from the user's command.

User memory context:
{memory_str}

Recent conversation:
{recent_turns or "(none)"}

User command: "{user_command}"

Available intents and their parameters:
{schema_str}

Rules:
- If it is a MULTI-STEP command (e.g., "open notepad and type hello"), use intent "multi_step" with a "steps" array.
- Each step in "steps" must have: intent, parameters, text.
- Use "text" for a friendly human response describing what you will do.
- If command needs a feature NOT in the list above, set requires_new_functionality to true.
- Set memory_update only if user shared personal info (name, location, preferences).

Return ONLY valid JSON (no markdown, no extra text):
{{
  "intent": "intent_name",
  "parameters": {{}},
  "steps": [],
  "needs_clarification": false,
  "requires_new_functionality": false,
  "suggested_implementation": "",
  "text": "Friendly response describing what you will do",
  "memory_update": null
}}"""

        try:
            full_response = self._query_llm(prompt)
            return self._parse_json_response(full_response, user_command)
        except Exception as e:
            print(f"[LLMCommandParser] Stage 2 error: {e}")
            return CommandUnderstanding({"intent": "chat", "text": f"I had trouble understanding that: {e}", "original_text": user_command})

    # ── Chat Stage ────────────────────────────────────────────────────────────

    def _stage_chat_response(self, client, user_command: str, turns: list, user_profile: dict) -> CommandUnderstanding:
        """Generate a full LLM chat response using the raw client directly."""
        memory_str = json.dumps(user_profile, indent=2) if user_profile else "None"

        messages = [
            {"role": "system", "content": (
                "You are Fluffy, a helpful and friendly AI assistant created by peryton. "
                "Be concise, clear, and warm. "
                "You have the ability to control the user's computer, but right now just answer helpfully."
            )}
        ]

        if user_profile:
            messages.append({"role": "system", "content": f"User context: {memory_str}"})

        for turn in turns[-6:]:
            messages.append({"role": turn["role"], "content": turn["content"]})

        messages.append({"role": "user", "content": user_command})

        try:
            stream = client.chat(messages)
            # Collect stream safely — handles both string chunks and generator items
            text = "".join(str(c) for c in stream)

            # Check for memory update hints
            memory_update = None
            if any(kw in user_command.lower() for kw in ["my name is", "i am", "i live in", "i prefer"]):
                memory_update = self._extract_memory_update(user_command)

            return CommandUnderstanding({
                "intent": "chat",
                "text": text,
                "original_text": user_command,
                "memory_update": memory_update
            })
        except Exception as e:
            print(f"[LLMCommandParser] Chat stage error: {e}")
            return CommandUnderstanding({"intent": "chat", "text": "I'm having trouble thinking right now.", "original_text": user_command})

    def _stage_new_feature(self, user_command: str) -> CommandUnderstanding:
        """Handle new feature requests via a short extraction."""
        prompt = f"""Fluffy needs new functionality. Extract a snake_case intent name and implementation description.

User request: "{user_command}"

Return ONLY valid JSON:
{{
  "intent": "descriptive_snake_case_intent",
  "requires_new_functionality": true,
  "suggested_implementation": "Technical description of how to implement this as a Python function",
  "text": "I don't have that yet, but I can learn it! Would you like me to create this feature? (Say yes to proceed)",
  "parameters": {{}}
}}"""
        try:
            full = self._query_llm(prompt)
            understanding = self._parse_json_response(full, user_command)
            understanding.requires_new_functionality = True
            return understanding
        except Exception as e:
            return CommandUnderstanding({
                "intent": "new_feature",
                "requires_new_functionality": True,
                "text": "I don't have that capability yet, but I can learn it! Say 'yes' if you'd like me to add it.",
                "original_text": user_command
            })

    def _extract_memory_update(self, user_command: str) -> Optional[dict]:
        """Extract memory update from a chat message if it contains personal info."""
        prompt = f"""Extract personal information from this message as a JSON memory_update, or return null.

Message: "{user_command}"

Return ONLY JSON like: {{"user_profile": {{"identity": {{"name": {{"value": "Alex"}}}}}}}}
Or return: null"""
        try:
            text = self._query_llm(prompt).strip()
            if "{" in text:
                return json.loads(text[text.index("{"):text.rindex("}") + 1])
        except Exception:
            pass
        return None

    # ── JSON Parser ───────────────────────────────────────────────────────────

    def _parse_json_response(self, response: str, original_text: str) -> CommandUnderstanding:
        """Safely parse LLM JSON response."""
        try:
            text = response.strip()
            # Strip markdown code fences
            if "```json" in text:
                text = text[text.index("```json") + 7:text.rindex("```")].strip()
            elif "```" in text:
                text = text[text.index("```") + 3:text.rindex("```")].strip()

            if "{" in text:
                json_str = text[text.index("{"):text.rindex("}") + 1]
                data = json.loads(json_str)
            else:
                data = {"intent": "chat", "text": response.strip(), "needs_clarification": False}

            data["original_text"] = original_text
            return CommandUnderstanding(data)
        except Exception as e:
            print(f"[LLMCommandParser] JSON parse error: {e}")
            return CommandUnderstanding({"intent": "chat", "text": response.strip() or "I didn't quite get that.", "original_text": original_text})

    def is_capability_available(self, intent: str) -> bool:
        """Check if Fluffy currently has this capability."""
        return intent in self.available_intents


# ── Singleton ─────────────────────────────────────────────────────────────────
_llm_parser: Optional[LLMCommandParser] = None


def get_llm_parser() -> LLMCommandParser:
    global _llm_parser
    if _llm_parser is None:
        _llm_parser = LLMCommandParser()
    return _llm_parser
