"""
Code Generator
Generates code for new functionality using LLM
"""

import sys
import json
import re
from pathlib import Path
from typing import Dict, Any, List

# Add ai module to path
sys.path.insert(0, str(Path(__file__).parent.parent / "ai" / "src"))


class GeneratedCode:
    """Container for generated code blocks"""
    
    def __init__(self, data: Dict[str, Any]):
        self.intent_name = data.get("intent_name", "")
        self.intent_enum = data.get("intent_enum", "")
        self.patterns = data.get("patterns", [])
        self.parameter_extraction = data.get("parameter_extraction", "")
        self.executor_method = data.get("executor_method", "")
        self.validation = data.get("validation_method", data.get("validation", ""))
        self.description = data.get("description", "")
    
    def __repr__(self):
        return f"GeneratedCode(intent={self.intent_name})"


class CodeGenerator:
    """Generate code for new functionality using LLM"""
    
    def __init__(self):
        self.llm = None  # Lazy load
    
    def _get_llm(self):
        """Lazy load LLM service"""
        if self.llm is None:
            try:
                from llm_service import get_service
                self.llm = get_service()
            except Exception as e:
                print(f"[CodeGenerator] Failed to load LLM service: {e}")
                self.llm = None
        return self.llm
    
    def generate_intent_handler(
        self,
        intent_name: str,
        description: str,
        parameters: Dict[str, Any]
    ) -> GeneratedCode:
        """
        Generate all code needed for a new intent
        
        Args:
            intent_name: Name of the intent (e.g., "download_file")
            description: What this intent does
            parameters: Parameters needed for this intent
            
        Returns:
            GeneratedCode object with all necessary code blocks
        """
        
        llm = self._get_llm()
        if not llm:
            return self._generate_fallback_code(intent_name, description, parameters)
        
        # Build prompt
        prompt = self._build_generation_prompt(intent_name, description, parameters)
        
        try:
            # Query LLM
            result = llm.query_llm(prompt)
            
            # Collect streaming response
            full_response = ""
            for chunk in result["stream"]:
                full_response += chunk
            
            print(f"[CodeGenerator] Generated {len(full_response)} chars of code")
            
            # Parse response
            generated = self._parse_generated_code(full_response, intent_name, description)
            
            return generated
            
        except Exception as e:
            print(f"[CodeGenerator] Error: {e}, using fallback")
            return self._generate_fallback_code(intent_name, description, parameters)
    
    def _build_generation_prompt(
        self,
        intent_name: str,
        description: str,
        parameters: Dict[str, Any]
    ) -> str:
        """Build prompt for code generation"""
        
        prompt = f"""Generate Python code for a new Fluffy command capability.

Intent Name: {intent_name}
Description: {description}
Parameters: {json.dumps(parameters, indent=2)}

Generate the following code blocks:

1. **Intent Enum Entry** - Constant name for the intent
   Format: descriptive string (e.g. "RENAME_FILES")

2. **Regex Patterns** - List of strings
   Example: ["rename\\s+(.+)", "change\\s+names\\s+in\\s+(.+)"]

4. **Executor Method** - Complete Python method for CommandExecutor.
   Template:
   ```python
   def execute(self, command: Command) -> Dict[str, Any]:
       \"\"\"Brief description\"\"\"
       try:
           # Get params from command.parameters
           param1 = command.parameters.get("name")
           # Logic here (use os, shutil, etc.)
           return {{"success": True, "message": "Success message"}}
       except Exception as e:
           return {{"success": False, "message": f"Error: {{str(e)}}"}}
   ```

5. **Validation Logic** - Python code for ActionValidator.
   Template:
   ```python
   def validate(self, command: Command):
       \"\"\"Brief description\"\"\"
       if command.intent.value == "intent_name":
           return ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="Safe")
       return None
   ```

Return your response as a SINGLE JSON OBJECT. 
CRITICAL: NO NOT use "self.extract_parameters" or "self.validate_folder". Use "command.parameters" and standard library calls.
CRITICAL: All Python code blocks MUST be escape-encoded as JSON strings (escape backslashes, double quotes, and newlines).

JSON Structure:
{{
    "intent_enum": "DESCRIPTIVE_NAME",
    "patterns": ["pattern1"],
    "parameter_extraction": "Python code...",
    "executor_method": "def execute(self, command): ...",
    "validation": "Python code...",
    "description": "brief description"
}}

Make the code:
- Production-ready with error handling
- Well-commented
- Following Fluffy's existing code style
- Safe and secure (no arbitrary code execution)

Generate code for: {intent_name}
"""
        
        return prompt
    
    def _parse_generated_code(
        self,
        response: str,
        intent_name: str,
        description: str
    ) -> GeneratedCode:
        """Parse LLM's generated code"""
        
        try:
            # Extract JSON
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
            elif "{" in response:
                json_start = response.find("{")
                json_end = response.rfind("}") + 1
                json_str = response[json_start:json_end]
            else:
                raise ValueError("No JSON found in response")
            
            data = json.loads(json_str)
            data["intent_name"] = intent_name
            data["description"] = description
            
            return GeneratedCode(data)
            
        except Exception as e:
            print(f"[CodeGenerator] Failed to parse generated code: {e}")
            return self._generate_fallback_code(intent_name, description, {})
    
    def _generate_fallback_code(
        self,
        intent_name: str,
        description: str,
        parameters: Dict[str, Any]
    ) -> GeneratedCode:
        """Generate basic fallback code when LLM fails"""
        
        # Convert intent_name to enum format
        intent_enum = intent_name.upper()
        
        # Basic pattern
        patterns = [f"r\"{intent_name.replace('_', ' ')}\\s+(.+)\""]
        
        # Basic parameter extraction
        param_extraction = f"""
        if intent == Intent.{intent_enum}:
            # Extract parameters from match
            params = {{"description": match.group(1).strip()}}
            return params
        """
        
        # Basic executor method
        executor_method = f"""
    def execute(self, command: Command) -> Dict[str, Any]:
        \"\"\"Execute {intent_name} command\"\"\"
        try:
            # TODO: Implement {description}
            return {{
                "success": False,
                "message": "Functionality not yet implemented",
                "action": "error"
            }}
        except Exception as e:
            return {{
                "success": False,
                "message": f"Error: {{str(e)}}",
                "action": "error"
            }}
        """
        
        # Basic validation
        validation = f"""
    def validate(self, command: Command):
        \"\"\"Validate {intent_name} command\"\"\"
        if command.intent.value == "{intent_name}":
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.SAFE,
                message="{description} is safe"
            )
        return None
        """
        
        return GeneratedCode({
            "intent_name": intent_name,
            "intent_enum": intent_enum,
            "patterns": patterns,
            "parameter_extraction": param_extraction,
            "executor_method": executor_method,
            "validation": validation,
            "description": description
        })


# Global singleton
_code_generator = None

def get_code_generator() -> CodeGenerator:
    """Get or create the global CodeGenerator instance"""
    global _code_generator
    if _code_generator is None:
        _code_generator = CodeGenerator()
    return _code_generator


# Test function
if __name__ == "__main__":
    print("=" * 70)
    print("Code Generator - Test")
    print("=" * 70)
    
    generator = get_code_generator()
    
    # Test code generation
    print("\n[Test] Generating code for 'download_file' intent...")
    
    generated = generator.generate_intent_handler(
        intent_name="download_file",
        description="Download file from URL to specified location",
        parameters={
            "url": "URL to download from",
            "destination": "Where to save the file"
        }
    )
    
    print(f"\nGenerated Code:")
    print(f"  Intent Enum: {generated.intent_enum}")
    print(f"  Patterns: {generated.patterns}")
    print(f"  Description: {generated.description}")
    print(f"\n  Executor Method Preview:")
    print(f"  {generated.executor_method[:200]}...")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
