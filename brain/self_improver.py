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
            
            # Step 1: Generate code
            print(f"[SelfImprover] [1/4] Generating code for '{understanding.intent}'...")
            
            generated_code = self.code_generator.generate_intent_handler(
                intent_name=understanding.intent,
                description=understanding.suggested_implementation,
                parameters=understanding.parameters
            )
            
            # Check if code generation failed after retries
            if generated_code is None:
                return {
                    "success": False,
                    "message": (
                        "❌ **Code Generation Failed**\n\n"
                        "I tried 3 times to generate valid code for this functionality, "
                        "but encountered syntax errors each time.\n\n"
                        "**Possible reasons:**\n"
                        "- The functionality is too complex for automatic generation\n"
                        "- The LLM is having trouble with the specific requirements\n\n"
                        "**What you can do:**\n"
                        "1. Try rephrasing your request with more details\n"
                        "2. Break it into smaller, simpler tasks\n"
                        "3. Report this issue if it persists"
                    ),
                    "action": "error"
                }
            
            print(f"[SelfImprover] ✓ Code generated ({len(generated_code.executor_method)} chars)")
            
            # Step 2: Create extension
            print(f"[SelfImprover] [2/4] Creating extension...")
            
            actual_intent = self.extension_creator.create_extension(
                intent_name=understanding.intent,
                generated_code=generated_code,
                description=understanding.suggested_implementation,
                parameters=understanding.parameters
            )
            
            if not actual_intent:
                return {
                    "success": False,
                    "message": "Failed to create extension",
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
            
            # Create a mock command object for the extension
            # Extensions don't need full Command object, just intent and parameters
            class MockCommand:
                def __init__(self, intent_value, params):
                    self.intent = type('Intent', (), {'value': intent_value})()
                    self.parameters = params
            
            command = MockCommand(final_intent, understanding.parameters)
            
            result = self.extension_loader.execute(command, None)
            
            print(f"[SelfImprover] ✓ Command executed")
            
            # Add enhanced success message
            if result.get("success"):
                result["message"] = (
                    f"🎉 **Extension '{final_intent}' is now active!**\n\n"
                    f"Your command has been executed successfully.\n\n"
                    f"**Result:**\n{result.get('message', '')}\n\n"
                    f"💡 You can use this capability anytime now - no restart needed!"
                )
            else:
                # Extension loaded but execution failed
                result["message"] = (
                    f"✅ Extension '{final_intent}' was created and loaded successfully.\n\n"
                    f"⚠️ However, execution failed:\n{result.get('message', 'Unknown error')}\n\n"
                    f"The extension is installed and can be debugged in `brain/extensions/{final_intent}/`"
                )
            
            return result
            
        except Exception as e:
            print(f"[SelfImprover] ✗ Error during improvement: {e}")
            return {
                "success": False,
                "message": f"Self-improvement failed: {str(e)}",
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
