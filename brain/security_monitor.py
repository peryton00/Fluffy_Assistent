"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.security.security_monitor.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.security.security_monitor import (
    SecurityMonitor,
)

__all__ = ["SecurityMonitor"]
