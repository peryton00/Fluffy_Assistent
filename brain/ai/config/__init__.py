"""
Configuration and path abstractions for Fluffy AI.
"""

from brain.ai.config.paths import ApplicationDataPaths
from brain.ai.config.ai_config import AIConfig, get_ai_config, set_ai_config

__all__ = [
    "ApplicationDataPaths",
    "AIConfig",
    "get_ai_config",
    "set_ai_config",
]
