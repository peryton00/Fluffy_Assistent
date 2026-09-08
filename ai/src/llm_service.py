"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.ai.llm_service.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.ai.llm_service import (
    LLMService,
    get_service,
    _service,
)

__all__ = ["LLMService", "get_service", "_service"]
