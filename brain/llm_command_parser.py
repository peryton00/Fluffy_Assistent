"""
LLM-Based Command Parser
Understands any user command using LLM and converts to structured format
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional
from enum import Enum

# Add ai module to path
sys.path.insert(0, str(Path(__file__).parent.parent / "ai" / "src"))

from command_parser import Intent


class CommandUnderstanding:
    """Result of LLM command understanding matching MarkX schema"""
    
    def __init__(self, data: Dict[str, Any]):
        self.intent = data.get("intent", "chat")
        self.parameters = data.get("parameters", {})
        self.needs_clarification = data.get("needs_clarification", False)
        self.text = data.get("text", "")
        self.memory_update = data.get("memory_update")
        self.original_text = data.get("original_text", "")
        
        # Self-improvement fields
        self.requires_new_functionality = data.get("requires_new_functionality", False)
        self.suggested_implementation = data.get("suggested_implementation", "")
        
        # Multi-step command support
        self.steps = data.get("steps", [])
    
    def __repr__(self):
        return f"CommandUnderstanding(intent={self.intent}, clarify={self.needs_clarification})"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to plain dictionary for JSON serialization"""
        return {
            "intent": self.intent,
            "parameters": self.parameters,
            "needs_clarification": self.needs_clarification,
            "text": self.text,
            "memory_update": self.memory_update,
            "original_text": self.original_text,
            "requires_new_functionality": self.requires_new_functionality,
            "suggested_implementation": self.suggested_implementation,
            "steps": self.steps
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CommandUnderstanding':
        """Create from a dictionary"""
        return cls(data)


class LLMCommandParser:
    """Parse commands using LLM for maximum flexibility (MarkX style)"""
    
    def __init__(self):
        self.llm = None  # Lazy load
        self._load_available_intents()
    
    def _load_available_intents(self):
        """Load list of currently available intents with descriptions and parameters"""
        # Define detailed intent schema for LLM
        self.intent_schema = {
            "open_app": {
                "description": "Open an application or program",
                "parameters": {"app_name": "Name of the app to launch"}
            },
            "close_app": {
                "description": "Close a running application",
                "parameters": {"app_name": "Name of the app to close"}
            },
            "create_file": {
                "description": "Create a new file with optional content",
                "parameters": {
                    "name": "Filename (e.g., 'notes.txt')",
                    "location": "Folder name (e.g., 'Desktop', 'Downloads', 'Documents')",
                    "content": "Optional text to write into the file"
                }
            },
            "create_folder": {
                "description": "Create a new folder/directory",
                "parameters": {
                    "name": "Folder name",
                    "location": "Parent folder (e.g., 'Desktop')"
                }
            },
            "delete_file": {
                "description": "Delete a file",
                "parameters": {
                    "name": "Filename",
                    "location": "Folder containing the file"
                }
            },
            "web_search": {
                "description": "Search the web for information",
                "parameters": {"query": "Search query text"}
            },
            "system_command": {
                "description": "System actions like shutdown or restart",
                "parameters": {"command": "shutdown, restart, etc."}
            },
            "type_text": {
                "description": "Type text into the currently active window",
                "parameters": {"text": "The text to type"}
            }
        }
        self.available_intents = list(self.intent_schema.keys())
    
    def _get_llm(self):
        """Lazy load LLM service"""
        if self.llm is None:
            try:
                from llm_service import get_service
                self.llm = get_service()
            except Exception as e:
                print(f"[LLMCommandParser] Failed to load LLM service: {e}")
                self.llm = None
        return self.llm
    
    def parse_with_llm(self, user_command: str) -> CommandUnderstanding:
        """
        Use LLM to understand command and convert to structured format
        Uses MarkX approach: Unified intent, response text, and memory update.
        """
        
        llm = self._get_llm()
        if not llm:
            return CommandUnderstanding({
                "intent": "chat",
                "text": "I'm having trouble connecting to my brain right now.",
                "original_text": user_command
            })
        
        # Get memory context
        try:
            from memory.long_term_memory import get_minimal_memory_for_llm
            memory_block = get_minimal_memory_for_llm()
        except:
            memory_block = {}
            
        # Build prompt for LLM
        prompt = self._build_understanding_prompt(user_command, memory_block)
        
        try:
            # Query LLM
            result = llm.query_llm(prompt)
            
            # Collect streaming response
            full_response = ""
            for chunk in result["stream"]:
                full_response += chunk
            
            # Parse JSON response
            understanding = self._parse_llm_response(full_response, user_command)
            
            return understanding
            
        except Exception as e:
            print(f"[LLMCommandParser] Error: {e}")
            return CommandUnderstanding({
                "intent": "chat",
                "text": f"I encountered an error while thinking: {e}",
                "original_text": user_command
            })
    
    def _build_understanding_prompt(self, user_command: str, memory_block: dict) -> str:
        """Build prompt for LLM to understand command using MarkX style"""
        
        memory_str = json.dumps(memory_block, indent=2) if memory_block else "No memory available"
        
        prompt = f"""You are Fluffy, a friendly and optimized AI Computer Assistant.
You were created by peryton specifically to learn things on your own and expand your capabilities through self-improvement.
User Command: "{user_command}"

Known user memory:
{memory_str}

Available Intents and Parameters:
{json.dumps(self.intent_schema, indent=2)}

Your task:
1. If the user gives a MULTI-STEP command (e.g., "open notepad and write hello world"):
   - Set intent: "multi_step"
   - Set steps: array of step objects, each with intent, parameters, and text
   - Set text: Overall response describing what you'll do
2. If the user asks for a feature you don't have:
   - Set intent: a_descriptive_underscored_name
   - Set requires_new_functionality: true
   - Set suggested_implementation: Technical description
3. If it's just chat, set intent: "chat" and provide a warm 1-2 sentence response.
4. If the user shares something personal, include it in 'memory_update'.

Return ONLY a JSON object (no markdown, no blocks):
{{
    "intent": "intent_name, 'multi_step', 'unknown', or 'chat'",
    "parameters": {{}},
    "steps": [],
    "needs_clarification": false,
    "requires_new_functionality": false,
    "suggested_implementation": "",
    "text": "Your direct response to the user",
    "memory_update": {{
        "user_profile": {{
            "identity": {{}},
            "preferences": {{}}
        }}
    }}
}}

Examples:
User: "open chrome"
{{
    "intent": "open_app",
    "parameters": {{"app_name": "chrome"}},
    "needs_clarification": false,
    "text": "Sure! I'm opening Chrome for you now."
}}

User: "open notepad and write hello world program in it"
{{
    "intent": "multi_step",
    "steps": [
        {{
            "intent": "open_app",
            "parameters": {{"app_name": "notepad"}},
            "text": "Opening Notepad..."
        }},
        {{
            "intent": "type_text",
            "parameters": {{"text": "print('Hello, World!')"}},
            "text": "Writing the hello world program..."
        }}
    ],
    "text": "Sure! I'll open Notepad and write a hello world program for you."
}}

User: "my name is Alex"
{{
    "intent": "chat",
    "parameters": {{}},
    "needs_clarification": false,
    "text": "Nice to meet you, Alex! I've remembered your name.",
    "memory_update": {{
        "user_profile": {{
            "identity": {{"name": "Alex"}}
        }}
    }}
}}

User: "I want a feature to compress folders"
{{
    "intent": "unknown",
    "requires_new_functionality": true,
    "suggested_implementation": "A tool that uses the zipfile library to compress a given path.",
    "text": "I don't have that yet, but I can learn it!"
}}

Now analyze: "{user_command}"
"""
        return prompt
    
    def _parse_llm_response(self, response: str, original_text: str) -> CommandUnderstanding:
        """Parse LLM's JSON response using MarkX's safe_json_parse logic"""
        
        try:
            text = response.strip()
            # Clean markdown if present
            if "```json" in text:
                start = text.index("```json") + 7
                end = text.index("```", start)
                text = text[start:end].strip()
            elif "```" in text:
                start = text.index("```") + 3
                end = text.index("```", start)
                text = text[start:end].strip()
            
            # Find JSON boundaries
            if "{" in text:
                start = text.index("{")
                end = text.rindex("}") + 1
                json_str = text[start:end]
                data = json.loads(json_str)
            else:
                # Fallback if no JSON found
                data = {
                    "intent": "chat",
                    "text": response.strip(),
                    "needs_clarification": False
                }
            
            data["original_text"] = original_text
            return CommandUnderstanding(data)
            
        except Exception as e:
            print(f"[LLMCommandParser] Failed to parse: {e}")
            return CommandUnderstanding({
                "intent": "chat",
                "text": response.strip() if response else "I didn't quite get that.",
                "original_text": original_text
            })
    
    def is_capability_available(self, intent: str) -> bool:
        """Check if Fluffy currently has this capability"""
        return intent in self.available_intents


# Global singleton
_llm_parser = None

def get_llm_parser() -> LLMCommandParser:
    """Get or create the global LLMCommandParser instance"""
    global _llm_parser
    if _llm_parser is None:
        _llm_parser = LLMCommandParser()
    return _llm_parser


# Test function
if __name__ == "__main__":
    print("=" * 70)
    print("LLM Command Parser - Test")
    print("=" * 70)
    
    parser = get_llm_parser()
    
    test_commands = [
        "open chrome",  # Existing functionality
        "download the latest Python installer",  # New functionality
        "compress my Documents folder to a zip file",  # New functionality
        "create animated website for Sarah",  # Existing functionality
    ]
    
    for cmd in test_commands:
        print(f"\n{'='*70}")
        print(f"Command: '{cmd}'")
        print("=" * 70)
        
        understanding = parser.parse_with_llm(cmd)
        
        print(f"Intent: {understanding.intent}")
        print(f"Parameters: {understanding.parameters}")
        print(f"Requires New Functionality: {understanding.requires_new_functionality}")
        print(f"Confidence: {understanding.confidence}")
        
        if understanding.requires_new_functionality:
            print(f"Suggested Implementation: {understanding.suggested_implementation}")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
