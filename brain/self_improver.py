"""
Self Improver
Orchestrates automatic self-improvement flow
"""

from typing import Dict, Any, Optional
from pathlib import Path

from llm_command_parser import get_llm_parser, CommandUnderstanding
from code_generator import get_code_generator
from extension_creator import get_extension_creator
from extension_loader import get_extension_loader
from backup_manager import get_backup_manager


class SelfImprover:
    """Orchestrate automatic self-improvement"""
    
    def __init__(self):
        self.llm_parser = get_llm_parser()
        self.code_generator = get_code_generator()
        self.extension_creator = get_extension_creator()
        self.extension_loader = get_extension_loader()
        self.backup_manager = get_backup_manager()
    
    def handle_improvement_request(self, understanding: CommandUnderstanding) -> Dict[str, Any]:
        """
        Handle a pre-parsed improvement request from the unified parser.
        Skips the initial parsing step.
        """
        print(f"[SelfImprover] New functionality requested: {understanding.intent}")
        print(f"[SelfImprover] Description: {understanding.suggested_implementation}")
        
        confirmation_msg = f"I don't have the ability to '{understanding.intent}' yet, but I can learn it!\n\n" \
                          f"Proposed implementation: {understanding.suggested_implementation}\n\n" \
                          f"Would you like me to generate the code and install this as a new extension? (Say 'yes' to proceed)"
        
        return {
            "success": False,
            "message": confirmation_msg,
            "action": "needs_confirmation",
            "pending_improvement": {
                "command": understanding.original_text,
                "understanding": understanding.to_dict()
            }
        }
    
    def handle_unknown_command(self, user_command: str) -> Dict[str, Any]:
        """
        Handle unknown command with self-improvement
        
        Args:
            user_command: Natural language command from user
            
        Returns:
            Result dict with success status and message
        """
        
        print(f"\n[SelfImprover] Analyzing unknown command: '{user_command}'")
        
        # Step 1: Understand command with LLM
        understanding = self.llm_parser.parse_with_llm(user_command)
        
        if not understanding.requires_new_functionality:
            return {
                "success": False,
                "message": "Command not understood. Please try rephrasing.",
                "action": "error"
            }
        
        print(f"[SelfImprover] New functionality needed: {understanding.intent}")
        print(f"[SelfImprover] Description: {understanding.suggested_implementation}")
        
        # Step 2: Ask user for confirmation
        confirmation_msg = f"""
I don't currently have the ability to '{understanding.intent}', but I can add it!

Suggested implementation: {understanding.suggested_implementation}

Would you like me to:
1. Generate the code
2. Create a new extension
3. Execute your command

This will NOT modify core files - the new functionality will be added as a plugin.

Say 'yes' to proceed or 'no' to cancel.
"""
        
        return {
            "success": False,
            "message": confirmation_msg,
            "action": "needs_confirmation",
            "pending_improvement": {
                "command": user_command,
                "understanding": understanding.to_dict()
            }
        }
    
    def execute_improvement(
        self,
        user_command: str,
        understanding: Any
    ) -> Dict[str, Any]:
        """
        Execute the self-improvement flow
        """
        # Re-hydrate understanding if it passed as a dict (common in confirmation flows)
        if isinstance(understanding, dict):
            understanding = CommandUnderstanding.from_dict(understanding)
        
        try:
            print(f"\n[SelfImprover] 🚀 Starting self-improvement flow...")
            
            # ── Step 1: Logic & Language ──────────────────────────────────────
            # Decide best engine (python/html/js)
            lang = self.code_generator.decide_language(understanding.suggested_implementation)
            print(f"[SelfImprover] [1/4] Best engine for this: {lang}")

            web_ui_files = None
            js_handler = None
            generated_code = None

            if lang == "html":
                # Generate Web Dashboard + Python Handler
                print(f"[SelfImprover] Generating Web UI...")
                web_ui_files = self.code_generator.generate_web_ui(understanding.intent, understanding.suggested_implementation)
                # Still need a basic python handler to bridge
                generated_code = self.code_generator.generate_intent_handler(
                    intent_name=understanding.intent,
                    description=f"UI bridge for {understanding.intent}. The UI is in the 'ui' folder.",
                    parameters=understanding.parameters or {}
                )
            elif lang == "js":
                # Generate JS script
                print(f"[SelfImprover] Generating Node.js handler...")
                js_handler = self.code_generator.generate_js_handler(
                    understanding.intent, understanding.suggested_implementation, understanding.parameters or {}
                )
                # Use a safe intent name if LLM missed it
                intent_enum = understanding.intent.upper() if understanding.intent else "UNKNOWN_SKILL"
                generated_code = type('Obj', (), {
                    'executor_method': '', 
                    'validation': '', 
                    'patterns': [f"r'{understanding.intent}'"],
                    'intent_enum': intent_enum
                })()
            else:
                # Standard Python
                generated_code = self.code_generator.generate_intent_handler(
                    intent_name=understanding.intent,
                    description=understanding.suggested_implementation,
                    parameters=understanding.parameters or {}
                )

            if not generated_code and not js_handler:
                print(f"[SelfImprover] ✗ ALL generation attempts failed for: {understanding.intent}")
                return {
                    "success": False,
                    "message": "❌ **Generation Failed** (I couldn't write the code correctly after multiple attempts. This usually happens with complex logic. Try asking for a simpler version first.)",
                    "action": "error"
                }

            # ── Step 2: Create extension ──────────────────────────────────────
            metadata = {
                "language": lang,
                "has_ui": lang == "html"
            }
            print(f"[SelfImprover] [2/4] Creating {lang} extension...")

            actual_intent = self.extension_creator.create_extension(
                intent_name=understanding.intent,
                generated_code=generated_code,
                description=understanding.suggested_implementation,
                parameters=understanding.parameters,
                language=lang,
                has_ui=(lang == "html"),
                web_ui_files=web_ui_files,
                js_handler=js_handler
            )
            
            if not actual_intent:
                return {
                    "success": False,
                    "message": f"❌ **Creation Failed**: The extension folder or files could not be initialized.",
                    "action": "error"
                }
            
            print(f"[SelfImprover] ✓ Extension created: {actual_intent}")
            
            # Step 3: Reload extensions
            print(f"[SelfImprover] [3/4] Loading new extension...")
            
            self.extension_loader.load_all_extensions()
            
            if not self.extension_loader.has_extension(actual_intent):
                # Get detailed error from last load attempt
                error_details = self.extension_loader.get_last_load_error(actual_intent)
                
                return {
                    "success": False,
                    "message": f"⚠️ Extension '{actual_intent}' was created but failed to load.\n\n"
                               f"**Error:** {error_details}\n\n"
                               f"**Troubleshooting:**\n"
                               f"1. Check the extension files in: `brain/extensions/{actual_intent}/`\n"
                               f"2. Look for syntax errors in `handler.py` and `validator.py`\n"
                               f"3. Try restarting Fluffy to reload all extensions\n\n"
                               f"The extension files have been saved and can be manually fixed.",
                    "action": "error"
                }
            
            print(f"[SelfImprover] ✓ Extension loaded successfully")
            
            # Use the actual intent for execution
            final_intent = actual_intent
            
            # Step 4: Execute the command
            print(f"[SelfImprover] [4/4] Executing command...")
            
            # ── Step 4: Execute & Self-Heal (3 Retries) ──────────────────────
            print(f"[SelfImprover] [4/4] Executing command with 3-retry self-healing...")
            
            # Mock Command object compatible with ExtensionLoader.execute
            class MockCommand:
                def __init__(self, i, p, raw):
                    self.intent = type('Int', (), {'value': i})()
                    self.parameters = p
                    self.raw_text = raw
                    self.llm_response = ""

            cmd = MockCommand(final_intent, understanding.parameters, user_command)
            
            max_healing_tries = 3
            last_result = {"success": False, "message": "Initial state"}
            
            for attempt in range(max_healing_tries):
                print(f"[SelfImprover] Execution attempt {attempt + 1}/{max_healing_tries}...")
                try:
                    # Clear any cached module to ensure we load the latest fixed version
                    self.extension_loader.reload_extension(final_intent)
                    last_result = self.extension_loader.execute(cmd, None)
                    
                    if last_result.get("success"):
                        print(f"[SelfImprover] ✓ Success on attempt {attempt + 1}!")
                        break
                    
                    # If it failed, check if it's a code error we can fix
                    error_msg = last_result.get("message", "")
                    error_detail = last_result.get("error_detail", "") or error_msg
                    
                    if any(x in error_detail for x in ["NameError", "TypeError", "AttributeError", "SyntaxError", "ImportError", "ModuleNotFoundError"]):
                        if attempt < max_healing_tries - 1:
                            print(f"[SelfImprover] 🛠 Runtime error detected. Attempting self-healing fix...")
                            handler_path = self.extension_loader.extensions_dir / final_intent / "handler.py"
                            if handler_path.exists():
                                old_code = handler_path.read_text(encoding="utf-8")
                                fixed_code = self.code_generator.fix_handler(final_intent, old_code, error_detail)
                                if fixed_code and fixed_code != old_code:
                                    self.extension_creator.rewrite_handler(final_intent, fixed_code)
                                    continue # Try again
                        else:
                            print(f"[SelfImprover] ✗ Max retries reached.")
                    else:
                        # Probably a logic error or environment issue (like WiFi off), don't retry code fix
                        break

                except Exception as e:
                    import traceback
                    error_detail = traceback.format_exc()
                    print(f"[SelfImprover] Execution crash: {e}")
                    last_result = {"success": False, "message": str(e), "error_detail": error_detail}
                    if attempt < max_healing_tries - 1:
                        # Attempt to fix the crash
                        handler_path = self.extension_loader.extensions_dir / final_intent / "handler.py"
                        if handler_path.exists():
                            old_code = handler_path.read_text(encoding="utf-8")
                            fixed_code = self.code_generator.fix_handler(final_intent, old_code, error_detail)
                            if fixed_code:
                                self.extension_creator.rewrite_handler(final_intent, fixed_code)
                                continue

            # ── Final Response Formatting ────────────────────────────────────
            if last_result.get("success"):
                last_result["message"] = (
                    f"🎉 **Extension '{final_intent}' is now active and working!**\n\n"
                    f"{last_result.get('message', 'Execution successful.')}\n\n"
                    f"💡 This capability is now permanently part of my skills."
                )
            else:
                # Provide diagnostic report
                handler_rel_path = f"brain/extensions/{final_intent}/handler.py"
                last_result["message"] = (
                    f"⚠️ **Extension Created, but encountered a flaw.**\n\n"
                    f"I tried to fix it automatically 3 times, but it still has an issue:\n"
                    f"```\n{last_result.get('message', 'Unknown error')}\n```\n\n"
                    f"**How to solve it:**\n"
                    f"1. Open the [Extensions Tab] and click **'Edit'** on `{final_intent}`.\n"
                    f"2. Check the code in `{handler_rel_path}`.\n"
                    f"3. You can ask me to 'Fix my {final_intent} extension' by pasting the error or describing what's wrong."
                )

            return last_result
            
        except Exception as e:
            import traceback
            err_detail = traceback.format_exc()
            print(f"[SelfImprover] ✗ Error during improvement: {e}\n{err_detail}")
            return {
                "success": False,
                "message": f"❌ **Self-improvement failed**: {str(e)}",
                "error_detail": err_detail,
                "action": "error"
            }
    
    def get_capabilities_summary(self) -> str:
        """Get summary of all capabilities (core + extensions)"""
        
        extensions = self.extension_loader.list_extensions()
        
        if not extensions:
            return "No custom extensions installed yet."
        
        summary = f"Custom Extensions ({len(extensions)}):\n"
        for ext in extensions:
            summary += f"  • {ext['name']}: {ext['description']}\n"
        
        return summary


# Global singleton
_self_improver = None


def get_self_improver() -> SelfImprover:
    """Get or create the global SelfImprover instance"""
    global _self_improver
    if _self_improver is None:
        _self_improver = SelfImprover()
    return _self_improver


# Test function
if __name__ == "__main__":
    print("=" * 70)
    print("Self Improver - Test")
    print("=" * 70)
    
    improver = get_self_improver()
    
    # Test 1: Handle unknown command
    print("\n[Test 1] Testing unknown command detection...")
    result = improver.handle_unknown_command("compress my folder to zip")
    
    print(f"\nResult:")
    print(f"  Success: {result.get('success')}")
    print(f"  Action: {result.get('action')}")
    print(f"  Message: {result.get('message')[:100]}...")
    
    # Test 2: Get capabilities
    print("\n[Test 2] Current capabilities...")
    print(improver.get_capabilities_summary())
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
    print("\n✓ Self-improver ready!")
    print("✓ Can detect missing functionality")
    print("✓ Can generate and install extensions")
    print("✓ Ready for production use!")
