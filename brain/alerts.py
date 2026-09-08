"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.runtime.alerts.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.runtime.alerts import (
    memory_pressure_message,
    cpu_pressure_message,
)

__all__ = ["memory_pressure_message", "cpu_pressure_message"]
