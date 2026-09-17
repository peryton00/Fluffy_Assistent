"""
Canonical Execution Contracts for Fluffy Assistant

Defines the typed boundary contracts between user requests, context,
planners, task managers, orchestrators, executors, tools/models, and UI results.
"""

from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Any, Dict, List, Optional, Union
import uuid


class ExecutionStatus(str, Enum):
    """
    Canonical lifecycle status for execution requests and tasks.

    Relationships to existing internal lifecycle enums:
    - Maps to and subsumes the states of AgentTask (TaskStatus) and PlanStep (StepStatus).
    - CREATED: Request or task initialized.
    - QUEUED: Enqueued in task manager, awaiting scheduling.
    - RUNNING: Actively being executed by orchestrator/executor (corresponds to EXECUTING).
    - WAITING_CONFIRMATION: Suspended awaiting explicit operator confirmation.
    - PAUSED: Execution paused by user or system.
    - COMPLETED: Execution finished successfully.
    - FAILED: Execution terminated with an error.
    - CANCELLED: Execution terminated by user or upstream cancellation.
    """
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_CONFIRMATION = "waiting_confirmation"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExecutionType(str, Enum):
    """
    Semantic category of capability being executed by a step or request.

    Replaces overloaded string checks (e.g. `startswith("model:")`)
    with typed classification.
    """
    TOOL = "tool"
    MODEL = "model"
    KNOWLEDGE = "knowledge"
    ARTIFACT = "artifact"
    DATA = "data"


class ExecutionErrorCategory(str, Enum):
    """
    Standardized classification of execution-level errors.
    """
    VALIDATION = "validation"
    SECURITY = "security"
    CONFIRMATION_REQUIRED = "confirmation_required"
    TOOL = "tool"
    MODEL = "model"
    KNOWLEDGE = "knowledge"
    ARTIFACT = "artifact"
    CANCELLATION = "cancellation"
    TIMEOUT = "timeout"
    INTERNAL = "internal"


