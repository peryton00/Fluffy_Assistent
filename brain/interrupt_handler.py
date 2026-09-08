"""
Backward-compatibility shim for brain.interrupt_handler -> brain.tools.interrupt_handler
"""
from brain.tools.interrupt_handler import (
    is_interrupt_command,
    handle_interrupt,
    cancel_pending_action,
    get_cancellable_actions,
)
