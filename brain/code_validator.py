"""
Backward-compatibility shim for brain.code_validator -> brain.extensions.code_validator
"""
from brain.extensions.code_validator import validate_python_code, validate_extension_code

__all__ = ["validate_python_code", "validate_extension_code"]
