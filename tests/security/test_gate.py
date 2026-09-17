"""
Unit & Integration Tests for Canonical ExecutionSecurityGate in Fluffy Assistant
"""

import unittest
from unittest.mock import MagicMock, patch
from typing import Dict, Any

from brain.agent.execution import StepExecutor
from brain.agent.observation import StepObservation
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask
from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult
from brain.security.gate import (
    ExecutionSecurityGate,
    SecurityDecision,
    SecurityDecisionType,
    get_security_gate,
    set_security_gate,
)
from brain.tools.definitions import ToolDefinition, ToolKind, ToolRiskLevel, ToolSecurityMetadata
from brain.tools.policies.policy import ToolSecurityPolicy, ToolPolicyDecision
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.runtime import UnifiedToolRuntime


class MockActionValidator(ActionValidator):
    """Mock action validator testing custom security rules."""
    def validate(self, command):
        intent = str(command.intent).lower()
        if "blocked_intent" in intent or "delete_root" in intent:
            return ValidationResult(is_valid=False, safety_level=SafetyLevel.BLOCKED, message="Action blocked by ActionValidator.")
        if "delete" in intent or "kill" in intent:
            return ValidationResult(is_valid=True, safety_level=SafetyLevel.NEEDS_CONFIRMATION, message="Confirmation needed for dangerous action.")
        return ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="Safe to proceed.")


