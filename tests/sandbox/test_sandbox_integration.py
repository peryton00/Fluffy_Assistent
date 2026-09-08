"""
Integration Tests for Secure Code Sandbox (Phase 2E)
Validates end-to-end integration across Agent, StepExecutor, UnifiedToolRuntime, ToolSecurityPolicy, and SandboxToolAdapter.
"""

import unittest
from pathlib import Path

from brain.agent.step import PlanStep, StepStatus
from brain.agent.state import AgentState
from brain.agent.task import AgentTask
from brain.agent.observation import StepObservation
from brain.agent.execution import StepExecutor
from brain.agent.evaluator import GoalEvaluator
from brain.tools.runtime import UnifiedToolRuntime, get_tool_runtime
from brain.tools.registry import get_tool_registry, ToolRegistry
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.policies.policy import ToolSecurityPolicy
from brain.tools.adapters.sandbox import SandboxToolAdapter
from brain.sandbox.manager import SandboxManager


class TestSandboxIntegration(unittest.TestCase):
    """Integration test suite for sandbox tool dispatch."""

    def test_01_canonical_runtime_tool_execution(self):
        """Verify code execution through UnifiedToolRuntime -> SandboxToolAdapter."""
        runtime = get_tool_runtime()
        req = ToolRequest(
            tool_id="sandbox.execute",
            parameters={
                "code": "a = 25\nb = 17\nresult = a * b\nprint(f'PRODUCT={result}')",
            },
        )
        res = runtime.execute(req, confirmed=True)
        self.assertTrue(res.success, f"Failed: {res.error}")
        self.assertEqual(res.output, 425)
        self.assertIn("PRODUCT=425", res.metadata.get("stdout", ""))

    def test_02_security_confirmation_gate(self):
        """Verify sandbox tool requires user confirmation before executing untrusted code."""
        runtime = get_tool_runtime()
        req = ToolRequest(
            tool_id="sandbox.execute",
            parameters={"code": "print('sensitive computation')"},
        )
        # 1. Unconfirmed attempt -> MUST return CONFIRMATION_REQUIRED
        res_unconfirmed = runtime.execute(req, confirmed=False)
        self.assertFalse(res_unconfirmed.success)
        self.assertEqual(res_unconfirmed.error_type, ToolErrorType.CONFIRMATION_REQUIRED)

        # 2. Confirmed attempt -> MUST execute
        res_confirmed = runtime.execute(req, confirmed=True)
        self.assertTrue(res_confirmed.success)
        self.assertIn("sensitive computation", res_confirmed.metadata.get("stdout", ""))

    def test_03_schema_validation_error_prevents_execution(self):
        """Malformed request without 'code' parameter must be rejected before backend dispatch."""
        runtime = get_tool_runtime()
        req = ToolRequest(
            tool_id="sandbox.execute",
            parameters={"invalid_param": 123},
        )
        res = runtime.execute(req, confirmed=True)
        self.assertFalse(res.success)
        self.assertEqual(res.error_type, ToolErrorType.VALIDATION_ERROR)

    def test_04_agent_step_executor_end_to_end(self):
        """Full Agent execution trace: Task -> PlanStep -> StepExecutor -> Sandbox -> Observation -> Evaluator."""
        executor = StepExecutor()
        task = AgentTask(task_id="task_calc_fib", user_request="Calculate 10th Fibonacci number")
        state = AgentState(task=task)

        step = PlanStep(
            step_id="step_fib_1",
            objective="Compute Fibonacci number using secure sandbox",
            tool_requirement="sandbox.execute",
            input_parameters={
                "code": "def f(n): return n if n <= 1 else f(n-1) + f(n-2)\nresult = f(10)",
            },
        )

        obs: StepObservation = executor.execute_step(step, state, confirmed=True)
        self.assertTrue(obs.success, f"Observation error: {obs.error}")
        self.assertEqual(obs.output, 55)
        self.assertEqual(step.status, StepStatus.COMPLETED)

        evaluator = GoalEvaluator()
        eval_res = evaluator.evaluate(state)
        self.assertIsNotNone(eval_res)

    def test_05_malicious_code_containment_in_agent_flow(self):
        """Model-generated malicious code attempting socket exfiltration fails gracefully and is reported in observation."""
        executor = StepExecutor()
        task = AgentTask(task_id="task_malicious", user_request="Exfiltrate environment to external server")
        state = AgentState(task=task)

        step = PlanStep(
            step_id="step_mal_1",
            objective="Attempt socket connection to localhost",
            tool_requirement="sandbox.execute",
            input_parameters={
                "code": "import socket\ns = socket.socket()\ns.connect(('127.0.0.1', 9002))",
            },
        )

        obs: StepObservation = executor.execute_step(step, state, confirmed=True)
        self.assertFalse(obs.success)
        self.assertEqual(step.status, StepStatus.FAILED)
        self.assertTrue(
            "Network access is strictly disabled" in obs.error or "PermissionError" in obs.error,
            f"Expected network denial message, got: {obs.error}",
        )


if __name__ == "__main__":
    unittest.main()
