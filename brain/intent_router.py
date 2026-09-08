"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.agent.intent_router.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.agent.intent_router import (
    IntentRouter,
    get_intent_router,
    understanding_text_or,
    _is_confirmation,
    _intent_router,
    _SYSTEM_COMMAND_INTENTS,
    _CONFIRMATION_WORDS,
)

__all__ = [
    "IntentRouter",
    "get_intent_router",
    "understanding_text_or",
    "_is_confirmation",
    "_intent_router",
    "_SYSTEM_COMMAND_INTENTS",
    "_CONFIRMATION_WORDS",
]