class TestExecutionSecurityGate(unittest.TestCase):
    """Test suite for ExecutionSecurityGate."""

    def setUp(self):
        self.validator = MockActionValidator()
        self.policy = ToolSecurityPolicy(action_validator=self.validator)
        self.gate = ExecutionSecurityGate(security_policy=self.policy)

    def tearDown(self):
        set_security_gate(None)

    # -------------------------------------------------------------------------
    # A. ALLOW Verdict
    # -------------------------------------------------------------------------

    def test_evaluate_allow(self):
        """Verify safe tool receives ALLOW decision."""
        tool = ToolDefinition(
            tool_id="system.get_info",
            name="Get Info",
            description="Safe system info query",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(risk_level=ToolRiskLevel.SAFE),
        )
        req = ToolRequest(tool_id="system.get_info", parameters={})

        decision = self.gate.evaluate(tool, req)

        self.assertEqual(decision.decision, SecurityDecisionType.ALLOW)
        self.assertTrue(decision.is_allowed)
        self.assertFalse(decision.is_denied)
        self.assertFalse(decision.requires_confirmation)
        self.assertEqual(decision.reason, "policy_passed")

    # -------------------------------------------------------------------------
    # B. DENY Verdict
    # -------------------------------------------------------------------------

    def test_evaluate_deny_via_risk_level(self):
        """Verify tool explicitly marked BLOCKED receives DENY."""
        tool = ToolDefinition(
            tool_id="danger.wipe_disk",
            name="Wipe Disk",
            description="Destructive action",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(risk_level=ToolRiskLevel.BLOCKED),
        )
        req = ToolRequest(tool_id="danger.wipe_disk", parameters={})

        decision = self.gate.evaluate(tool, req)

        self.assertEqual(decision.decision, SecurityDecisionType.DENY)
        self.assertTrue(decision.is_denied)
        self.assertEqual(decision.reason, "blocked_by_policy")
        self.assertIn("cannot be executed", decision.message)

    def test_evaluate_deny_via_action_validator(self):
        """Verify ActionValidator BLOCKED rule triggers DENY."""
        tool = ToolDefinition(
            tool_id="tool:blocked_intent",
            name="Blocked Tool",
            description="Dangerous action",
            kind=ToolKind.NATIVE,
        )
        req = ToolRequest(tool_id="tool:blocked_intent", parameters={})

        decision = self.gate.evaluate(tool, req)

        self.assertEqual(decision.decision, SecurityDecisionType.DENY)
        self.assertTrue(decision.is_denied)
        self.assertEqual(decision.reason, "action_validator_blocked")

    # -------------------------------------------------------------------------
    # C. CONFIRM Verdict
    # -------------------------------------------------------------------------

    def test_evaluate_confirm_via_action_validator(self):
        """Verify ActionValidator NEEDS_CONFIRMATION triggers CONFIRM decision."""
        tool = ToolDefinition(
            tool_id="tool:delete_file",
            name="Delete File",
            description="Delete action",
            kind=ToolKind.NATIVE,
        )
        req = ToolRequest(tool_id="tool:delete_file", parameters={"path": "temp.txt"})

        decision = self.gate.evaluate(tool, req)

        self.assertEqual(decision.decision, SecurityDecisionType.CONFIRM)
        self.assertTrue(decision.requires_confirmation)
        self.assertEqual(decision.reason, "action_validator_confirmation")

    def test_evaluate_confirm_via_declarative_tool_flag(self):
        """Verify tool with requires_confirmation=True triggers CONFIRM decision."""
        tool = ToolDefinition(
            tool_id="tool:modify_settings",
            name="Modify Settings",
            description="System config",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(requires_confirmation=True),
        )
        req = ToolRequest(tool_id="tool:modify_settings", parameters={})

        decision = self.gate.evaluate(tool, req)

        self.assertEqual(decision.decision, SecurityDecisionType.CONFIRM)
        self.assertTrue(decision.requires_confirmation)
        self.assertEqual(decision.reason, "tool_requires_confirmation")

    # -------------------------------------------------------------------------
    # D. Existing Policy Reuse & Layering
    # -------------------------------------------------------------------------

    def test_gate_delegates_to_underlying_policy(self):
        """Verify ExecutionSecurityGate delegates evaluation to ToolSecurityPolicy without duplicating rules."""
        mock_policy = MagicMock(spec=ToolSecurityPolicy)
        from brain.tools.policies.policy import PolicyEvaluationResult
        mock_policy.evaluate.return_value = PolicyEvaluationResult(
            decision=ToolPolicyDecision.ALLOW,
            reason="custom_mock_allow",
            message="Authorized by mock",
        )

        gate = ExecutionSecurityGate(security_policy=mock_policy)
        tool = ToolDefinition(tool_id="custom.tool", name="Custom", description="", kind=ToolKind.NATIVE)
        req = ToolRequest(tool_id="custom.tool")

        dec = gate.evaluate(tool, req)

        mock_policy.evaluate.assert_called_once_with(tool=tool, request=req)
        self.assertEqual(dec.decision, SecurityDecisionType.ALLOW)
        self.assertEqual(dec.reason, "custom_mock_allow")

    # -------------------------------------------------------------------------
    # E. Offline Violations
    # -------------------------------------------------------------------------

    def test_strict_offline_violation_denial(self):
        """Verify network-dependent tool is DENIED under strict offline mode."""
        self.policy.strict_offline = True

        tool = ToolDefinition(
            tool_id="network.fetch_api",
            name="Fetch API",
            description="Network call",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(offline_capable=False),
        )
        req = ToolRequest(tool_id="network.fetch_api")

        decision = self.gate.evaluate(tool, req)

        self.assertEqual(decision.decision, SecurityDecisionType.DENY)
        self.assertEqual(decision.reason, "offline_violation")
        self.assertIn("strict offline mode", decision.message)

    # -------------------------------------------------------------------------
    # F. Determinism
    # -------------------------------------------------------------------------

    def test_decision_determinism(self):
        """Verify identical inputs under identical policy state produce identical decisions."""
        tool = ToolDefinition(
            tool_id="tool:delete_something",
            name="Delete",
            description="Delete",
            kind=ToolKind.NATIVE,
        )
        req = ToolRequest(tool_id="tool:delete_something", parameters={"file": "a.txt"})

        dec1 = self.gate.evaluate(tool, req)
        dec2 = self.gate.evaluate(tool, req)

        self.assertEqual(dec1.decision, dec2.decision)
        self.assertEqual(dec1.reason, dec2.reason)
        self.assertEqual(dec1.message, dec2.message)
        self.assertEqual(dec1.to_dict(), dec2.to_dict())

    # -------------------------------------------------------------------------
    # G. Integration with UnifiedToolRuntime & Adapter Protection
    # -------------------------------------------------------------------------

    def test_runtime_denies_adapter_execution_on_gate_deny(self):
        """Verify UnifiedToolRuntime halts execution and protects adapter when gate DENIES."""
        mock_adapter = MagicMock()
        mock_adapter.execute.return_value = ToolResult.ok(request_id="r1", tool_id="tool:blocked_intent", output={"status": "should_not_run"})

        tool = ToolDefinition(
            tool_id="tool:blocked_intent",
            name="Blocked",
            description="Blocked tool",
            kind=ToolKind.NATIVE,
        )

        from brain.tools.registry import ToolRegistry
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(
            registry=registry,
            security_gate=self.gate,
        )

        req = ToolRequest(tool_id="tool:blocked_intent")
        res = runtime.execute(req)

        self.assertFalse(res.success)
        self.assertEqual(res.error_type, ToolErrorType.SECURITY_DENIED)
        self.assertIn("Security policy blocked", res.error)
        self.assertEqual(res.metadata["security_decision"]["decision"], "deny")

        # Adapter MUST NOT have been called
        mock_adapter.execute.assert_not_called()

    def test_runtime_requires_confirmation_without_adapter_execution(self):
        """Verify UnifiedToolRuntime returns CONFIRMATION_REQUIRED and avoids adapter before approval."""
        mock_adapter = MagicMock()
        mock_adapter.execute.return_value = ToolResult.ok(request_id="r2", tool_id="mock.delete_file", output={"deleted": True})

        tool = ToolDefinition(
            tool_id="mock.delete_file",
            name="Delete File",
            description="Delete action",
            kind=ToolKind.NATIVE,
        )

        from brain.tools.registry import ToolRegistry
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(
            registry=registry,
            security_gate=self.gate,
        )

        req = ToolRequest(tool_id="mock.delete_file", parameters={"path": "old.txt"})
        res = runtime.execute(req, confirmed=False)

        self.assertFalse(res.success)
        self.assertEqual(res.error_type, ToolErrorType.CONFIRMATION_REQUIRED)
        self.assertIsNotNone(res.metadata.get("confirmation_id"))
        self.assertEqual(res.metadata["security_decision"]["decision"], "confirm")

        # Adapter MUST NOT have been called before confirmation
        mock_adapter.execute.assert_not_called()

        # Execute with confirmed=True -> Adapter MUST run
        res_confirmed = runtime.execute(req, confirmed=True)
        self.assertTrue(res_confirmed.success)
        mock_adapter.execute.assert_called_once()

    # -------------------------------------------------------------------------
    # H. StepExecutor End-to-End Security Gate Integration
    # -------------------------------------------------------------------------

    def test_step_executor_integrates_central_gate(self):
        """Verify StepExecutor tool steps are evaluated by central security gate."""
        mock_adapter = MagicMock()
        mock_adapter.execute.return_value = ToolResult.ok(request_id="r3", tool_id="tool:delete_action", output={"deleted": True})

        tool = ToolDefinition(
            tool_id="tool:delete_action",
            name="Delete Action",
            description="Delete action",
            kind=ToolKind.NATIVE,
        )

        from brain.tools.registry import ToolRegistry
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry, security_gate=self.gate)
        executor = StepExecutor(tool_runtime=runtime)

        task = AgentTask(user_request="Delete data", task_id="task_sec_01")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="step_1",
            objective="Delete sensitive record",
            tool_requirement="tool:delete_action",
            input_parameters={"id": 99},
        )

        # 1. Unconfirmed attempt -> suspended in WAITING_CONFIRMATION
        obs1 = executor.execute_step(step, state, confirmed=False)
        self.assertFalse(obs1.success)
        self.assertTrue(obs1.metadata.get("waiting_confirmation"))
        self.assertEqual(step.status, StepStatus.WAITING_CONFIRMATION)
        mock_adapter.execute.assert_not_called()

        # 2. Confirmed resume -> completes successfully
        obs2 = executor.execute_step(step, state, confirmed=True)
        self.assertTrue(obs2.success)
        self.assertEqual(step.status, StepStatus.COMPLETED)
        mock_adapter.execute.assert_called_once()

    # -------------------------------------------------------------------------
    # I. Singleton Behavior
    # -------------------------------------------------------------------------

    def test_singleton_getter_and_setter(self):
        """Verify get_security_gate and set_security_gate singleton helpers."""
        g1 = get_security_gate()
        g2 = get_security_gate()
        self.assertIs(g1, g2)

        custom_g = ExecutionSecurityGate()
        set_security_gate(custom_g)
        self.assertIs(get_security_gate(), custom_g)


if __name__ == "__main__":
    unittest.main()
