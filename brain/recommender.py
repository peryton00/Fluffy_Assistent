"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.agent.recommender.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.agent.recommender import (
    recommend,
    should_emit,
    SYSTEM_PROCESSES,
    _last_emit,
)

__all__ = [
    "recommend",
    "should_emit",
    "SYSTEM_PROCESSES",
    "_last_emit",
]
