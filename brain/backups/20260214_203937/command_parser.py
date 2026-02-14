"""
Command Parser for Voice Commands
Extracts intent and parameters from natural language commands
"""

import re
from typing import Optional, Dict, Any
from enum import Enum
from pathlib import Path
import os


class Intent(Enum):
    """Command intents"""
    CLOSE_APP = "close_app"
    CREATE_FILE = "create_file"
    CREATE_FOLDER = "create_folder"
    DELETE_FILE = "delete_file"
    DELETE_FOLDER = "delete_folder"
    SYSTEM_COMMAND = "system_command"
    KILL_PROCESS = "kill_process"
    WEB_SEARCH = "web_search"
    OPEN_APP = "open_app"
    TYPE_TEXT = "type_text"  # NEW: For keyboard automation
    CREATE_PROJECT = "create_project"  # NEW: For AI project generation
    RESEARCH = "research"
    HELP = "help"
    CONFIRM = "confirm"
    CANCEL = "cancel"
    UNKNOWN = "unknown"



class Command:
    """Parsed command with intent and parameters"""
    def __init__(self, intent: Intent, parameters: Dict[str, Any], raw_text: str):
        self.intent = intent
        self.parameters = parameters
        self.raw_text = raw_text
    
    def __repr__(self):
        return f"Command(intent={self.intent.value}, params={self.parameters})"


