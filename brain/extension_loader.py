"""
Backward-compatibility shim for brain.extension_loader -> brain.extensions.extension_loader
"""
from brain.extensions.extension_loader import ExtensionLoader, get_extension_loader

__all__ = ["ExtensionLoader", "get_extension_loader"]
