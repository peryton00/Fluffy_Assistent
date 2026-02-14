"""
Action Validator - Safety checks and confirmation system for voice commands
"""

from typing import Dict, Any, Tuple
from pathlib import Path
from brain.command_parser import Command, Intent
import os


class SafetyLevel:
    """Safety levels for actions"""
    SAFE = "safe"
    NEEDS_CONFIRMATION = "needs_confirmation"
    BLOCKED = "blocked"


class ValidationResult:
    """Result of action validation"""
    def __init__(self, is_valid: bool, safety_level: str, message: str = ""):
        self.is_valid = is_valid
        self.safety_level = safety_level
        self.message = message
    
    def __repr__(self):
        return f"ValidationResult(valid={self.is_valid}, safety={self.safety_level}, msg='{self.message}')"


class ActionValidator:
    """
    Validates commands against safety rules
    """
    
    # Protected paths (never allow)
    PROTECTED_PATHS_WINDOWS = [
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
        "C:\\ProgramData",
    ]
    
    PROTECTED_PATHS_LINUX = [
        "/bin", "/sbin", "/usr/bin", "/usr/sbin",
        "/etc", "/boot", "/sys", "/proc",
        "/lib", "/lib64",
    ]
    
    # System file extensions (require confirmation)
    SYSTEM_EXTENSIONS = [".exe", ".dll", ".sys", ".bat", ".cmd", ".ps1"]
    
    def __init__(self):
        self.home = Path.home()
        
        # Determine OS and set protected paths
        if os.name == 'nt':  # Windows
            self.protected_paths = [Path(p) for p in self.PROTECTED_PATHS_WINDOWS]
        else:  # Linux/Mac
            self.protected_paths = [Path(p) for p in self.PROTECTED_PATHS_LINUX]
        
        # Allowed paths (safe)
        self.allowed_paths = [
            self.home / "Documents",
            self.home / "Desktop",
            self.home / "Downloads",
            self.home / "Pictures",
            self.home / "Videos",
            self.home / "Music",
        ]
        
        # Integration with ExtensionLoader
        try:
            from extension_loader import get_extension_loader
            self.extension_loader = get_extension_loader()
        except Exception as e:
            print(f"[ActionValidator] Warning: Could not load ExtensionLoader: {e}")
            self.extension_loader = None
    
    def validate(self, command: Command) -> ValidationResult:
        """
        Validate a command against safety rules
        
        Args:
            command: Parsed command object
            
        Returns:
            ValidationResult with safety level and message
        """
        if command.intent == Intent.UNKNOWN:
            return ValidationResult(
                is_valid=False,
                safety_level=SafetyLevel.BLOCKED,
                message="Command not recognized"
            )
        
        if command.intent == Intent.OPEN_APP:
            # App launching is generally safe
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Application launch is safe"
            )
        
        if command.intent in [Intent.CREATE_FILE, Intent.CREATE_FOLDER]:
            return self._validate_create(command)
        
        if command.intent in [Intent.DELETE_FILE, Intent.DELETE_FOLDER]:
            return self._validate_delete(command)
        
        if command.intent == Intent.RESEARCH:
            # Research is safe (just creates a file in Documents)
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Research operation is safe"
            )
        
        if command.intent == Intent.HELP:
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Help command is safe"
            )
        
        if command.intent == Intent.WEB_SEARCH:
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Web search is safe"
            )
        
        if command.intent in [Intent.KILL_PROCESS, Intent.CLOSE_APP]:
            # These are mostly safe but good to flag if we want confirm later
            # For now, let's keep them safe but informative
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Process management is safe"
            )
        
        if command.intent == Intent.TYPE_TEXT:
            # Typing text is safe - it's just keyboard input
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Text typing is safe"
            )
        
        if command.intent == Intent.CREATE_PROJECT:
            # Project creation is safe in user directories
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Project creation is safe"
            )
        
        if command.intent == Intent.SYSTEM_COMMAND:
            # System commands (shutdown etc) MUST always require confirmation
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.NEEDS_CONFIRMATION,
                message=f"Are you sure you want to {command.parameters.get('command')} the system?"
            )
        
        # Check if it's an extension
        if self.extension_loader:
            intent_str = command.intent.value if hasattr(command.intent, 'value') else str(command.intent)
            if self.extension_loader.has_extension(intent_str):
                validation = self.extension_loader.validate(command)
                if validation:
                    return validation
                
                # Fallback for extensions without explicit validation logic (unsafe default)
                return ValidationResult(
                    is_valid=True,
                    safety_level=SafetyLevel.NEEDS_CONFIRMATION,
                    message=f"Validate extension action: {intent_str}?"
                )
        
        return ValidationResult(
            is_valid=False,
            safety_level=SafetyLevel.BLOCKED,
            message="Unknown command type"
        )
    
    def _validate_create(self, command: Command) -> ValidationResult:
        """Validate file/folder creation"""
        parameters = command.parameters
        full_path_str = parameters.get("full_path")
        
        # Robust resolution if full_path is missing
        if not full_path_str:
            name = parameters.get("name")
            location = parameters.get("location", "Documents")
            
            if name:
                # Use standard resolution logic
                from brain.command_parser import CommandParser
                parser = CommandParser()
                full_path = parser._resolve_path(location, name)
                # Inject it back into parameters for the executor
                parameters["full_path"] = str(full_path)
            else:
                full_path = Path("") # Will be caught by _is_protected or final fallback
        else:
            full_path = Path(full_path_str)
        
        # Check if in protected paths
        if self._is_protected(full_path):
            return ValidationResult(
                is_valid=False,
                safety_level=SafetyLevel.BLOCKED,
                message=f"Cannot create in protected system directory: {full_path.parent}"
            )
        
        # Check if in allowed paths (safe)
        if self._is_allowed(full_path):
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="Creation in safe user directory"
            )
        
        # Not in allowed or protected - needs confirmation
        return ValidationResult(
            is_valid=True,
            safety_level=SafetyLevel.NEEDS_CONFIRMATION,
            message=f"Create {command.parameters.get('name')} in {full_path.parent}?"
        )
    
    def _validate_delete(self, command: Command) -> ValidationResult:
        """Validate file/folder deletion"""
        full_path = Path(command.parameters.get("full_path", ""))
        
        # Check if in protected paths
        if self._is_protected(full_path):
            return ValidationResult(
                is_valid=False,
                safety_level=SafetyLevel.BLOCKED,
                message=f"Cannot delete from protected system directory: {full_path.parent}"
            )
        
        # Check if system file
        if self._is_system_file(full_path):
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.NEEDS_CONFIRMATION,
                message=f"Delete system file {full_path.name}? This may affect installed applications."
            )
        
        # All deletions need confirmation (safety first)
        return ValidationResult(
            is_valid=True,
            safety_level=SafetyLevel.NEEDS_CONFIRMATION,
            message=f"Delete {full_path.name} from {full_path.parent}?"
        )
    
    def _is_protected(self, path: Path) -> bool:
        """Check if path is in protected directories"""
        try:
            # Try to resolve parent if path doesn't exist
            check_path = path if path.exists() else path.parent
            
            for protected in self.protected_paths:
                try:
                    if check_path.resolve().is_relative_to(protected):
                        return True
                except (ValueError, OSError):
                    # is_relative_to can raise ValueError
                    # Check with string comparison as fallback
                    if str(check_path).startswith(str(protected)):
                        return True
        except Exception:
            # If we can't determine, be safe and block
            return True
        
        return False
    
    def _is_allowed(self, path: Path) -> bool:
        """Check if path is in allowed directories"""
        try:
            check_path = path if path.exists() else path.parent
            
            for allowed in self.allowed_paths:
                try:
                    if check_path.resolve().is_relative_to(allowed):
                        return True
                except (ValueError, OSError):
                    if str(check_path).startswith(str(allowed)):
                        return True
        except Exception:
            return False
        
        return False
    
    def _is_system_file(self, path: Path) -> bool:
        """Check if file is a system file"""
        return path.suffix.lower() in self.SYSTEM_EXTENSIONS
    
    def requires_confirmation(self, command: Command) -> bool:
        """Check if command requires user confirmation"""
        result = self.validate(command)
        return result.safety_level == SafetyLevel.NEEDS_CONFIRMATION
    
    def get_confirmation_message(self, command: Command) -> str:
        """Get confirmation message for command"""
        result = self.validate(command)
        return result.message


# Test function
def test_validator():
    """Test the action validator"""
    from command_parser import CommandParser
    
    parser = CommandParser()
    validator = ActionValidator()
    
    test_commands = [
        "Create a file called test.txt in Documents",
        "Delete the file important.exe from Downloads",
        "Create a folder named test in Windows",  # Should be blocked
        "Open Chrome",
        "Research about Python and save",
    ]
    
    print("=" * 60)
    print("ACTION VALIDATOR TEST")
    print("=" * 60)
    
    for cmd_text in test_commands:
        cmd = parser.parse(cmd_text)
        result = validator.validate(cmd)
        
        print(f"\nCommand: '{cmd_text}'")
        print(f"Intent: {cmd.intent.value}")
        print(f"Validation: {result}")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    test_validator()
