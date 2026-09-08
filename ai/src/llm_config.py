"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.ai.llm_config.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.ai.llm_config import (
    LLMConfig,
    get_config,
    _config,
)

__all__ = ["LLMConfig", "get_config", "_config"]
