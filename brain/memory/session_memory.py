"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.memory.session.session_memory.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.memory.session.session_memory import (
    SessionMemory,
    get_session_memory,
    reset_session_memory,
    _session_memory,
)

__all__ = [
    "SessionMemory",
    "get_session_memory",
    "reset_session_memory",
    "_session_memory",
]
