"""
Backward-compatibility shim for brain.extension_creator -> brain.extensions.extension_creator
"""
from brain.extensions.extension_creator import ExtensionCreator, get_extension_creator

__all__ = ["ExtensionCreator", "get_extension_creator"]
