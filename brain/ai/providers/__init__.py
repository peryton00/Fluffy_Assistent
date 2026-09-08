"""
Model Providers package for Fluffy AI Runtime.
"""

from brain.ai.providers.interface import ModelProvider
from brain.ai.providers.local.provider import LocalModelProvider

__all__ = [
    "ModelProvider",
    "LocalModelProvider",
]