class CommandParser:
    """
    Natural language command parser using regex patterns
    """
    
    # Command patterns (order matters - more specific first)
    PATTERNS = {
        Intent.CLOSE_APP: [
            r"(?:close|quit|exit|stop|end)\s+(.+)",
        ],
        Intent.CREATE_FILE: [
            r"create\s+(?:a\s+)?file\s+(?:in|at|on|to)\s+(.+?)\s+(?:called|named)\s+(.+)", # loc first
            r"create\s+(?:a\s+)?file\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|at|on|to)\s+(.+)", # name first
            r"make\s+(?:a\s+)?file\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|at|on|to)\s+(.+)",
            r"new\s+file\s+(.+?)\s+(?:in|at|on|to)\s+(.+)",
            r"create\s+(?:a\s+)?file\s+(?:called\s+|named\s+)?(.+)",
        ],
        Intent.CREATE_FOLDER: [
            r"create\s+(?:a\s+)?folder\s+(?:in|at|on|to)\s+(.+?)\s+(?:called|named)\s+(.+)", # loc first
            r"create\s+(?:a\s+)?folder\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|at|on|to)\s+(.+)", # name first
            r"make\s+(?:a\s+)?folder\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|at|on|to)\s+(.+)",
            r"new\s+folder\s+(.+?)\s+(?:in|at|on|to)\s+(.+)",
            r"create\s+(?:a\s+)?directory\s+(?:called\s+|named\s+)?(.+?)\s+(?:in|at|on|to)\s+(.+)",
            r"create\s+(?:a\s+)?folder\s+(?:called\s+|named\s+)?(.+)",
        ],
        Intent.DELETE_FILE: [
            r"delete\s+(?:the\s+)?file\s+(.+?)\s+from\s+(.+)",
            r"remove\s+(?:the\s+)?file\s+(.+?)\s+from\s+(.+)",
            r"delete\s+(.+\.(?:txt|pdf|doc|docx|jpg|png|mp3|mp4|zip))\s+from\s+(.+)",
        ],
        Intent.DELETE_FOLDER: [
            r"delete\s+(?:the\s+)?folder\s+(.+?)\s+from\s+(.+)",
            r"remove\s+(?:the\s+)?folder\s+(.+?)\s+from\s+(.+)",
            r"delete\s+(?:the\s+)?directory\s+(.+?)\s+from\s+(.+)",
        ],
        Intent.SYSTEM_COMMAND: [
            r"^(shutdown|restart|reboot|sleep|lock|hibernate)(?:\s+(?:the\s+)?(?:computer|pc|system))?$",
        ],
        Intent.KILL_PROCESS: [
            r"(?:kill|end|terminate)\s+(?:process\s+|task\s+)?(.+)",
        ],
        # OPEN_APP must come BEFORE WEB_SEARCH to avoid "launch chrome and search" matching search
        Intent.OPEN_APP: [
            # Stop at conjunctions (and, then, comma, semicolon)
            r"(?:open|launch|start|run)\s+([^,;]+?)(?:\s+(?:and|then)\s+|,|;|$)",
        ],
        Intent.WEB_SEARCH: [
            r"(?:search|google|bing)\s+(?:for\s+)?(.+)",
            r"look\s+up\s+(.+)",
            r"(?:tell|inform)\s+me\s+(?:about|on)\s+(.+)",
            r"what\s+is\s+(.+)",
            r"who\s+is\s+(.+)",
        ],
        Intent.CREATE_PROJECT: [
            r"create\s+(?:a\s+)?(?:new\s+)?(animated\s+)?(\w+)?\s*(?:website|project|app)\s+(?:for\s+)?(.+?)\s+(?:in|on|at)\s+(.+)",
            r"create\s+(?:a\s+)?(?:new\s+)?(animated\s+)?(\w+)?\s*(?:website|project|app)\s+(?:called|named)\s+(.+)",
            r"make\s+(?:a\s+)?(?:an\s+)?(animated\s+)?(\w+)?\s*(?:website|project|app)\s+(?:for\s+)?(.+)",
        ],
        Intent.RESEARCH: [
            r"research\s+(?:about\s+)?(.+?)\s+and\s+save(?:\s+(?:the\s+)?(?:data|results?))?",
            r"search\s+(?:for\s+)?(.+?)\s+and\s+(?:save|create)\s+(?:a\s+)?(?:summary|report)",
            r"look\s+up\s+(.+?)\s+and\s+save",
        ],
        Intent.HELP: [
            r"^(?:show\s+)?help$",
            r"^(?:what\s+can\s+you\s+do|capabilities|available\s+commands|list\s+commands)$",
            r"^(?:how\s+to\s+use|info|about)$",
            r"^(?:hi|hello|hey|namaste|greetings)$",
        ],
        Intent.CONFIRM: [
            r"^(?:yes|yep|yeah|sure|do\s+it|confirm|correct|ok|okay)$",
        ],
        Intent.CANCEL: [
            r"^(?:no|nope|nah|cancel|dont|don't|stop|abort)$",
        ],
    }
    
    # Common folder name mappings
    FOLDER_ALIASES = {
        "documents": "Documents",
        "desktop": "Desktop",
        "downloads": "Downloads",
        "pictures": "Pictures",
        "videos": "Videos",
        "music": "Music",
    }
    
    def __init__(self):
        self.home = Path.home()
        # Integration with ExtensionLoader
        try:
            from extension_loader import get_extension_loader
            self.extension_loader = get_extension_loader()
        except Exception as e:
            print(f"[CommandParser] Warning: Could not load ExtensionLoader: {e}")
            self.extension_loader = None
    
    def parse(self, text: str):
        """
        Parse natural language command into structured Command(s)
        Returns a list of Command objects for multi-step support
        
        Args:
            text: Natural language command
            
        Returns:
            List of Command objects
        """
        text = text.strip()
        
        # Check for multi-step command
        if self._is_multi_step(text):
            return self._parse_multi_step(text)
        
        # Single command
        cmd = self._parse_single(text)
        return [cmd]
    
    def _is_multi_step(self, text: str) -> bool:
        """Check if command contains multiple steps"""
        text_lower = text.lower()
        return " and " in text_lower or " then " in text_lower
    
    def _parse_multi_step(self, text: str):
        """Split and parse multi-step command"""
        # Split on "and" or "then"
        parts = re.split(r'\s+(?:and|then)\s+', text, flags=re.IGNORECASE)
        
        commands = []
        context = None
        
        for part in parts:
            cmd = self._parse_single(part.strip(), context)
            commands.append(cmd)
            
            # Set context for next command
            if cmd.intent == Intent.OPEN_APP:
                context = cmd
        
        return commands
    
    def _parse_single(self, text: str, context: Optional[Command] = None) -> Command:
        """
        Parse single command with optional context from previous command
        
        Args:
            text: Command text
            context: Previous command for context-aware parsing
            
        Returns:
            Command object
        """
        text_lower = text.lower()
        
        # Context-aware parsing: If previous command was OPEN_APP, check for text input
        if context and context.intent == Intent.OPEN_APP:
            # Check for typing keywords
            match = re.search(r'(?:write|type|enter|input|add)\s+(.+?)(?:\s+in\s+it)?$', text, re.IGNORECASE)
            if match:
                text_to_type = match.group(1).strip()
                
                # Generate joke if requested
                if "joke" in text_to_type.lower():
                    text_to_type = self._generate_joke()
                
                return Command(Intent.TYPE_TEXT, {
                    "text": text_to_type,
                    "target_app": context.parameters.get("app_name")
                }, text)
        
        # Standard pattern matching for core intents
        for intent, patterns in self.PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    parameters = self._extract_parameters(intent, match, text)
                    return Command(intent, parameters, text)
        
        # Check extensions if no core patterns matched
        if self.extension_loader:
            all_ext_patterns = self.extension_loader.get_all_patterns()
            for intent_str, patterns in all_ext_patterns.items():
                for pattern in patterns:
                    match = re.search(pattern, text, re.IGNORECASE)
                    if match:
                        # Extract parameters (generic extraction for extensions)
                        # Extensions usually have simpler parameters or handle extraction themselves
                        params = {}
                        if match.groups():
                            params = {"raw_parameters": match.groups()}
                            # Special case: if metadata has parameter names, we could map them here
                            # For now, extensions typically extract their own params or use LLM-parsed ones
                        
                        # Return Command with string intent (handled by extension_loader.execute)
                        # We need a hacky way to represent this as Intent if possible, or support string intents
                        # Since Intent is an Enum, we'll use a dynamic value check in the executor
                        return Command(intent_str, params, text)
        
        # No match found
        return Command(Intent.UNKNOWN, {}, text)
    
    def _generate_joke(self) -> str:
        """Generate a joke using LLM with fallback to hardcoded jokes"""
        try:
            # Try to use LLM
            import sys
            from pathlib import Path
            
            # Add ai module to path
            ai_path = Path(__file__).parent.parent / "ai" / "src"
            if str(ai_path) not in sys.path:
                sys.path.insert(0, str(ai_path))
            
            from llm_service import get_service
            
            llm = get_service()
            prompt = "Tell me a short, funny joke. Just the joke, no introduction or explanation."
            
            result = llm.process_message(prompt)
            
            if result["type"] == "llm" and result["stream"]:
                # Collect the streaming response
                joke = ""
                for chunk in result["stream"]:
                    joke += chunk
                
                joke = joke.strip()
                if joke:
                    print(f"[Parser] Generated joke via LLM: {joke[:50]}...")
                    return joke
        except Exception as e:
            print(f"[Parser] LLM joke generation failed: {e}, using fallback")
        
        # Fallback to hardcoded jokes
        import random
        jokes = [
            "Why did the chicken cross the road? To get to the other side!",
            "Why don't scientists trust atoms? Because they make up everything!",
            "What do you call a bear with no teeth? A gummy bear!",
            "Why did the scarecrow win an award? He was outstanding in his field!",
            "What do you call a fake noodle? An impasta!",
        ]
        return random.choice(jokes)

    
    def _extract_parameters(self, intent: Intent, match: re.Match, text: str) -> Dict[str, Any]:
        """Extract parameters based on intent type"""
        
        if intent == Intent.OPEN_APP:
            app_name = match.group(1).strip()
            
            # Clean up trailing conjunctions (safety net)
            app_name = re.sub(r"\s+(and|then|,|;).*$", "", app_name, flags=re.IGNORECASE)
            
            # Remove common filler words at the start (more aggressive)
            app_name = re.sub(r"^(?:the|a|an)\s+", "", app_name, flags=re.IGNORECASE).strip()
            
            # Remove trailing "it" or "that" (e.g., "open it")
            app_name = re.sub(r"\s+(?:it|that)$", "", app_name, flags=re.IGNORECASE)
            
            return {"app_name": app_name.strip()}
        
        elif intent == Intent.CLOSE_APP:
            app_name = match.group(1).strip()
            return {"app_name": app_name}
        
        elif intent in [Intent.CREATE_FILE, Intent.CREATE_FOLDER]:
            # Pattern index 0 has (locationFirst=1, name=2)
            # Others have (name=1, location=2) or just (name=1)
            
            # Check if this was a location-first pattern (matches index 0 in the list)
            patterns = self.PATTERNS[intent]
            pattern_index = -1
            for i, p in enumerate(patterns):
                if re.search(p, text, re.IGNORECASE):
                    pattern_index = i
                    break
            
            if pattern_index == 0:
                location = match.group(1).strip()
                filename = match.group(2).strip()
            elif match.lastindex >= 2:
                filename = match.group(1).strip()
                location = match.group(2).strip()
            else:
                filename = match.group(1).strip()
                location = "Documents" # Default
            
            full_path = self._resolve_path(location, filename)
            
            return {
                "name": filename,
                "location": location,
                "full_path": str(full_path),
            }
        
        elif intent in [Intent.DELETE_FILE, Intent.DELETE_FOLDER]:
            filename = match.group(1).strip()
            location = match.group(2).strip()
            full_path = self._resolve_path(location, filename)
            
            return {
                "name": filename,
                "location": location,
                "full_path": str(full_path),
            }
        
        elif intent == Intent.SYSTEM_COMMAND:
            command = match.group(1).strip().lower()
            return {"command": command}
        
        elif intent == Intent.KILL_PROCESS:
            process_name = match.group(1).strip()
            return {"process_name": process_name}
        
        elif intent == Intent.WEB_SEARCH:
            query = match.group(1).strip()
            return {"query": query}
        
        elif intent == Intent.CREATE_PROJECT:
            return self._extract_project_params(match, text)
        
        elif intent == Intent.RESEARCH:
            topic = match.group(1).strip()
            # Generate filename from topic
            safe_filename = re.sub(r'[^\w\s-]', '', topic).replace(' ', '_')
            filename = f"{safe_filename}_research.md"
            full_path = self.home / "Documents" / filename
            
            return {
                "topic": topic,
                "filename": filename,
                "full_path": str(full_path),
            }
        
        return {}
    
    def _resolve_path(self, location: str, filename: str) -> Path:
        """
        Resolve location string to full path
        
        Args:
            location: Location string (e.g., "Documents", "Desktop")
            filename: File or folder name
            
        Returns:
            Full Path object
        """
        location_lower = location.lower()
        
        # Strip common prepositions
        location_lower = re.sub(r"^(?:in|at|on|to|from|the)\s+", "", location_lower)
        
        # Check if it's a known folder alias
        if location_lower in self.FOLDER_ALIASES:
            folder_name = self.FOLDER_ALIASES[location_lower]
            return self.home / folder_name / filename
        
        # Check if it's an absolute path
        if os.path.isabs(location):
            return Path(location) / filename
        
        # Default to Documents if unknown
        return self.home / "Documents" / filename
    
    def _extract_project_params(self, match: re.Match, text: str) -> Dict[str, Any]:
        """Extract parameters for CREATE_PROJECT intent"""
        animated = "animated" in text.lower()
        groups = match.groups()
        
        # Try to extract from groups
        if len(groups) >= 4 and groups[3]:  # Has location
            project_type = groups[1].strip() if groups[1] else "website"
            description = groups[2].strip()
            location = groups[3].strip()
        elif len(groups) >= 3:
            project_type = groups[1].strip() if groups[1] else "website"
            description = groups[2].strip()
            location = "Desktop"
        else:
            project_type = "website"
            description = groups[0].strip() if groups else text
            location = "Desktop"
        
        return {
            "project_type": project_type,
            "description": description,
            "location": location,
            "animated": animated
        }


# Test function
def test_parser():
    """Test the command parser with example commands"""
    parser = CommandParser()
    
    test_commands = [
        "Open Chrome",
        "Close Notepad",
        "Create a file called lala.txt in desktop",
        "Create a folder named Projects in Desktop",
        "Delete the file temp.log from Downloads",
        "Research about Rust async programming and save the data",
        "Launch Visual Studio Code",
        "Shutdown the computer",
        "Kill process chrome",
        "Search for Python tutorials",
    ]
    
    print("=" * 60)
    print("COMMAND PARSER TEST")
    print("=" * 60)
    
    for cmd_text in test_commands:
        cmd = parser.parse(cmd_text)
        print(f"\\nInput: '{cmd_text}'")
        print(f"Intent: {cmd.intent.value}")
        print(f"Parameters: {cmd.parameters}")
    
    print("\\n" + "=" * 60)


if __name__ == "__main__":
    test_parser()
