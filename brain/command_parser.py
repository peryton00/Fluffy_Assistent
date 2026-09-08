"""
[COMPATIBILITY SHIM]
This module re-exports symbols from brain.agent.command_parser.
Do not add business logic here. Scheduled for eventual removal once all callers migrate.
"""
from brain.agent.command_parser import (
    Intent,
    Command,
    CommandParser,
)

__all__ = ["Intent", "Command", "CommandParser"]
