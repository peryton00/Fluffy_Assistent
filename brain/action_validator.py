"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.security.action_validator.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.security.action_validator import (
    ActionValidator,
    SafetyLevel,
    ValidationResult,
)

__all__ = [
    "ActionValidator",
    "SafetyLevel",
    "ValidationResult",
]
