"""
Memory module for Fluffy Assistant
Provides long-term and session memory management
"""

from .long_term_memory import (
    load_memory,
    save_memory,
    update_memory,
    get_preference,
    set_preference,
    add_trusted_process,
    remove_trusted_process,
    get_trusted_processes,
    is_trusted_process,
    get_minimal_memory_for_llm
)

from .session_memory import (
    SessionMemory,
    get_session_memory,
    reset_session_memory
)


__all__ = [
    'load_memory',
    'save_memory',
    'update_memory',
    'get_preference',
    'set_preference',
    'add_trusted_process',
    'is_trusted_process',
    'get_minimal_memory_for_llm',
    'SessionMemory',
    'get_session_memory'
]
