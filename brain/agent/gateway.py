"""
Unified Agent Execution Gateway for Fluffy Assistant

Serves as the canonical programmatic entry point for agent orchestration,
validating domain inputs and delegating lifecycle and execution management
to the persistent AgentTaskManager.
"""

from typing import Optional, Dict, Any, List, Union
import uuid

from brain.agent.interface import AgentResult
from brain.agent.manager import (
    AgentTaskManager,
    TaskRecord,
    TaskManagerError,
    TaskNotFoundError,
    TaskLifecycleError,
    get_task_manager,
)
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.state import AgentState
from brain.agent.step import PlanStep
from brain.agent.task import AgentTask, TaskStatus


class GatewayError(Exception):
    """Base exception for AgentExecutionGateway operations."""
    pass


class GatewayIdentityError(GatewayError):
    """Raised when there is an identity mismatch between AgentTask and AgentPlan."""

    def __init__(self, task_id: str, plan_task_id: str):
        super().__init__(
            f"Identity mismatch: AgentTask has task_id='{task_id}', "
            f"but AgentPlan has task_id='{plan_task_id}'."
        )
        self.task_id = task_id
        self.plan_task_id = plan_task_id


class GatewayValidationError(GatewayError):
    """Raised when an execution request or plan fails validation."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


class AgentExecutionGateway:
    """
    Canonical programmatic entry point for agent execution.

    Architecture:
    Caller -> AgentExecutionGateway -> AgentTaskManager -> AgentOrchestrator -> StepExecutor

    Responsibilities:
    - Input & identity validation (guarantees AgentTask.task_id == AgentPlan.task_id).
    - Plan validation enforcement via PlanValidator.
    - Clean lifecycle delegation (create, start, resume, cancel) to AgentTaskManager.
    - Transparent read-only accessors (get_task, get_state, get_plan, get_result, get_record).

    Guarantees:
    - Side-effect free validation before task registration.
    - No duplicate task registries (all state resides in AgentTaskManager).
    - No direct execution of tools or models (orchestration is retained by AgentOrchestrator).
    """

    def __init__(self, task_manager: Optional[AgentTaskManager] = None):
        self.task_manager = task_manager or get_task_manager()

    def create(
        self,
        task: Union[AgentTask, str],
        plan: Optional[AgentPlan] = None,
        goal: Optional[str] = None,
        task_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentTask:
        """
        Register a task and its optional plan with canonical identity verification.

        Args:
            task: Either an existing AgentTask instance or a string user_request.
            plan: Optional pre-compiled AgentPlan DAG.
            goal: Optional goal override (when task is str).
            task_id: Optional task_id (when task is str).
            context: Optional context dict (when task is str).
            metadata: Optional metadata dict (when task is str).

        Returns:
            Registered AgentTask.

        Raises:
            GatewayIdentityError: If task.task_id does not match plan.task_id.
            GatewayValidationError: If task or plan fails validation.
        """
        # 1. Resolve AgentTask
        if isinstance(task, str):
            if not task.strip():
                raise GatewayValidationError("User request cannot be empty.")
            agent_task = AgentTask(
                user_request=task,
                goal=goal,
                task_id=task_id or f"task_{uuid.uuid4().hex[:10]}",
                context=context or {},
                metadata=metadata or {},
            )
        elif isinstance(task, AgentTask):
            agent_task = task
        else:
            raise GatewayValidationError(
                f"Expected AgentTask or str user_request, got {type(task).__name__}."
            )

        # 2. Validate Identity & Plan if provided
        if plan is not None:
            if not isinstance(plan, AgentPlan):
                raise GatewayValidationError(
                    f"Expected AgentPlan instance, got {type(plan).__name__}."
                )

            # Strict canonical task identity check
            if plan.task_id != agent_task.task_id:
                raise GatewayIdentityError(
                    task_id=agent_task.task_id,
                    plan_task_id=plan.task_id,
                )

            # Authoritative DAG validation
            is_valid, err = PlanValidator.validate(plan)
            if not is_valid:
                raise GatewayValidationError(
                    f"AgentPlan failed validation: {err}",
                    details={"task_id": agent_task.task_id, "error": err},
                )

        # 3. Register with persistent TaskManager
        return self.task_manager.register_task(task=agent_task, plan=plan)

    def start(self, task_id: str) -> AgentResult:
        """
        Start execution of a registered task via AgentTaskManager.
        """
        return self.task_manager.start_task(task_id)

    def resume(
        self,
        task_id: str,
        confirmed: bool,
        confirmation_id: Optional[str] = None,
    ) -> AgentResult:
        """
        Resume a task in WAITING_CONFIRMATION state via AgentTaskManager.
        """
        return self.task_manager.resume_task(
            task_id=task_id,
            confirmed=confirmed,
            confirmation_id=confirmation_id,
        )

    def cancel(self, task_id: str) -> bool:
        """
        Cancel an active or waiting task via AgentTaskManager.
        """
        return self.task_manager.cancel_task(task_id)

    def get_task(self, task_id: str) -> Optional[AgentTask]:
        """Retrieve task by ID from AgentTaskManager."""
        return self.task_manager.get_task(task_id)

    def get_orchestrator(self, task_id: str) -> Optional[AgentOrchestrator]:
        """Retrieve orchestrator by task ID from AgentTaskManager."""
        return self.task_manager.get_orchestrator(task_id)

    def get_state(self, task_id: str) -> Optional[AgentState]:
        """Retrieve execution state by task ID from AgentTaskManager."""
        return self.task_manager.get_state(task_id)

    def get_plan(self, task_id: str) -> Optional[AgentPlan]:
        """Retrieve plan by task ID from AgentTaskManager."""
        return self.task_manager.get_plan(task_id)

    def get_result(self, task_id: str) -> Optional[AgentResult]:
        """Retrieve execution result by task ID from AgentTaskManager."""
        return self.task_manager.get_result(task_id)

    def get_record(self, task_id: str) -> Optional[TaskRecord]:
        """Retrieve full TaskRecord by task ID from AgentTaskManager."""
        return self.task_manager.get_record(task_id)

    def list_active_tasks(self) -> List[AgentTask]:
        """List all active (non-terminal) tasks from AgentTaskManager."""
        return self.task_manager.list_active_tasks()

    def list_tasks(self, status: Optional[TaskStatus] = None) -> List[AgentTask]:
        """List registered tasks from AgentTaskManager."""
        return self.task_manager.list_tasks(status=status)

    def get_events(self, task_id: str) -> List[Any]:
        """Retrieve canonical execution event history for a task."""
        orch = self.get_orchestrator(task_id)
        if orch and hasattr(orch, "events") and orch.events:
            return orch.events.get_history(task_id)
        return []

    def get_event_emitter(self, task_id: Optional[str] = None) -> Optional[Any]:
        """Retrieve the event emitter for a specific task orchestrator."""
        if task_id:
            orch = self.get_orchestrator(task_id)
            if orch and hasattr(orch, "events"):
                return orch.events
        return None


_GLOBAL_AGENT_GATEWAY: Optional[AgentExecutionGateway] = None


def get_agent_gateway() -> AgentExecutionGateway:
    """Retrieve or initialize the global AgentExecutionGateway singleton."""
    global _GLOBAL_AGENT_GATEWAY
    if _GLOBAL_AGENT_GATEWAY is None:
        _GLOBAL_AGENT_GATEWAY = AgentExecutionGateway()
    return _GLOBAL_AGENT_GATEWAY


def set_agent_gateway(gateway: Optional[AgentExecutionGateway]) -> None:
    """Override or reset the global AgentExecutionGateway singleton."""
    global _GLOBAL_AGENT_GATEWAY
    _GLOBAL_AGENT_GATEWAY = gateway
