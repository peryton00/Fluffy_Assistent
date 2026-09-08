"""
Unified Tool Security Policy Engine
Integrates ActionValidator, Guardian, risk metadata, and strict offline constraints into a single security boundary.
"""

from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass
import platform
import os

from brain.tools.definitions import ToolDefinition, ToolRiskLevel
from brain.tools.requests import ToolRequest


class ToolPolicyDecision(Enum):
    """Authorization verdict for a tool execution request."""
    ALLOW = "allow"
    NEEDS_CONFIRMATION = "needs_confirmation"
    DENY = "deny"


@dataclass
class PolicyEvaluationResult:
    """Outcome of security policy evaluation."""
    decision: ToolPolicyDecision
    reason: str
    message: str = ""
    details: Optional[Dict[str, Any]] = None

    @property
    def is_allowed(self) -> bool:
        return self.decision == ToolPolicyDecision.ALLOW

    @property
    def requires_confirmation(self) -> bool:
        return self.decision == ToolPolicyDecision.NEEDS_CONFIRMATION

    @property
    def is_denied(self) -> bool:
        return self.decision == ToolPolicyDecision.DENY


class ToolSecurityPolicy:
    """
    Evaluates tool requests against declared safety constraints, offline sovereignty rules,
    ActionValidator security rules, and Guardian baseline checks.
    """

    def __init__(
        self,
        action_validator: Optional[Any] = None,
        strict_offline: bool = False,
    ):
        self._action_validator = action_validator
        self._strict_offline = strict_offline
        self._current_platform = self._detect_platform()

    @property
    def action_validator(self) -> Any:
        if self._action_validator is None:
            from brain.security.action_validator import ActionValidator
            self._action_validator = ActionValidator()
        return self._action_validator

    @property
    def strict_offline(self) -> bool:
        return self._strict_offline

    @strict_offline.setter
    def strict_offline(self, value: bool) -> None:
        self._strict_offline = value

    def evaluate(
        self,
        tool: ToolDefinition,
        request: ToolRequest,
    ) -> PolicyEvaluationResult:
        """
        Evaluate a tool request against all security layers.
        """
        # 1. Platform compatibility check
        if not tool.is_platform_supported(self._current_platform):
            return PolicyEvaluationResult(
                decision=ToolPolicyDecision.DENY,
                reason="platform_unsupported",
                message=f"Tool '{tool.tool_id}' is not supported on platform '{self._current_platform}' (supported: {tool.platforms}).",
            )

        # 2. Strict Offline Sovereignty Check
        if self._strict_offline and not tool.offline_capable:
            return PolicyEvaluationResult(
                decision=ToolPolicyDecision.DENY,
                reason="offline_violation",
                message=f"Tool '{tool.tool_id}' requires network access but Fluffy is operating in strict offline mode.",
            )

        # 3. Explicit BLOCKED Risk Level Check
        if tool.risk_level == ToolRiskLevel.BLOCKED:
            return PolicyEvaluationResult(
                decision=ToolPolicyDecision.DENY,
                reason="blocked_by_policy",
                message=f"Tool '{tool.tool_id}' is classified as BLOCKED and cannot be executed.",
            )

        # 4. ActionValidator Level 1 Rule Validation
        from brain.security.action_validator import SafetyLevel
        action_res = self._check_action_validator(tool, request)
        if action_res.safety_level == SafetyLevel.BLOCKED:
            return PolicyEvaluationResult(
                decision=ToolPolicyDecision.DENY,
                reason="action_validator_blocked",
                message=f"Security policy blocked action: {action_res.message}",
            )
        elif action_res.safety_level == SafetyLevel.NEEDS_CONFIRMATION:
            return PolicyEvaluationResult(
                decision=ToolPolicyDecision.NEEDS_CONFIRMATION,
                reason="action_validator_confirmation",
                message=action_res.message or f"Action requires user confirmation: {tool.name}",
            )

        # 5. Declarative Confirmation Requirement Check
        if tool.requires_confirmation or tool.risk_level == ToolRiskLevel.CONFIRMATION_REQUIRED:
            return PolicyEvaluationResult(
                decision=ToolPolicyDecision.NEEDS_CONFIRMATION,
                reason="tool_requires_confirmation",
                message=f"Action requires user confirmation: {tool.name}",
            )

        # 6. All checks passed
        return PolicyEvaluationResult(
            decision=ToolPolicyDecision.ALLOW,
            reason="policy_passed",
            message="Action authorized by security policy.",
        )

    def _check_action_validator(self, tool: ToolDefinition, request: ToolRequest) -> Any:
        """Bridge tool request to ActionValidator Command abstraction."""
        from brain.agent.command_parser import Command
        # Normalize tool_id intent
        clean_intent = tool.tool_id.split(".")[-1].replace("rust:", "").replace("tool:", "").lower()
        cmd = Command(
            intent=clean_intent,
            parameters=request.parameters,
            raw_text=request.metadata.get("objective", tool.description),
        )
        return self.action_validator.validate(cmd)

    def _detect_platform(self) -> str:
        """Detect operating system identifier."""
        sys_plat = platform.system().lower()
        if "win" in sys_plat:
            return "windows"
        elif "darwin" in sys_plat:
            return "darwin"
        return "linux"


# Global singleton instance
_global_policy: Optional[ToolSecurityPolicy] = None


def get_security_policy() -> ToolSecurityPolicy:
    """Get the global ToolSecurityPolicy singleton."""
    global _global_policy
    if _global_policy is None:
        _global_policy = ToolSecurityPolicy()
    return _global_policy
