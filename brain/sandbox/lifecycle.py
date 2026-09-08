"""
Sandbox Execution Lifecycle State Machine
Enforces strict state transitions and tracks active execution stages.
"""

from typing import Dict, Set
import threading

from brain.sandbox.definitions import SandboxLifecycleState
from brain.sandbox.errors import SandboxError


class SandboxLifecycleManager:
    """
    Tracks and validates lifecycle transitions for sandbox executions.
    """

    _VALID_TRANSITIONS: Dict[SandboxLifecycleState, Set[SandboxLifecycleState]] = {
        SandboxLifecycleState.CREATED: {SandboxLifecycleState.STARTING, SandboxLifecycleState.FAILED, SandboxLifecycleState.KILLED},
        SandboxLifecycleState.STARTING: {SandboxLifecycleState.READY, SandboxLifecycleState.RUNNING, SandboxLifecycleState.FAILED, SandboxLifecycleState.KILLED},
        SandboxLifecycleState.READY: {SandboxLifecycleState.RUNNING, SandboxLifecycleState.CANCELLING, SandboxLifecycleState.FAILED, SandboxLifecycleState.KILLED},
        SandboxLifecycleState.RUNNING: {SandboxLifecycleState.CANCELLING, SandboxLifecycleState.TERMINATING, SandboxLifecycleState.COMPLETED, SandboxLifecycleState.FAILED, SandboxLifecycleState.KILLED},
        SandboxLifecycleState.CANCELLING: {SandboxLifecycleState.TERMINATING, SandboxLifecycleState.KILLED, SandboxLifecycleState.FAILED},
        SandboxLifecycleState.TERMINATING: {SandboxLifecycleState.KILLED, SandboxLifecycleState.FAILED, SandboxLifecycleState.CLEANED},
        SandboxLifecycleState.COMPLETED: {SandboxLifecycleState.CLEANED},
        SandboxLifecycleState.FAILED: {SandboxLifecycleState.CLEANED},
        SandboxLifecycleState.KILLED: {SandboxLifecycleState.CLEANED},
        SandboxLifecycleState.CLEANED: set(),
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._states: Dict[str, SandboxLifecycleState] = {}

    def set_state(self, execution_id: str, new_state: SandboxLifecycleState) -> None:
        """
        Transition an execution to a new state.
        Raises SandboxError if transition is invalid.
        """
        with self._lock:
            current = self._states.get(execution_id, SandboxLifecycleState.CREATED)
            if current == new_state:
                return

            allowed = self._VALID_TRANSITIONS.get(current, set())
            if new_state not in allowed:
                raise SandboxError(
                    f"Invalid sandbox lifecycle transition for '{execution_id}' from '{current.value}' to '{new_state.value}'."
                )
            
            self._states[execution_id] = new_state

    def get_state(self, execution_id: str) -> SandboxLifecycleState:
        """Retrieve current lifecycle state for an execution."""
        with self._lock:
            return self._states.get(execution_id, SandboxLifecycleState.CREATED)

    def remove(self, execution_id: str) -> None:
        """Clear execution tracking after cleanup."""
        with self._lock:
            self._states.pop(execution_id, None)