@dataclass
class ExecutionError:
    """
    Typed error representation carrying structured diagnostic and recovery context.
    """
    category: ExecutionErrorCategory
    message: str
    code: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    retryable: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize error to dictionary."""
        return {
            "category": self.category.value,
            "message": self.message,
            "code": self.code,
            "details": self.details,
            "retryable": self.retryable,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionError":
        """Reconstruct ExecutionError from dictionary."""
        raw_cat = data.get("category", ExecutionErrorCategory.INTERNAL.value)
        category = (
            ExecutionErrorCategory(raw_cat)
            if raw_cat in ExecutionErrorCategory._value2member_map_
            else ExecutionErrorCategory.INTERNAL
        )
        return cls(
            category=category,
            message=data.get("message", ""),
            code=data.get("code"),
            details=data.get("details", {}) if isinstance(data.get("details"), dict) else {},
            retryable=bool(data.get("retryable", False)),
        )


@dataclass
class ExecutionRequest:
    """
    Canonical request entering the execution architecture.
    """
    user_request: str
    request_id: str = field(default_factory=lambda: f"req_{uuid.uuid4().hex[:10]}")
    session_id: Optional[str] = None
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    source: str = "user"
    execution_type: Optional[ExecutionType] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize request to dictionary."""
        return {
            "request_id": self.request_id,
            "user_request": self.user_request,
            "session_id": self.session_id,
            "correlation_id": self.correlation_id,
            "source": self.source,
            "execution_type": self.execution_type.value if self.execution_type else None,
            "parameters": self.parameters,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionRequest":
        """Reconstruct ExecutionRequest from dictionary."""
        raw_type = data.get("execution_type")
        exec_type = (
            ExecutionType(raw_type)
            if raw_type in ExecutionType._value2member_map_
            else None
        )
        return cls(
            user_request=data.get("user_request", ""),
            request_id=data.get("request_id", f"req_{uuid.uuid4().hex[:10]}"),
            session_id=data.get("session_id"),
            correlation_id=data.get("correlation_id", str(uuid.uuid4())),
            source=data.get("source", "user"),
            execution_type=exec_type,
            parameters=data.get("parameters", {}) if isinstance(data.get("parameters"), dict) else {},
            metadata=data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {},
            created_at=data.get("created_at", time.time()),
        )

    @classmethod
    def from_agent_task(cls, task: Any) -> "ExecutionRequest":
        """Interoperability helper: build ExecutionRequest from an existing AgentTask."""
        return cls(
            user_request=getattr(task, "user_request", ""),
            request_id=getattr(task, "task_id", f"req_{uuid.uuid4().hex[:10]}"),
            session_id=getattr(task, "context", {}).get("session_id"),
            correlation_id=getattr(task, "correlation_id", str(uuid.uuid4())),
            source=getattr(task, "metadata", {}).get("source", "agent_task"),
            execution_type=None,
            parameters=getattr(task, "context", {}).get("parameters", {}),
            metadata=getattr(task, "metadata", {}),
            created_at=getattr(task, "created_at", time.time()),
        )


@dataclass
class ExecutionContext:
    """
    Carries resolved execution-scoped context through the execution pipeline.

    Distinct from ContextManager: ContextManager aggregates memory/history into raw
    dicts, whereas ExecutionContext is the immutable/traceable runtime carrier.
    """
    request_id: str = ""
    session_id: Optional[str] = None
    correlation_id: str = ""
    user_id: Optional[str] = None
    environment: Dict[str, Any] = field(default_factory=dict)
    execution_metadata: Dict[str, Any] = field(default_factory=dict)
    is_cancelled: bool = False
    timeout_sec: Optional[float] = None
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize context to dictionary."""
        return {
            "request_id": self.request_id,
            "session_id": self.session_id,
            "correlation_id": self.correlation_id,
            "user_id": self.user_id,
            "environment": self.environment,
            "execution_metadata": self.execution_metadata,
            "is_cancelled": self.is_cancelled,
            "timeout_sec": self.timeout_sec,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionContext":
        """Reconstruct ExecutionContext from dictionary."""
        return cls(
            request_id=data.get("request_id", ""),
            session_id=data.get("session_id"),
            correlation_id=data.get("correlation_id", ""),
            user_id=data.get("user_id"),
            environment=data.get("environment", {}) if isinstance(data.get("environment"), dict) else {},
            execution_metadata=data.get("execution_metadata", {}) if isinstance(data.get("execution_metadata"), dict) else {},
            is_cancelled=bool(data.get("is_cancelled", False)),
            timeout_sec=data.get("timeout_sec"),
            created_at=data.get("created_at", time.time()),
        )


@dataclass
class ExecutionResult:
    """
    Canonical result returned from any level of the execution architecture.
    """
    request_id: str = ""
    task_id: Optional[str] = None
    status: ExecutionStatus = ExecutionStatus.COMPLETED
    success: bool = True
    output: Optional[Any] = None
    message: Optional[str] = None
    error: Optional[ExecutionError] = None
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    observations: Dict[str, Any] = field(default_factory=dict)
    duration_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    completed_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize result to dictionary."""
        obs_dict: Dict[str, Any] = {}
        for k, v in self.observations.items():
            if hasattr(v, "to_dict") and callable(v.to_dict):
                obs_dict[k] = v.to_dict()
            else:
                obs_dict[k] = v

        return {
            "request_id": self.request_id,
            "task_id": self.task_id,
            "status": self.status.value,
            "success": self.success,
            "output": self.output,
            "message": self.message,
            "error": self.error.to_dict() if self.error else None,
            "artifacts": self.artifacts,
            "observations": obs_dict,
            "duration_ms": round(self.duration_ms, 2),
            "metadata": self.metadata,
            "completed_at": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ExecutionResult":
        """Reconstruct ExecutionResult from dictionary."""
        raw_status = data.get("status", ExecutionStatus.COMPLETED.value)
        status = (
            ExecutionStatus(raw_status)
            if raw_status in ExecutionStatus._value2member_map_
            else ExecutionStatus.COMPLETED
        )

        error_obj: Optional[ExecutionError] = None
        if data.get("error") and isinstance(data["error"], dict):
            error_obj = ExecutionError.from_dict(data["error"])

        return cls(
            request_id=data.get("request_id", ""),
            task_id=data.get("task_id"),
            status=status,
            success=bool(data.get("success", True)),
            output=data.get("output"),
            message=data.get("message"),
            error=error_obj,
            artifacts=data.get("artifacts", []) if isinstance(data.get("artifacts"), list) else [],
            observations=data.get("observations", {}) if isinstance(data.get("observations"), dict) else {},
            duration_ms=float(data.get("duration_ms", 0.0)),
            metadata=data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {},
            completed_at=data.get("completed_at", time.time()),
        )

    @classmethod
    def ok(
        cls,
        output: Any = None,
        message: Optional[str] = None,
        request_id: str = "",
        task_id: Optional[str] = None,
        artifacts: Optional[List[Dict[str, Any]]] = None,
        observations: Optional[Dict[str, Any]] = None,
        duration_ms: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "ExecutionResult":
        """Construct a successful ExecutionResult."""
        return cls(
            request_id=request_id,
            task_id=task_id,
            status=ExecutionStatus.COMPLETED,
            success=True,
            output=output,
            message=message or "Execution completed successfully.",
            error=None,
            artifacts=artifacts or [],
            observations=observations or {},
            duration_ms=duration_ms,
            metadata=metadata or {},
        )

    @classmethod
    def fail(
        cls,
        error: Union[ExecutionError, str],
        category: ExecutionErrorCategory = ExecutionErrorCategory.INTERNAL,
        request_id: str = "",
        task_id: Optional[str] = None,
        duration_ms: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "ExecutionResult":
        """Construct a failed ExecutionResult."""
        if isinstance(error, str):
            err_obj = ExecutionError(category=category, message=error)
        else:
            err_obj = error

        return cls(
            request_id=request_id,
            task_id=task_id,
            status=ExecutionStatus.FAILED,
            success=False,
            output=None,
            message=err_obj.message,
            error=err_obj,
            duration_ms=duration_ms,
            metadata=metadata or {},
        )

    @classmethod
    def waiting_confirmation(
        cls,
        message: str,
        confirmation_id: str,
        request_id: str = "",
        task_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        duration_ms: float = 0.0,
    ) -> "ExecutionResult":
        """Construct a suspended ExecutionResult awaiting confirmation."""
        err_obj = ExecutionError(
            category=ExecutionErrorCategory.CONFIRMATION_REQUIRED,
            message=message,
            code="confirmation_required",
            details={"confirmation_id": confirmation_id, **(details or {})},
        )
        return cls(
            request_id=request_id,
            task_id=task_id,
            status=ExecutionStatus.WAITING_CONFIRMATION,
            success=False,
            output=None,
            message=message,
            error=err_obj,
            duration_ms=duration_ms,
            metadata={"confirmation_id": confirmation_id},
        )

    @classmethod
    def from_agent_result(cls, result: Any, request_id: Optional[str] = None) -> "ExecutionResult":
        """Interoperability helper: convert an AgentResult to an ExecutionResult."""
        status_map = {
            "created": ExecutionStatus.CREATED,
            "planning": ExecutionStatus.RUNNING,
            "analyzing": ExecutionStatus.RUNNING,
            "ready": ExecutionStatus.QUEUED,
            "executing": ExecutionStatus.RUNNING,
            "waiting_confirmation": ExecutionStatus.WAITING_CONFIRMATION,
            "waiting": ExecutionStatus.RUNNING,
            "paused": ExecutionStatus.PAUSED,
            "completed": ExecutionStatus.COMPLETED,
            "failed": ExecutionStatus.FAILED,
            "cancelled": ExecutionStatus.CANCELLED,
        }

        raw_stat = getattr(result, "status", None)
        stat_str = raw_stat.value if hasattr(raw_stat, "value") else str(raw_stat or "completed")
        exec_status = status_map.get(stat_str.lower(), ExecutionStatus.COMPLETED)

        err_obj: Optional[ExecutionError] = None
        if getattr(result, "error", None):
            category = (
                ExecutionErrorCategory.CONFIRMATION_REQUIRED
                if getattr(result, "waiting_confirmation", False)
                else ExecutionErrorCategory.INTERNAL
            )
            err_obj = ExecutionError(
                category=category,
                message=str(result.error),
                details={"confirmation_id": getattr(result, "confirmation_id", None)} if getattr(result, "waiting_confirmation", False) else {},
            )
        elif getattr(result, "waiting_confirmation", False):
            err_obj = ExecutionError(
                category=ExecutionErrorCategory.CONFIRMATION_REQUIRED,
                message=getattr(result, "confirmation_message", "Action requires user confirmation") or "Confirmation required",
                details={"confirmation_id": getattr(result, "confirmation_id", None)},
            )

        artifacts = []
        if getattr(result, "state", None) and hasattr(result.state, "artifacts"):
            artifacts = list(result.state.artifacts)

        return cls(
            request_id=request_id or getattr(result, "task_id", ""),
            task_id=getattr(result, "task_id", None),
            status=exec_status,
            success=bool(getattr(result, "success", True)),
            output=None,
            message=getattr(result, "summary", None),
            error=err_obj,
            artifacts=artifacts,
            observations=getattr(result, "observations", {}),
            duration_ms=float(getattr(result, "duration_ms", 0.0)),
            metadata={
                "waiting_confirmation": getattr(result, "waiting_confirmation", False),
                "confirmation_id": getattr(result, "confirmation_id", None),
            },
        )
