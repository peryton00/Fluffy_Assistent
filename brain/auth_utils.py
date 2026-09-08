"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.security.auth_utils.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.security.auth_utils import (
    _get_token,
    _check_token,
    token_required,
)

__all__ = ["_get_token", "_check_token", "token_required"]
