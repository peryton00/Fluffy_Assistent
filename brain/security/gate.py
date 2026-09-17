"""
Canonical Execution Security Gate for Fluffy Assistant

Consolidates security policy evaluation around the agent execution boundary,
coordinating ToolSecurityPolicy, ActionValidator, and sovereignty constraints
into a deterministic ALLOW / DENY / CONFIRM decision.
"""

from enum import Enum
from typing import Dict, Any, Optional, TYPE_CHECKING
from dataclasses import dataclass, field

if TYPE_CHECKING:
    from brain.tools.definitions import ToolDefinition
    from brain.tools.requests import ToolRequest
    from brain.tools.policies.policy import ToolSecurityPolicy


class SecurityDecisionType(str, Enum):
    """Canonical security verdict for an action or tool execution request."""
    ALLOW = "allow"
    DENY = "deny"
    CONFIRM = "confirm"


@dataclass(frozen=True)
class SecurityDecision:
    """
    Structured outcome of security gate evaluation.
    """
    decision: SecurityDecisionType
    reason: str
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_allowed(self) -> bool:
        return self.decision == SecurityDecisionType.ALLOW

    @property
    def is_denied(self) -> bool:
        return self.decision == SecurityDecisionType.DENY

    @property
    def requires_confirmation(self) -> bool:
        return self.decision == SecurityDecisionType.CONFIRM

    def to_dict(self) -> Dict[str, Any]:
        """Serialize security decision to dictionary."""
        return {
            "decision": self.decision.value,
            "reason": self.reason,
            "message": self.message,
            "details": self.details,
        }


class ExecutionSecurityGate:
    """
    Canonical security decision boundary for agent tool execution.

    Coordinates existing security layers (ToolSecurityPolicy, ActionValidator,
    risk profiles, and sovereignty constraints) without duplicating rules.
    """

    def __init__(
        self,
        security_policy: Optional["ToolSecurityPolicy"] = None,
        action_validator: Optional[Any] = None,
    ):
        if security_policy is not None:
            self._policy = security_policy
        else:
            from brain.tools.policies.policy import get_security_policy
            self._policy = get_security_policy()
        if action_validator is not None:
            self._policy._action_validator = action_validator

    @property
    def security_policy(self) -> "ToolSecurityPolicy":
        return self._policy

    def evaluate(
        self,
        tool: "ToolDefinition",
        request: "ToolRequest",
    ) -> SecurityDecision:
        """
        Evaluate a tool execution request against the canonical security policy.
        Returns a deterministic SecurityDecision: ALLOW, DENY, or CONFIRM.
        """
        eval_res = self._policy.evaluate(tool=tool, request=request)

        if eval_res.is_denied:
            return SecurityDecision(
                decision=SecurityDecisionType.DENY,
                reason=eval_res.reason,
                message=eval_res.message,
                details=eval_res.details or {"tool_id": tool.tool_id, "policy_reason": eval_res.reason},
            )
        elif eval_res.requires_confirmation:
            return SecurityDecision(
                decision=SecurityDecisionType.CONFIRM,
                reason=eval_res.reason,
                message=eval_res.message or f"Action requires user confirmation: {tool.name}",
                details=eval_res.details or {"tool_id": tool.tool_id, "requires_confirmation": True},
            )
        else:
            return SecurityDecision(
                decision=SecurityDecisionType.ALLOW,
                reason=eval_res.reason or "policy_passed",
                message=eval_res.message or "Action authorized by security policy.",
                details=eval_res.details or {"tool_id": tool.tool_id},
            )


_GLOBAL_SECURITY_GATE: Optional[ExecutionSecurityGate] = None


def get_security_gate() -> ExecutionSecurityGate:
    """Retrieve or initialize the global ExecutionSecurityGate singleton."""
    global _GLOBAL_SECURITY_GATE
    if _GLOBAL_SECURITY_GATE is None:
        _GLOBAL_SECURITY_GATE = ExecutionSecurityGate()
    return _GLOBAL_SECURITY_GATE


def set_security_gate(gate: Optional[ExecutionSecurityGate]) -> None:
    """Override or reset the global ExecutionSecurityGate singleton."""
    global _GLOBAL_SECURITY_GATE
    _GLOBAL_SECURITY_GATE = gate
