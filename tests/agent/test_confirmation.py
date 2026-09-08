"""
Confirmation Handling & Task Resumption Tests
Verifies task suspension upon confirmation requirement and safe continuation upon user approval/rejection.
"""

import unittest
from typing import Dict, Any

from brain.agent.execution import StepExecutor
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus
from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult


class MockConfirmValidator(ActionValidator):
    """Mock validator that triggers confirmation on delete/kill actions."""
    def validate(self, command):
        intent = str(command.intent).lower()
        if "terminate" in intent or "kill" in intent:
            return ValidationResult(
                is_valid=True,
                safety_level=SafetyLevel.NEEDS_CONFIRMATION,
                message="Confirm terminating target process?",
            )
        return ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="Safe")


class MockConfirmRustClient:
    def execute_capability(self, capability_id: str, parameters: Dict[str, Any], request_id: str, timeout: float):
        return {"success": True, "data": {"terminated": True, "pid": parameters.get("pid")}}


class TestAgentConfirmation(unittest.TestCase):
    """Test suite for agent confirmation handling."""

    def setUp(self):
        self.executor = StepExecutor(
            rust_client=MockConfirmRustClient(),
            action_validator=MockConfirmValidator(),
        )
        self.orchestrator = AgentOrchestrator(executor=self.executor)

    def test_confirmation_suspension_and_resumption_flow(self):
        """Task suspends in WAITING_CONFIRMATION and resumes to completion on approval."""
        task = AgentTask(user_request="Kill process 999")
        step = PlanStep(
            step_id="kill_step",
            objective="Kill PID 999",
            tool_requirement="rust:Process.Terminate",
            input_parameters={"pid": 999},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Kill process", steps=[step])

        # 1. Run task -> Suspends in WAITING_CONFIRMATION
        result1 = self.orchestrator.run(task, plan=plan)

        self.assertFalse(result1.success)
        self.assertTrue(result1.waiting_confirmation)
        self.assertEqual(result1.status, TaskStatus.WAITING_CONFIRMATION)
        self.assertIsNotNone(result1.confirmation_id)
        self.assertIn("Confirm terminating", result1.confirmation_message)

        # 2. Resume task with approval (confirmed=True)
        result2 = self.orchestrator.resume(
            task_id=task.task_id,
            confirmed=True,
            confirmation_id=result1.confirmation_id,
        )

        self.assertTrue(result2.success)
        self.assertEqual(result2.status, TaskStatus.COMPLETED)
        self.assertFalse(result2.waiting_confirmation)
        self.assertEqual(step.status, StepStatus.COMPLETED)

    def test_confirmation_rejection_flow(self):
        """Declining confirmation terminates task safely without executing dangerous action."""
        task = AgentTask(user_request="Kill process 888")
        step = PlanStep(
            step_id="kill_step_2",
            objective="Kill PID 888",
            tool_requirement="rust:Process.Terminate",
            input_parameters={"pid": 888},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Kill process", steps=[step])

        # 1. Run task -> Suspends
        res1 = self.orchestrator.run(task, plan=plan)
        self.assertTrue(res1.waiting_confirmation)

        # 2. Resume with rejection (confirmed=False)
        res2 = self.orchestrator.resume(
            task_id=task.task_id,
            confirmed=False,
            confirmation_id=res1.confirmation_id,
        )

        self.assertFalse(res2.success)
        self.assertEqual(res2.status, TaskStatus.FAILED)
        self.assertIn("declined", res2.summary)


if __name__ == "__main__":
    unittest.main()
