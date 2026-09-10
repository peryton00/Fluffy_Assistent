"""
Semantic Memory Package for Fluffy Assistant
Provides segregated memory abstractions:
- telemetry: Rolling process and system resource history (BrainMemory)
- conversation: Multi-turn chat persistence (ChatHistory)
- session: In-flight action state, pending confirmations (SessionMemory)
- user: Long-term profile, preferences, and trusted entities (load_memory, save_memory)
"""

from brain.memory.telemetry.telemetry_memory import BrainMemory
from brain.memory.conversation.chat_history import ChatHistory
from brain.memory.session.session_memory import (
    SessionMemory,
    get_session_memory,
    reset_session_memory,
)
from brain.memory.user.long_term_memory import (
    load_memory,
    save_memory,
    update_memory,
    get_preference,
    set_preference,
    add_trusted_process,
    remove_trusted_process,
    is_trusted_process,
    get_trusted_processes,
    clear_trusted_processes,
    add_ignored_process,
    is_ignored_process,
    add_pinned_process,
    remove_pinned_process,
    is_pinned_process,
    get_minimal_memory_for_llm,
    record_command,
    get_frequent_intents,
    get_known_networks,
    get_known_network,
    save_known_network,
    get_device_aliases,
    get_device_alias,
    set_device_alias,
    get_approved_services,
    set_approved_service,
    project_network_intelligence_to_memory,
)

__all__ = [
    "BrainMemory",
    "ChatHistory",
    "SessionMemory",
    "get_session_memory",
    "reset_session_memory",
    "load_memory",
    "save_memory",
    "update_memory",
    "get_preference",
    "set_preference",
    "add_trusted_process",
    "remove_trusted_process",
    "is_trusted_process",
    "get_trusted_processes",
    "clear_trusted_processes",
    "add_ignored_process",
    "is_ignored_process",
    "add_pinned_process",
    "remove_pinned_process",
    "is_pinned_process",
    "get_minimal_memory_for_llm",
    "record_command",
    "get_frequent_intents",
    "get_known_networks",
    "get_known_network",
    "save_known_network",
    "get_device_aliases",
    "get_device_alias",
    "set_device_alias",
    "get_approved_services",
    "set_approved_service",
    "project_network_intelligence_to_memory",
]
