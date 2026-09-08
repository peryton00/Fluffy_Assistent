"""
Backward-compatibility shim for brain.code_generator -> brain.extensions.code_generator
"""
from brain.extensions.code_generator import GeneratedCode, CodeGenerator, get_code_generator

__all__ = ["GeneratedCode", "CodeGenerator", "get_code_generator"]
