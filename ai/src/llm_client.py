"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.ai.llm_client.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.ai.llm_client import (
    LLMClient,
    get_client,
    _client,
)

__all__ = ["LLMClient", "get_client", "_client"]
