"""
Code Generator
Generates code for new functionality using LLM
"""

import sys
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

# Add ai/src to path so llm_client is importable directly
_ai_src = str(Path(__file__).parent.parent / "ai" / "src")
if _ai_src not in sys.path:
    sys.path.insert(0, _ai_src)


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
        self.llm_client = None  # Direct reference to avoid circular import

    def _get_llm_client(self):
        """Lazy load raw LLM client (avoids circular import with LLMService)."""
        if self.llm_client is None:
            try:
                from llm_client import get_client
                self.llm_client = get_client()
            except Exception as e:
                print(f"[CodeGenerator] Failed to load LLM client: {e}")
        return self.llm_client

    def _query(self, prompt: str, system: str = None) -> str:
        """Run a prompt through the LLM and return full string response."""
        client = self._get_llm_client()
        if not client:
            return ""
        messages = [
            {"role": "system", "content": system or "You are an expert Python/JS developer."},
            {"role": "user", "content": prompt}
        ]
        try:
            return "".join(str(c) for c in client.chat(messages))
        except Exception as e:
            print(f"[CodeGenerator] LLM query error: {e}")
            return ""
    
    def generate_intent_handler(
        self,
        intent_name: str,
        description: str,
        parameters: Dict[str, Any],
        max_retries: int = 3
    ) -> Optional["GeneratedCode"]:
        """
        Generate all code needed for a new intent with automatic validation and fixing.
        """
        client = self._get_llm_client()
        if not client:
            return self._generate_fallback_code(intent_name, description, parameters)
        
        # Import validator
        try:
            from code_validator import validate_extension_code
        except ImportError:
            from brain.code_validator import validate_extension_code

        # Try generating and validating code
        for attempt in range(max_retries):
            try:
                print(f"[CodeGenerator] Attempt {attempt + 1}/{max_retries}")

                # Build prompt (use fix prompt if retrying)
                if attempt == 0:
                    prompt = self._build_generation_prompt(intent_name, description, parameters)
                else:
                    prompt = self._build_fix_prompt(generated, validation_result, intent_name, description)

                full_response = self._query(prompt)
                print(f"[CodeGenerator] Generated {len(full_response)} chars of code")

                generated = self._parse_generated_code(full_response, intent_name, description)
                validation_result = validate_extension_code(
                    generated.executor_method,
                    generated.validation
                )
                
                if validation_result["valid"]:
                    print(f"[CodeGenerator] ✓ Code validation passed!")
                    return generated
                else:
                    # Log validation errors
                    if not validation_result["handler_valid"]:
                        error = validation_result["handler_error"]
                        print(f"[CodeGenerator] ✗ Handler error: {error['error']} (line {error['line']})")
                        print(f"[CodeGenerator]   Suggestion: {error['suggestion']}")
                    
                    if not validation_result["validator_valid"]:
                        error = validation_result["validator_error"]
                        print(f"[CodeGenerator] ✗ Validator error: {error['error']} (line {error['line']})")
                        print(f"[CodeGenerator]   Suggestion: {error['suggestion']}")
                    
                    if attempt < max_retries - 1:
                        print(f"[CodeGenerator] Retrying with LLM fix...")
                    else:
                        print(f"[CodeGenerator] ✗ Failed after {max_retries} attempts")
                        return None
                
            except Exception as e:
                print(f"[CodeGenerator] Error on attempt {attempt + 1}: {e}")
                if attempt == max_retries - 1:
                    print(f"[CodeGenerator] Using fallback code")
                    return self._generate_fallback_code(intent_name, description, parameters)
        
        return None
    
    def _build_generation_prompt(
        self,
        intent_name: str,
        description: str,
        parameters: Dict[str, Any]
    ) -> str:
        """Build prompt for code generation with strict architectural rules"""
        
        prompt = f"""Generate a high-quality Python extension for the Fluffy AI Assistant.

INTENT: {intent_name}
DESCRIPTION: {description}
EXPECTED PARAMETERS: {json.dumps(parameters, indent=2)}

### ARCHITECTURAL REQUIREMENTS:
1. **Module Structure**: 
   - You must provide a class `ScanHandler` (or relevant name) with an `execute(self, command: Command) -> Dict[str, Any]` method.
   - You MUST include a module-level function `get_handler() -> ScanHandler` that returns an instance of your class.
   - You MUST include a module-level function `get_validator() -> ActionValidator` if a custom validator is needed (otherwise it uses standard).

2. **Error Handling**:
   - Use a broad `try-except` block inside `execute`.
   - On error, return `{{"success": False, "message": "User friendly error message", "error_detail": "traceback/exception"}}`.

3. **Output Formatting**:
   - For lists of data (like WiFi, files, processes), return a Markdown-formatted string in the `"message"` field so it looks beautiful in the chat.
   - Return raw data in specific keys (e.g., `"networks": [...]`) for internal AI reasoning.

4. **Dependencies**:
   - Use ONLY standard Python libraries (`os`, `subprocess`, `sys`, `json`, `re`, `platform`).
   - If you need `netsh` (Windows) or `nmcli` (Linux), be OS-aware using `platform.system()`.

5. **Security**:
   - Sanitize all inputs from `command.parameters`.
   - Never use `eval()` or `os.system()` with unsanitized strings. Use `subprocess.run(..., shell=False)`.

### REQUIRED JSON STRUCTURE:
Return ONLY a JSON object. The code strings MUST be properly escaped for JSON (use \\n for newlines, \\" for quotes).
{{
    "intent_enum": "{intent_name.upper()}",
    "patterns": ["Regex matching user command"],
    "executor_method": "import os\\nfrom typing import Dict, Any\\n\\nclass {intent_name.title().replace('_', '')}Handler:\\n    def execute(self, command) -> Dict[str, Any]:\\n        ...",
    "validation": "from brain.action_validator import ValidationResult, SafetyLevel\\n\\nclass {intent_name.title().replace('_', '')}Validator:\\n    ...",
    "description": "{description}"
}}

CRITICAL: The `executor_method` string must be the ENTIRE content for `handler.py`. Use standard indentation (4 spaces) within the string.
        """
        return prompt
    
    def _build_fix_prompt(
        self,
        generated_code: GeneratedCode,
        validation_result: Dict[str, Any],
        intent_name: str,
        description: str
    ) -> str:
        """Build prompt for LLM to fix syntax errors"""
        
        # Determine which code has errors
        errors = []
        if not validation_result["handler_valid"]:
            error = validation_result["handler_error"]
            errors.append(f"""
**Handler Code Error:**
- Error: {error['error']}
- Line: {error['line']}
- Suggestion: {error['suggestion']}

Handler Code:
```python
{generated_code.executor_method}
```
""")
        
        if not validation_result["validator_valid"]:
            error = validation_result["validator_error"]
            errors.append(f"""
**Validator Code Error:**
- Error: {error['error']}
- Line: {error['line']}
- Suggestion: {error['suggestion']}

Validator Code:
```python
{generated_code.validation}
```
""")
        
        prompt = f"""The Python code you generated has syntax errors. Please fix them.

Intent: {intent_name}
Description: {description}

{''.join(errors)}

**Instructions:**
1. Fix ALL syntax errors
2. Ensure proper string escaping (use triple quotes for multi-line strings)
3. Balance all quotes, parentheses, and braces
4. Return the COMPLETE corrected code in the same JSON format

Return JSON:
{{
    "intent_enum": "{generated_code.intent_enum}",
    "patterns": {json.dumps(generated_code.patterns)},
    "executor_method": "FIXED executor code here",
    "validation": "FIXED validation code here",
    "description": "{description}"
}}

CRITICAL: Escape all special characters properly in JSON strings.
"""
        return prompt
    
    def _parse_generated_code(
        self,
        response: str,
        intent_name: str,
        description: str
    ) -> GeneratedCode:
        """Parse LLM's generated code with robust JSON extraction"""
        
        try:
            # 1. Try to find JSON block
            json_str = ""
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
            elif "{" in response:
                json_start = response.find("{")
                json_end = response.rfind("}") + 1
                json_str = response[json_start:json_end]
            
            if not json_str:
                raise ValueError("No JSON block found")

            # 2. Try to fix common LLM mistakes (like unescaped newlines in strings)
            # This is risky but often helps. For now, let's try direct parse first.
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError:
                # If it failed, maybe there are literal newlines?
                # This regex tries to find strings and escape their newlines
                fixed_json = re.sub(r'":\s*"(.*?)"(?=\s*[,}\n])', 
                                    lambda m: '": "' + m.group(1).replace('\n', '\\n').replace('\r', '\\r') + '"', 
                                    json_str, flags=re.DOTALL)
                data = json.loads(fixed_json)
                
            data["intent_name"] = intent_name
            data["description"] = description
            
            return GeneratedCode(data)
            
        except Exception as e:
            print(f"[CodeGenerator] Failed to parse generated code: {e}")
            # Log the response to help debugging (vocalize that it failed)
            return self._generate_fallback_code(intent_name, description, {})
    
    def _generate_fallback_code(
        self,
        intent_name: str,
        description: str,
        parameters: Dict[str, Any]
    ) -> GeneratedCode:
        """Generate basic fallback code when LLM fails. Must be VALID Python."""
        
        intent_enum = intent_name.upper()
        patterns = [f"r'{intent_name.replace('_', ' ')}'"]
        
        # VALID Python module (no top-level indentation)
        executor_method = f'''"""{intent_name} Extension - Fallback"""
from typing import Dict, Any

class {intent_name.title().replace('_', '')}Handler:
    def execute(self, command) -> Dict[str, Any]:
        return {{"success": False, "message": "Extension generation failed. Please edit this file to fix."}}

def get_handler():
    return {intent_name.title().replace('_', '')}Handler()
'''
        
        validation_code = f'''"""{intent_name} Extension - Validation Fallback"""
def get_validator():
    return None
'''
        
        return GeneratedCode({
            "intent_name": intent_name,
            "intent_enum": intent_enum,
            "patterns": patterns,
            "executor_method": executor_method,
            "validation": validation_code,
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


# ── Multi-language methods (added to CodeGenerator via monkey-patch-friendly style)

def _decide_language(self, description: str) -> str:
    """Decide the best language for an extension based on its description."""
    prompt = f"""You are helping decide the best implementation language for a Fluffy assistant extension.

Extension description: "{description}"

Choose ONE of these options:
- python    → system actions, file ops, subprocess, networking, APIs
- html      → needs a visual dashboard or interactive UI (charts, forms, controls)
- js        → pure data transformation, JSON APIs without a persistent UI

Rules:
- If the extension interacts with the OS, files, or runs subprocesses → python
- If the extension displays a rich UI for the user to interact with → html
- If it just transforms data or calls a web API → python (preferred over js)

Reply with ONLY one word: python, html, or js."""
    response = self._query(prompt).strip().lower()
    first = response.split()[0] if response.split() else "python"
    return first if first in ("python", "html", "js") else "python"

CodeGenerator.decide_language = _decide_language


def _fix_handler(self, intent_name: str, handler_code: str, error_message: str) -> str:
    """Ask LLM to fix a broken handler given the error text. Returns fixed code string."""
    prompt = f"""A Fluffy extension handler for '{intent_name}' failed at runtime with this error:

Error:
{error_message}

Current handler.py code:
```python
{handler_code}
```

Fix ALL problems so the handler runs successfully.
- Keep the execute(self, command) signature.
- Return fixed Python code ONLY — no markdown fences, no explanation.
"""
    fixed = self._query(prompt, system="You are an expert Python debugger. Output only corrected Python code.")
    # Strip any accidental fences
    if "```" in fixed:
        lines = fixed.splitlines()
        fixed = "\n".join(l for l in lines if not l.strip().startswith("```"))
    return fixed.strip()

CodeGenerator.fix_handler = _fix_handler


def _generate_web_ui(self, intent_name: str, description: str) -> dict:
    """Generate HTML+CSS+JS files for an extension with a visual UI."""
    prompt = f"""Create a complete web-based UI for a Fluffy assistant extension.

Intent: {intent_name}
Description: {description}

Generate a modern, dark-themed single-page UI.
The page communicates back to Fluffy's API at the same origin.

Return ONLY valid JSON with this structure:
{{
    "index.html": "complete HTML content",
    "styles.css": "complete CSS content",
    "app.js": "complete JS content"
}}"""
    raw = self._query(prompt, system="You are an expert frontend developer. Output only JSON.")
    try:
        if "{" in raw:
            raw = raw[raw.index("{"):raw.rindex("}") + 1]
        return json.loads(raw)
    except Exception as e:
        print(f"[CodeGenerator] Web UI parse error: {e}")
        return {
            "index.html": f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{intent_name}</title>
<style>body{{background:#1a1a2e;color:#e0e0e0;font-family:sans-serif;padding:2rem}}</style>
</head>
<body><h1>{intent_name}</h1><p>{description}</p></body>
</html>""",
            "styles.css": "body { background: #1a1a2e; color: #e0e0e0; }",
            "app.js": "// Extension UI placeholder"
        }

CodeGenerator.generate_web_ui = _generate_web_ui


def _generate_js_handler(self, intent_name: str, description: str, parameters: dict) -> str:
    """Generate a Node.js handler script for an extension."""
    prompt = f"""Generate a Node.js script for a Fluffy assistant extension.

Intent: {intent_name}
Description: {description}
Parameters (passed as JSON via stdin): {json.dumps(parameters)}

The script must:
1. Read parameters from stdin as JSON: const params = JSON.parse(require('fs').readFileSync(0,'utf8'))
2. Perform the task
3. Print a JSON result to stdout: {{"success": true/false, "message": "..."}}

Return ONLY the Node.js code — no markdown fences."""
    code = self._query(prompt, system="You are an expert Node.js developer. Output only executable JS code.")
    if "```" in code:
        lines = code.splitlines()
        code = "\n".join(l for l in lines if not l.strip().startswith("```"))
    return code.strip()

CodeGenerator.generate_js_handler = _generate_js_handler



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
