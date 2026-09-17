"""
Persistent Agent Task Manager for Fluffy Assistant

Provides in-process lifecycle ownership of active agent tasks, orchestrators,
and execution results across HTTP request boundaries.
"""

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List

from brain.agent.interface import AgentResult
from brain.agent.limits import AgentLimits
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.state import AgentState
from brain.agent.task import AgentTask, TaskStatus


class TaskManagerError(Exception):
    """Base exception for AgentTaskManager operations."""
    pass


class TaskNotFoundError(TaskManagerError):
    """Raised when a requested task does not exist in the manager."""

    def __init__(self, task_id: str):
        super().__init__(f"Task '{task_id}' not found in task manager.")
        self.task_id = task_id


class TaskLifecycleError(TaskManagerError):
    """Raised when an operation is invalid for the task's current lifecycle status."""

    def __init__(self, message: str, task_id: Optional[str] = None):
        super().__init__(message)
        self.task_id = task_id


@dataclass
class TaskRecord:
    """
    Internal managed task record maintaining lifecycle ownership.
    """
    task: AgentTask
    plan: Optional[AgentPlan] = None
    orchestrator: Optional[AgentOrchestrator] = None
    result: Optional[AgentResult] = None
    is_running: bool = False
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize task record to dictionary."""
        return {
            "task_id": self.task.task_id,
            "task": self.task.to_dict(),
            "plan": self.plan.to_dict() if self.plan else None,
            "status": self.task.status.value,
            "is_running": self.is_running,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "result": self.result.to_dict() if hasattr(self.result, "to_dict") else None,
        }


class AgentTaskManager:
    """
    Thread-safe in-process task lifecycle manager.

    Ownership hierarchy:
    AgentTaskManager (owns lifecycle)
      -> AgentOrchestrator (owns execution)
         -> AgentState (owns state)

    Guarantees:
    - Retains orchestrator instances across requests (for resume/cancel/status).
    - Prevents concurrent duplicate executions of the same task.
    - Never holds registry locks during long-running tool/model executions.
    - Configurable in-memory retention for finished tasks (never evicts active tasks).
    """

    def __init__(
        self,
        max_history: int = 50,
        default_limits: Optional[AgentLimits] = None,
    ):
        self._records: Dict[str, TaskRecord] = {}
        self._lock = threading.RLock()
        self.max_history = max_history
        self.default_limits = default_limits

    def create_task(
        self,
        user_request: str,
        goal: Optional[str] = None,
        plan: Optional[AgentPlan] = None,
        task_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        orchestrator: Optional[AgentOrchestrator] = None,
    ) -> AgentTask:
        """
        Create and register a new AgentTask.
        Preserves task.task_id as the canonical identity.
        """
        with self._lock:
            task = AgentTask(
                user_request=user_request,
                goal=goal,
                task_id=task_id or f"task_{uuid.uuid4().hex[:10]}",
                context=context or {},
                metadata=metadata or {},
            )
            orch = orchestrator or AgentOrchestrator(limits=self.default_limits)
            record = TaskRecord(
                task=task,
                plan=plan,
                orchestrator=orch,
            )
            self._records[task.task_id] = record
            self._prune_history_locked()
            return task

    def register_task(
        self,
        task: AgentTask,
        plan: Optional[AgentPlan] = None,
        orchestrator: Optional[AgentOrchestrator] = None,
    ) -> AgentTask:
        """
        Register an existing AgentTask instance.
        """
        with self._lock:
            orch = orchestrator or AgentOrchestrator(limits=self.default_limits)
            record = TaskRecord(
                task=task,
                plan=plan,
                orchestrator=orch,
            )
            self._records[task.task_id] = record
            self._prune_history_locked()
            return task

    def get_task(self, task_id: str) -> Optional[AgentTask]:
        """Retrieve task by ID."""
        with self._lock:
            rec = self._records.get(task_id)
            return rec.task if rec else None

    def get_state(self, task_id: str) -> Optional[AgentState]:
        """Retrieve execution state by task ID from its orchestrator."""
        with self._lock:
            rec = self._records.get(task_id)
            if not rec or not rec.orchestrator:
                return None
            return rec.orchestrator.get_state(task_id)

    def get_orchestrator(self, task_id: str) -> Optional[AgentOrchestrator]:
        """Retrieve the orchestrator assigned to the task."""
        with self._lock:
            rec = self._records.get(task_id)
            return rec.orchestrator if rec else None

    def get_plan(self, task_id: str) -> Optional[AgentPlan]:
        """Retrieve the plan assigned to the task."""
        with self._lock:
            rec = self._records.get(task_id)
            return rec.plan if rec else None

    def get_result(self, task_id: str) -> Optional[AgentResult]:
        """Retrieve the latest execution result for the task."""
        with self._lock:
            rec = self._records.get(task_id)
            return rec.result if rec else None

    def get_record(self, task_id: str) -> Optional[TaskRecord]:
        """Retrieve the full internal task record."""
        with self._lock:
            return self._records.get(task_id)

    def start_task(self, task_id: str) -> AgentResult:
        """
        Execute the task using its existing orchestrator.
        Guarantees that execution runs outside the manager lock.
        Protects against concurrent duplicate executions.
        """
        with self._lock:
            rec = self._records.get(task_id)
            if not rec:
                raise TaskNotFoundError(task_id)

            if rec.is_running:
                raise TaskLifecycleError(f"Task '{task_id}' is already running.", task_id=task_id)

            if rec.task.is_terminal:
                raise TaskLifecycleError(
                    f"Task '{task_id}' is already in terminal status '{rec.task.status.value}'.",
                    task_id=task_id,
                )

            rec.is_running = True
            rec.updated_at = time.time()
            task = rec.task
            plan = rec.plan
            orchestrator = rec.orchestrator

        result = None
        try:
            # Execute outside lock
            result = orchestrator.run(task=task, plan=plan)
        finally:
            with self._lock:
                rec.is_running = False
                if result is not None:
                    rec.result = result
                rec.updated_at = time.time()
                self._prune_history_locked()

        return result

    def resume_task(
        self,
        task_id: str,
        confirmed: bool,
        confirmation_id: Optional[str] = None,
    ) -> AgentResult:
        """
        Resume a task suspended in WAITING_CONFIRMATION state using its existing orchestrator.
        """
        with self._lock:
            rec = self._records.get(task_id)
            if not rec:
                raise TaskNotFoundError(task_id)

            if rec.is_running:
                raise TaskLifecycleError(f"Task '{task_id}' is currently running.", task_id=task_id)

            if rec.task.status != TaskStatus.WAITING_CONFIRMATION:
                raise TaskLifecycleError(
                    f"Cannot resume task '{task_id}': status is '{rec.task.status.value}', expected WAITING_CONFIRMATION.",
                    task_id=task_id,
                )

            rec.is_running = True
            rec.updated_at = time.time()
            orchestrator = rec.orchestrator

        result = None
        try:
            # Resume outside lock
            result = orchestrator.resume(
                task_id=task_id,
                confirmed=confirmed,
                confirmation_id=confirmation_id,
            )
        finally:
            with self._lock:
                rec.is_running = False
                if result is not None:
                    rec.result = result
                rec.updated_at = time.time()
                self._prune_history_locked()

        return result

    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel an active or waiting task using its existing orchestrator.
        """
        with self._lock:
            rec = self._records.get(task_id)
            if not rec:
                raise TaskNotFoundError(task_id)

            orchestrator = rec.orchestrator
            cancelled = orchestrator.cancel(task_id)
            rec.updated_at = time.time()
            return cancelled

    def remove_task(self, task_id: str) -> bool:
        """
        Explicitly remove a task from the registry.
        """
        with self._lock:
            rec = self._records.get(task_id)
            if not rec:
                return False
            if rec.is_running:
                raise TaskLifecycleError(f"Cannot remove active running task '{task_id}'.", task_id=task_id)
            del self._records[task_id]
            return True

    def list_active_tasks(self) -> List[AgentTask]:
        """
        List all active non-terminal tasks.
        """
        with self._lock:
            return [
                rec.task
                for rec in self._records.values()
                if not rec.task.is_terminal
            ]

    def list_tasks(self, status: Optional[TaskStatus] = None) -> List[AgentTask]:
        """
        List all registered tasks, optionally filtered by status.
        """
        with self._lock:
            if status is None:
                return [rec.task for rec in self._records.values()]
            return [
                rec.task
                for rec in self._records.values()
                if rec.task.status == status
            ]

    def _prune_history_locked(self) -> None:
        """
        Prunes oldest finished tasks when count exceeds max_history.
        Active (non-terminal) tasks are never evicted.
        """
        terminal_keys = [
            task_id
            for task_id, rec in self._records.items()
            if rec.task.is_terminal and not rec.is_running
        ]
        if len(terminal_keys) > self.max_history:
            terminal_keys.sort(key=lambda k: self._records[k].updated_at)
            excess = len(terminal_keys) - self.max_history
            for k in terminal_keys[:excess]:
                del self._records[k]


_GLOBAL_TASK_MANAGER: Optional[AgentTaskManager] = None
_GLOBAL_TM_LOCK = threading.RLock()


def get_task_manager() -> AgentTaskManager:
    """Retrieve or initialize the global AgentTaskManager singleton."""
    global _GLOBAL_TASK_MANAGER
    if _GLOBAL_TASK_MANAGER is None:
        with _GLOBAL_TM_LOCK:
            if _GLOBAL_TASK_MANAGER is None:
                _GLOBAL_TASK_MANAGER = AgentTaskManager()
    return _GLOBAL_TASK_MANAGER


def set_task_manager(manager: Optional[AgentTaskManager]) -> None:
    """Override or reset the global AgentTaskManager singleton."""
    global _GLOBAL_TASK_MANAGER
    with _GLOBAL_TM_LOCK:
        _GLOBAL_TASK_MANAGER = manager
