"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.context.context_manager.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.context.context_manager import (
    ContextManager,
    get_context_manager,
    _context_manager,
)

__all__ = ["ContextManager", "get_context_manager", "_context_manager"]
