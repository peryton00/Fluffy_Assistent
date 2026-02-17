"""
Code Validator
Validates Python code syntax and provides detailed error information
"""

import ast
import sys
from typing import Dict, Any


def validate_python_code(code: str, filename: str = "<generated>") -> Dict[str, Any]:
    """
    Validate Python code syntax using AST parsing
    
    Args:
        code: Python code string to validate
        filename: Optional filename for error reporting
    
    Returns:
        {
            "valid": bool,
            "error": str or None,
            "error_type": str or None,
            "line": int or None,
            "column": int or None,
            "suggestion": str or None
        }
    """
    if not code or not code.strip():
        return {
            "valid": False,
            "error": "Code is empty",
            "error_type": "EmptyCode",
            "line": None,
            "column": None,
            "suggestion": "Provide valid Python code"
        }
    
    try:
        # Try to parse the code
        ast.parse(code, filename=filename)
        return {
            "valid": True,
            "error": None,
            "error_type": None,
            "line": None,
            "column": None,
            "suggestion": None
        }
    except SyntaxError as e:
        # Extract detailed error information
        error_type = type(e).__name__
        error_msg = str(e.msg) if hasattr(e, 'msg') else str(e)
        line = e.lineno if hasattr(e, 'lineno') else None
        column = e.offset if hasattr(e, 'offset') else None
        
        # Generate helpful suggestion based on error type
        suggestion = _get_suggestion(error_msg, error_type)
        
        return {
            "valid": False,
            "error": error_msg,
            "error_type": error_type,
            "line": line,
            "column": column,
            "suggestion": suggestion
        }
    except Exception as e:
        # Catch other parsing errors
        return {
            "valid": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "line": None,
            "column": None,
            "suggestion": "Check for general syntax issues"
        }


def _get_suggestion(error_msg: str, error_type: str) -> str:
    """Generate helpful suggestion based on error type"""
    
    error_lower = error_msg.lower()
    
    if "unterminated string" in error_lower or "eol while scanning" in error_lower:
        return "Check for missing closing quotes (', \", ''', \"\"\")"
    
    if "unexpected eof" in error_lower or "expected" in error_lower:
        return "Check for missing closing brackets, parentheses, or braces"
    
    if "invalid syntax" in error_lower:
        if "f-string" in error_lower:
            return "Check f-string syntax - ensure proper braces and quotes"
        return "Check for typos, missing colons, or incorrect indentation"
    
    if "indentation" in error_lower:
        return "Ensure consistent indentation (use 4 spaces)"
    
    if "unmatched" in error_lower:
        return "Check for unmatched parentheses, brackets, or braces"
    
    return "Review the code syntax carefully"


def validate_extension_code(handler_code: str, validator_code: str) -> Dict[str, Any]:
    """
    Validate both handler and validator code for an extension
    
    Args:
        handler_code: Handler method code
        validator_code: Validator method code
    
    Returns:
        {
            "valid": bool,
            "handler_valid": bool,
            "validator_valid": bool,
            "handler_error": dict or None,
            "validator_error": dict or None
        }
    """
    handler_result = validate_python_code(handler_code, filename="handler.py")
    validator_result = validate_python_code(validator_code, filename="validator.py")
    
    return {
        "valid": handler_result["valid"] and validator_result["valid"],
        "handler_valid": handler_result["valid"],
        "validator_valid": validator_result["valid"],
        "handler_error": handler_result if not handler_result["valid"] else None,
        "validator_error": validator_result if not validator_result["valid"] else None
    }


# Test function
if __name__ == "__main__":
    print("=" * 70)
    print("CODE VALIDATOR TEST")
    print("=" * 70)
    
    # Test 1: Valid code
    print("\n[Test 1] Valid code:")
    valid_code = """
def hello():
    return "Hello, World!"
"""
    result = validate_python_code(valid_code)
    print(f"  Valid: {result['valid']}")
    
    # Test 2: Unterminated string
    print("\n[Test 2] Unterminated string:")
    bad_code = """
def hello():
    return "Hello, World!
"""
    result = validate_python_code(bad_code)
    print(f"  Valid: {result['valid']}")
    print(f"  Error: {result['error']}")
    print(f"  Line: {result['line']}")
    print(f"  Suggestion: {result['suggestion']}")
    
    # Test 3: Missing parenthesis
    print("\n[Test 3] Missing closing parenthesis:")
    bad_code2 = """
def calculate(x, y):
    return (x + y
"""
    result = validate_python_code(bad_code2)
    print(f"  Valid: {result['valid']}")
    print(f"  Error: {result['error']}")
    print(f"  Suggestion: {result['suggestion']}")
    
    # Test 4: Extension validation
    print("\n[Test 4] Extension code validation:")
    handler = 'def execute(self, command):\n    return {"success": True}'
    validator = 'def validate(self, command):\n    return True'
    result = validate_extension_code(handler, validator)
    print(f"  Valid: {result['valid']}")
    print(f"  Handler: {result['handler_valid']}")
    print(f"  Validator: {result['validator_valid']}")
    
    print("\n" + "=" * 70)
    print("TEST COMPLETE")
    print("=" * 70)
