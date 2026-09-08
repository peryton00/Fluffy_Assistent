"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.agent.interpreter.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.agent.interpreter import (
    interpret,
    should_emit,
    push_system_stats,
    push_process_stats,
    is_system_consistently_above,
    detect_process_leak,
    count_process_spikes,
    _last_emit,
    _system_history,
    _process_history,
)

__all__ = [
    "interpret",
    "should_emit",
    "push_system_stats",
    "push_process_stats",
    "is_system_consistently_above",
    "detect_process_leak",
    "count_process_spikes",
    "_last_emit",
    "_system_history",
    "_process_history",
]
