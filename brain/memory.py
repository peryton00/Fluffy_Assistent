"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.memory.telemetry.telemetry_memory.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.memory.telemetry.telemetry_memory import (
    BrainMemory,
)

__all__ = ["BrainMemory"]
