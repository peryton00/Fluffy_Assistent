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
    TYPE_TEXT = "type_text"  # For keyboard automation
    CREATE_PROJECT = "create_project"  # For AI project generation
    BLUETOOTH_CONTROL = "bluetooth_control"  # For Bluetooth hardware control
    RESEARCH = "research"
    CHAT = "chat"  # For conversational queries and general knowledge
    HELP = "help"
    CONFIRM = "confirm"
    CANCEL = "cancel"
    UNKNOWN = "unknown"


class Command:
    """Parsed command with intent and parameters"""
    def __init__(self, intent: Intent, parameters: Dict[str, Any], raw_text: str = ""):
        self.intent = intent
        self.parameters = parameters
        self.raw_text = raw_text
    
    def __repr__(self):
        intent_str = self.intent.value if hasattr(self.intent, 'value') else str(self.intent)
        return f"Command(intent={intent_str}, params={self.parameters})"


class CommandParser:
    """
    Natural language command parser using regex patterns
    """
    
    # Folder aliases for path resolution
    FOLDER_ALIASES = {
        "documents": "Documents",
        "desktop": "Desktop",
        "downloads": "Downloads",
        "music": "Music",
        "pictures": "Pictures",
        "videos": "Videos",
    }
    
    def __init__(self):
        self.home = Path.home()
        # Integration with ExtensionLoader
        try:
            from brain.extensions.extension_loader import get_extension_loader
            self.extension_loader = get_extension_loader()
        except Exception:
            self.extension_loader = None
    
    def parse(self, text: str):
        """
        Skeleton parse method for backward compatibility.
        In the new unified flow, parsing is handled by LLMCommandParser.
        """
        text = text.strip()
        return [Command(Intent.UNKNOWN, {}, text)]

    def _resolve_path(self, location: str, filename: str) -> Path:
        """Resolve location string to full path (still useful for file operations)"""
        location_lower = location.lower()
        location_lower = re.sub(r"^(?:in|at|on|to|from|the)\s+", "", location_lower)
        
        if location_lower in self.FOLDER_ALIASES:
            folder_name = self.FOLDER_ALIASES[location_lower]
            return self.home / folder_name / filename
        
        if os.path.isabs(location):
            return Path(location) / filename
        
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
