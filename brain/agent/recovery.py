"""
Agent Failure Classification & Bounded Recovery Strategies
Coordinates error classification and safe recovery transitions without bypassing security.
"""

from enum import Enum
from typing import Dict, Any, Optional

from brain.agent.limits import AgentLimits
from brain.agent.step import PlanStep


class FailureType(str, Enum):
    """Classification of step and task execution failures."""
    TRANSIENT = "transient"
    RETRYABLE = "retryable"
    INVALID_INPUT = "invalid_input"
    SECURITY_DENIED = "security_denied"
    TOOL_UNAVAILABLE = "tool_unavailable"
    MODEL_UNAVAILABLE = "model_unavailable"
    TIMEOUT = "timeout"
    RESOURCE_LIMIT = "resource_limit"
    DEPENDENCY_FAILED = "dependency_failed"
    FATAL = "fatal"


class RecoveryAction(str, Enum):
    """Prescribed recovery strategy."""
    RETRY = "retry"
    FALLBACK_MODEL = "fallback_model"
    FALLBACK_TOOL = "fallback_tool"
    REPLAN = "replan"
    ABORT = "abort"


class FailureClassifier:
    """
    Deterministically classifies errors into standard FailureType categories.
    """

    @classmethod
    def classify(cls, error_msg: Optional[str], metadata: Optional[Dict[str, Any]] = None) -> FailureType:
        if not error_msg:
            return FailureType.FATAL

        err_lower = error_msg.lower()
        meta = metadata or {}

        # 1. Security denials are strictly terminal
        if meta.get("security_blocked") or "security policy" in err_lower or "blocked" in err_lower:
            return FailureType.SECURITY_DENIED

        # 2. Timeouts
        if "timed out" in err_lower or "timeout" in err_lower:
            return FailureType.TIMEOUT

        # 3. Model/Backend unavailability
        if "no compatible" in err_lower or "model not found" in err_lower or "no active and available" in err_lower:
            return FailureType.MODEL_UNAVAILABLE

        # 4. Tool/Core connectivity unavailability
        if "could not connect" in err_lower or "core_unreachable" in err_lower or "tool not found" in err_lower:
            return FailureType.TOOL_UNAVAILABLE

        # 5. Resource limits / memory
        if "out of memory" in err_lower or "oom" in err_lower or "resource limit" in err_lower:
            return FailureType.RESOURCE_LIMIT

        # 6. Invalid input
        if "invalid" in err_lower or "malformed" in err_lower or "validation error" in err_lower:
            return FailureType.INVALID_INPUT

        # 7. Transient socket / network errors
        if "connection reset" in err_lower or "broken pipe" in err_lower or "temporary" in err_lower:
            return FailureType.TRANSIENT

        return FailureType.RETRYABLE


class RecoveryManager:
    """
    Evaluates failure classifications against resource bounds to decide recovery action.
    """

    @classmethod
    def determine_action(
        cls,
        failure_type: FailureType,
        step: PlanStep,
        total_retries: int,
        limits: AgentLimits,
    ) -> RecoveryAction:
        """
        Determine bounded recovery action.
        Follows strictly: retry -> compatible fallback -> re-plan -> fail/abort.
        """
        # Security denials can NEVER be retried or bypassed
        if failure_type == FailureType.SECURITY_DENIED:
            return RecoveryAction.ABORT

        if failure_type == FailureType.FATAL:
            return RecoveryAction.ABORT

        # Check total and per-step retry budgets
        can_retry = (
            step.attempt_count < limits.max_retries_per_step and
            total_retries < limits.max_total_retries
        )

        if failure_type in (FailureType.TRANSIENT, FailureType.RETRYABLE, FailureType.TIMEOUT):
            if can_retry:
                return RecoveryAction.RETRY
            return RecoveryAction.REPLAN

        if failure_type == FailureType.MODEL_UNAVAILABLE:
            return RecoveryAction.FALLBACK_MODEL

        if failure_type == FailureType.TOOL_UNAVAILABLE:
            return RecoveryAction.FALLBACK_TOOL

        if failure_type == FailureType.RESOURCE_LIMIT:
            return RecoveryAction.REPLAN

        return RecoveryAction.ABORT
