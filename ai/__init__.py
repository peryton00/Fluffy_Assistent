"""
[COMPATIBILITY SHIM]
Re-exports from brain.ai.
"""
from brain.ai.llm_config import LLMConfig, get_config
from brain.ai.llm_client import LLMClient, get_client
from brain.ai.llm_service import LLMService, get_service
from . import src

__all__ = [
    "LLMConfig",
    "get_config",
    "LLMClient",
    "get_client",
    "LLMService",
    "get_service",
    "src",
]
