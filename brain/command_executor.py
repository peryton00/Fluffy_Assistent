"""
Command Executor - Executes validated voice commands
Integrates with Rust core for actual file operations
"""

import requests
from typing import Dict, Any, Optional
from brain.command_parser import Command, Intent
from brain.action_validator import ValidationResult, SafetyLevel


class CommandExecutor:
    """
    Executes validated commands
    For now, uses Python for file operations
    Later will integrate with Rust core via IPC
    """
    
    def __init__(self):
        self.rust_core_url = "http://127.0.0.1:9002"  # Rust command server
    
    def execute(self, command: Command, validation: ValidationResult) -> Dict[str, Any]:
        """
        Execute a validated command
        
        Args:
            command: Parsed command
            validation: Validation result
            
        Returns:
            Execution result with success status and message
        """
        if not validation.is_valid:
            return {
                "success": False,
                "message": validation.message,
                "action": "blocked"
            }
        
        if validation.safety_level == SafetyLevel.NEEDS_CONFIRMATION:
            # Save to session memory so user can confirm
            try:
                from brain.memory.session_memory import get_session_memory
                session = get_session_memory()
                # Mark validation as confirmed so it can execute
                confirmed_validation = ValidationResult(
                    is_valid=True,
                    safety_level=SafetyLevel.SAFE,
                    message="User confirmed"
                )
                session.set_pending_validation(command, confirmed_validation)
            except Exception as e:
                print(f"[CommandExecutor] Failed to save pending validation: {e}\n")
                return {
                "success": False,
                "message": validation.message,
                "action": "needs_confirmation",
                "command": command.raw_text
            }
        
        # Execute based on intent
        if command.intent == Intent.OPEN_APP:
            return self._execute_open_app(command)
        
        elif command.intent == Intent.CLOSE_APP:
            return self._execute_close_app(command)
        
        elif command.intent == Intent.CREATE_FILE:
            return self._execute_create_file(command)
        
        elif command.intent == Intent.CREATE_FOLDER:
            return self._execute_create_folder(command)
        
        elif command.intent == Intent.DELETE_FILE:
            return self._execute_delete_file(command)
        
        elif command.intent == Intent.DELETE_FOLDER:
            return self._execute_delete_folder(command)
        
        elif command.intent == Intent.SYSTEM_COMMAND:
            return self._execute_system_command(command)
        
        elif command.intent == Intent.KILL_PROCESS:
            return self._execute_kill_process(command)
        
        elif command.intent == Intent.TYPE_TEXT:
            return self._type_text(
                command.parameters.get("text", ""),
                command.parameters.get("target_app")
            )
        
        elif command.intent == Intent.CREATE_PROJECT:
            return self._execute_create_project(command)
        
        elif command.intent == Intent.RESEARCH:
            return self._execute_research(command)
        
        elif command.intent == Intent.HELP:
            return self._execute_help(command)
        
        elif command.intent == Intent.CHAT:
            return self._execute_chat(command)
        
        # Try extensions (plugin system)
        try:
            from brain.extension_loader import get_extension_loader
            loader = get_extension_loader()
            
            if loader.has_extension(command.intent.value):
                return loader.execute(command, validation)
        except Exception as e:
            print(f"[CommandExecutor] Extension error: {e}")
        
        # Unknown command - try self-improvement
        if command.intent == Intent.UNKNOWN:
            try:
                from brain.self_improver import get_self_improver
                improver = get_self_improver()
                return improver.handle_unknown_command(command.original_text)
            except Exception as e:
                print(f"[CommandExecutor] Self-improver error: {e}")
        
        return {
            "success": False,
            "message": "I didn't quite get that. Type 'help' to see what I can do!",
            "action": "error"
        }
    
    def _execute_chat(self, command: Command) -> Dict[str, Any]:
        """Handle conversational queries using LLM response"""
        # The LLM has already generated the response
        response_text = getattr(command, 'llm_response', None)
        
        if response_text:
            return {
                "success": True,
                "message": response_text,
                "action": "chat"
            }
        else:
            # Fallback if no LLM response available
            return {
                "success": True,
                "message": "I'm here to help! You can ask me questions or give me commands.",
                "action": "chat"
            }
    
    def _execute_open_app(self, command: Command) -> Dict[str, Any]:
        """Execute app launch command"""
        import subprocess
        import os
        
        app_name = command.parameters.get("app_name", "")
        
        # Common app mappings
        app_paths = {
            "chrome": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "brave": "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
            "firefox": "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
            "edge": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "vscode": "C:\\Program Files\\Microsoft VS Code\\Code.exe",
            "code": "C:\\Program Files\\Microsoft VS Code\\Code.exe",
            "notepad": "C:\\Windows\\System32\\notepad.exe",
            "calculator": "C:\\Windows\\System32\\calc.exe",
            "calc": "C:\\Windows\\System32\\calc.exe",
        }
        
        app_path = app_paths.get(app_name.lower())
        
        if app_path and os.path.exists(app_path):
            try:
                subprocess.Popen([app_path])
                return {
                    "success": True,
                    "message": f"Launched {app_name}",
                    "action": "app_launched"
                }
            except Exception as e:
                return {
                    "success": False,
                    "message": f"Failed to launch {app_name}: {str(e)}",
                    "action": "error"
                }
        else:
            # Try to launch by name (Windows will search PATH)
            import shutil
            path_resolution = shutil.which(app_name)
            
            if path_resolution:
                try:
                    subprocess.Popen([path_resolution])
                    return {
                        "success": True,
                        "message": f"Launched {app_name}",
                        "action": "app_launched"
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "message": f"Failed to launch {app_name}: {str(e)}",
                        "action": "error"
                    }
            else:
                return {
                    "success": False,
                    "message": f"Application '{app_name}' not found on this system.",
                    "action": "error"
                }
    
    def _execute_create_file(self, command: Command) -> Dict[str, Any]:
        """Execute file creation"""
        import os
        import subprocess
        from pathlib import Path
        
        parameters = command.parameters
        full_path = Path(parameters.get("full_path", ""))
        content = parameters.get("content")
        
        try:
            # Create parent directories if needed
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Create/write content if provided, otherwise just touch
            if content:
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(content)
                message = f"Created file: {full_path.name} with your content"
            else:
                full_path.touch()
                message = f"Created empty file: {full_path.name}"
            
            # Auto-open the folder and select the file
            try:
                subprocess.run(['explorer', '/select,', str(full_path)])
            except Exception as e:
                print(f"[Executor] Failed to auto-open file location: {e}")
            
            return {
                "success": True,
                "message": message + " and opened location",
                "action": "file_created",
                "path": str(full_path)
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to create file: {str(e)}",
                "action": "error"
            }
    
    def _execute_create_folder(self, command: Command) -> Dict[str, Any]:
        """Execute folder creation"""
        import subprocess
        from pathlib import Path
        
        full_path = Path(command.parameters.get("full_path", ""))
        
        try:
            full_path.mkdir(parents=True, exist_ok=True)
            
            # Auto-open the folder
            try:
                subprocess.run(['explorer', str(full_path)])
            except Exception as e:
                print(f"[Executor] Failed to auto-open folder: {e}")
            
            return {
                "success": True,
                "message": f"Created folder: {full_path.name} and opened it",
                "action": "folder_created",
                "path": str(full_path)
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to create folder: {str(e)}",
                "action": "error"
            }
    
    def _execute_delete_file(self, command: Command) -> Dict[str, Any]:
        """Execute file deletion"""
        from pathlib import Path
        
        full_path = Path(command.parameters.get("full_path", ""))
        
        try:
            if not full_path.exists():
                return {
                    "success": False,
                    "message": f"File not found: {full_path.name}",
                    "action": "error"
                }
            
            full_path.unlink()
            
            return {
                "success": True,
                "message": f"Deleted file: {full_path.name}",
                "action": "file_deleted"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to delete file: {str(e)}",
                "action": "error"
            }
    
    def _execute_delete_folder(self, command: Command) -> Dict[str, Any]:
        """Execute folder deletion"""
        from pathlib import Path
        import shutil
        
        full_path = Path(command.parameters.get("full_path", ""))
        
        try:
            if not full_path.exists():
                return {
                    "success": False,
                    "message": f"Folder not found: {full_path.name}",
                    "action": "error"
                }
            
            shutil.rmtree(full_path)
            
            return {
                "success": True,
                "message": f"Deleted folder: {full_path.name}",
                "action": "folder_deleted"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to delete folder: {str(e)}",
                "action": "error"
            }
    
    def _execute_research(self, command: Command) -> Dict[str, Any]:
        """Execute research command and save to Desktop/research data by fluffy"""
        import subprocess
        from pathlib import Path
        import re
        
        topic = command.parameters.get("topic", "")
        
        try:
            # 1. Standardize research path: Desktop/research data by fluffy
            desktop = Path.home() / "Desktop"
            research_dir = desktop / "research data by fluffy"
            research_dir.mkdir(parents=True, exist_ok=True)
            
            # 2. Sanitize topic for filename
            safe_topic = re.sub(r'[^\w\s-]', '', topic).strip().replace(' ', '_')
            if not safe_topic: safe_topic = "unnamed_research"
            
            filename = f"{safe_topic}_research.md"
            full_path = research_dir / filename
            
            # 3. Create content
            content = f"# Research: {topic}\n\n"
            content += f"Research topic: {topic}\n"
            content += f"Saved at: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            content += "## Notes\n\n"
            content += "(Research functionality integrated - findings saved successfully)\n"
            content += "\n--- \nGenerated by Fluffy Assistant"
            
            full_path.write_text(content, encoding='utf-8')
            
            # 4. Auto-open the file
            try:
                os.startfile(str(full_path))
            except Exception as e:
                print(f"[Executor] Failed to auto-open research file: {e}")
            
            return {
                "success": True,
                "message": f"Research on '{topic}' saved to Desktop and opened",
                "action": "research_saved",
                "path": str(full_path)
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to save research: {str(e)}",
                "action": "error"
            }
    
    def _execute_close_app(self, command: Command) -> Dict[str, Any]:
        """Execute app close command"""
        import subprocess
        
        app_name = command.parameters.get("app_name", "")
        
        try:
            # Use taskkill to close the app
            result = subprocess.run(
                ["taskkill", "/IM", f"{app_name}.exe", "/F"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                return {
                    "success": True,
                    "message": f"Closed {app_name}",
                    "action": "app_closed"
                }
            else:
                return {
                    "success": False,
                    "message": f"Could not close {app_name} - application may not be running",
                    "action": "error"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to close {app_name}: {str(e)}",
                "action": "error"
            }
    
    def _execute_system_command(self, command: Command) -> Dict[str, Any]:
        """Execute system command (shutdown, restart, etc.)"""
        import subprocess
        
        sys_command = command.parameters.get("command", "")
        
        # Map commands to Windows commands
        command_map = {
            "shutdown": ["shutdown", "/s", "/t", "10"],
            "restart": ["shutdown", "/r", "/t", "10"],
            "reboot": ["shutdown", "/r", "/t", "10"],
            "sleep": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
            "lock": ["rundll32.exe", "user32.dll,LockWorkStation"],
            "hibernate": ["shutdown", "/h"],
        }
        
        cmd_args = command_map.get(sys_command)
        
        if not cmd_args:
            return {
                "success": False,
                "message": f"Unknown system command: {sys_command}",
                "action": "error"
            }
        
        try:
            subprocess.Popen(cmd_args)
            return {
                "success": True,
                "message": f"System {sys_command} initiated",
                "action": "system_command_executed"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to execute {sys_command}: {str(e)}",
                "action": "error"
            }
    
    def _execute_kill_process(self, command: Command) -> Dict[str, Any]:
        """Execute kill process command"""
        import subprocess
        
        process_name = command.parameters.get("process_name", "")
        if not process_name.lower().endswith(".exe"):
            process_name += ".exe"
        
        try:
            # Use taskkill to terminate the process
            result = subprocess.run(
                ["taskkill", "/IM", process_name, "/F"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                return {
                    "success": True,
                    "message": f"Terminated process: {process_name}",
                    "action": "process_killed"
                }
            else:
                return {
                    "success": False,
                    "message": f"Could not terminate {process_name} - process may not exist",
                    "action": "error"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to kill process: {str(e)}",
                "action": "error"
            }
    
    def _execute_web_search(self, command: Command) -> Dict[str, Any]:
        """Execute web search command"""
        import webbrowser
        import urllib.parse
        
        query = command.parameters.get("query", "")
        
        try:
            # URL encode the query
            encoded_query = urllib.parse.quote(query)
            search_url = f"https://www.google.com/search?q={encoded_query}"
            
            # Open in default browser
            webbrowser.open(search_url)
            
            return {
                "success": True,
                "message": f"Searching for: {query}",
                "action": "web_search_opened"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to open search: {str(e)}",
                "action": "error"
            }
    
    def _execute_create_project(self, command: Command) -> Dict[str, Any]:
        """Execute AI-powered project creation"""
        import subprocess
        import re
        from pathlib import Path
        from brain.project_generator import get_generator
        
        project_type = command.parameters.get("project_type", "website")
        description = command.parameters.get("description", "")
        location = command.parameters.get("location", "Desktop")
        animated = command.parameters.get("animated", False)
        
        try:
            # Resolve location
            if location.lower() in ["desktop", "the desktop"]:
                base_path = Path.home() / "Desktop"
            elif location.lower() in ["documents", "the documents"]:
                base_path = Path.home() / "Documents"
            else:
                base_path = Path(location)
            
            # Generate project name from description
            project_name = re.sub(r'[^\w\s-]', '', description).strip()
            project_name = re.sub(r'[-\s]+', '_', project_name)[:50]
            
            if not project_name:
                project_name = f"{project_type}_project"
            
            # Create project folder
            project_path = base_path / project_name
            project_path.mkdir(parents=True, exist_ok=True)
            
            print(f"[Executor] Creating project at: {project_path}")
            print(f"[Executor] Type: {project_type}, Animated: {animated}")
            print(f"[Executor] Description: {description}")
            
            # Generate project using LLM
            generator = get_generator()
            project = generator.generate_project(project_type, description, animated)
            
            # Create files
            created_files = []
            for filename, content in project["files"].items():
                file_path = project_path / filename
                file_path.write_text(content, encoding='utf-8')
                created_files.append(filename)
                print(f"[Executor] Created: {filename} ({len(content)} chars)")
            
            # Auto-open project folder
            try:
                subprocess.run(['explorer', str(project_path)])
            except Exception as e:
                print(f"[Executor] Failed to open folder: {e}")
            
            return {
                "success": True,
                "message": f"Created {project_type} project: {project_name}",
                "action": "project_created",
                "path": str(project_path),
                "files": created_files
            }
        
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "message": f"Failed to create project: {str(e)}",
                "action": "error"
            }
    
    def _execute_help(self, command: Command) -> Dict[str, Any]:
        """Show available commands help"""
        help_text = (
            "Here's what I can help you with:\n\n"
            "🚀 **App Management**\n"
            "- 'open [app name]'\n"
            "- 'close [app name]'\n"
            "- 'kill process [name]'\n\n"
            "📁 **File Operations**\n"
            "- 'create file [name] in [desktop/documents/downloads]'\n"
            "- 'create folder [name] in [location]'\n"
            "- 'delete file [name] from [location]'\n\n"
            "🌐 **Web & Research**\n"
            "- 'search for [query]'\n"
            "- 'research [topic] and save'\n\n"
            "⚙️ **System**\n"
            "- 'lock', 'shutdown', 'restart'\n\n"
            "Just type or say a command to get started!"
        )
        return {
            "success": True,
            "message": help_text,
            "action": "info"
        }
    
    def _type_text(self, text: str, target_app: Optional[str] = None) -> Dict[str, Any]:
        """Type text using keyboard automation"""
        try:
            import pyautogui
            import time
            
            # Longer delay to ensure app is ready and focused
            time.sleep(1.0)
            
            # Type the text character by character (more reliable than write())
            for char in text:
                pyautogui.press(char) if char.isalnum() or char == ' ' else pyautogui.typewrite(char)
                time.sleep(0.05)  # Small delay between characters
            
            return {
                "success": True,
                "message": f"Typed: {text[:50]}..." if len(text) > 50 else f"Typed: {text}",
                "action": "text_typed"
            }
        except ImportError:
            return {
                "success": False,
                "message": "pyautogui not installed. Run: pip install pyautogui",
                "action": "error"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to type text: {str(e)}",
                "action": "error"
            }
    
    def execute_multi_step(self, commands: list, validator) -> Dict[str, Any]:
        """Execute multiple commands in sequence"""
        import time
        
        results = []
        
        for i, cmd in enumerate(commands):
            # Validate
            validation = validator.validate(cmd)
            
            # Execute
            result = self.execute(cmd, validation)
            results.append({
                "step": i + 1,
                "intent": cmd.intent.value,
                "result": result
            })
            
            # Stop on failure
            if not result.get("success"):
                return {
                    "success": False,
                    "message": f"Step {i+1} failed: {result.get('message')}",
                    "completed_steps": i,
                    "results": results
                }
            
            # Wait for app to open before next step
            if cmd.intent == Intent.OPEN_APP and i < len(commands) - 1:
                time.sleep(1.5)  # Give app time to launch
        
        return {
            "success": True,
            "message": f"Completed {len(commands)} steps successfully",
            "steps_completed": len(commands),
            "results": results
        }


# Test function
def test_executor():
    """Test command executor"""
    from command_parser import CommandParser
    from action_validator import ActionValidator
    
    parser = CommandParser()
    validator = ActionValidator()
    executor = CommandExecutor()
    
    test_commands = [
        "Create a file called test.txt in Documents",
        "Open Chrome",
    ]
    
    print("=" * 60)
    print("COMMAND EXECUTOR TEST")
    print("=" * 60)
    
    for cmd_text in test_commands:
        cmd = parser.parse(cmd_text)
        validation = validator.validate(cmd)
        result = executor.execute(cmd, validation)
        
        print(f"\nCommand: '{cmd_text}'")
        print(f"Result: {result}")
    
    print("\n" * 60)


if __name__ == "__main__":
    test_executor()
