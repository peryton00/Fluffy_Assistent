"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.memory.conversation.chat_history.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.memory.conversation.chat_history import (
    ChatHistory,
)

__all__ = ["ChatHistory"]
