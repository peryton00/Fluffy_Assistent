"""
Backward-compatibility shim for commands -> brain.runtime.commands
"""
import sys
from brain.runtime import commands as _runtime_commands

sys.modules["commands"] = _runtime_commands
sys.modules["brain.commands"] = _runtime_commands

from brain.runtime.commands import COMMAND_HOST, COMMAND_PORT, send_command

__all__ = ["COMMAND_HOST", "COMMAND_PORT", "send_command"]
