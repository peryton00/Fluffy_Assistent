"""
Step Executor & Security Boundary Tests
Verifies safe step dispatch, variable interpolation, security enforcement, and confirmation triggers.
"""

import unittest
from typing import Dict, Any

from brain.agent.execution import StepExecutor
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask
from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.registry import BackendRegistry
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelCapability
from brain.ai.models.registry import ModelRegistry
from brain.ai.router.router import DeterministicModelRouter
from brain.ai.runtime.manager import RuntimeManager
from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult


class MockRustClient:
    """Mock client returning canned capability responses."""
    def execute_capability(self, capability_id: str, parameters: Dict[str, Any], request_id: str, timeout: float):
        if capability_id == "System.GetHardware":
            return {
                "success": True,
                "data": {"cpu_cores": 16, "ram_gb": 32, "os": "windows"},
            }
        elif capability_id == "Process.Terminate":
            return {
                "success": True,
                "data": {"pid": parameters.get("pid"), "killed": True},
            }
        return {"success": False, "error": {"message": f"Unknown capability '{capability_id}'"}}


class MockActionValidator(ActionValidator):
    """Mock validator to test security paths."""
    def validate(self, command):
        intent = str(command.intent).lower()
        if "delete_system" in intent or "block" in intent:
            return ValidationResult(is_valid=False, safety_level=SafetyLevel.BLOCKED, message="Action blocked by security policy.")
        if "delete" in intent or "terminate" in intent or "kill" in intent:
            return ValidationResult(is_valid=True, safety_level=SafetyLevel.NEEDS_CONFIRMATION, message="Are you sure you want to delete?")
        return ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="Safe")


class TestStepExecution(unittest.TestCase):
    """Test suite for StepExecutor."""

    def setUp(self):
        # AI Foundations
        self.model_reg = ModelRegistry()
        self.backend_reg = BackendRegistry()
        self.backend_reg.register(ReferenceBackend())

        self.model = ModelDefinition(
            model_id="ref-model",
            display_name="Reference Model",
            provider="reference",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
            is_installed=True,
        )
        self.model_reg.register(self.model)

        self.router = DeterministicModelRouter(
            model_registry=self.model_reg,
            backend_registry=self.backend_reg,
        )
        self.runtime = RuntimeManager(
            backend_registry=self.backend_reg,
            registry=self.model_reg,
        )

        self.executor = StepExecutor(
            rust_client=MockRustClient(),
            model_router=self.router,
            ai_runtime=self.runtime,
            action_validator=MockActionValidator(),
        )

    def test_execute_rust_capability(self):
        """Step with rust: capability requirement dispatches cleanly."""
        task = AgentTask(user_request="Get hardware info")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="s1",
            objective="Get hardware",
            tool_requirement="rust:System.GetHardware",
        )

        obs = self.executor.execute_step(step, state)

        self.assertTrue(obs.success)
        self.assertEqual(obs.tool_used, "rust:System.GetHardware")
        self.assertEqual(obs.output, {"cpu_cores": 16, "ram_gb": 32, "os": "windows"})
        self.assertEqual(step.status, StepStatus.COMPLETED)

    def test_execute_model_reasoning_step(self):
        """Step with model requirement routes via ModelRouter and generates text via AI Runtime."""
        task = AgentTask(user_request="Summarize findings")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="s2",
            objective="Summarize findings",
            model_requirement={"task_type": "general_chat"},
            input_parameters={"prompt": "Summarize CPU findings"},
        )

        obs = self.executor.execute_step(step, state)

        self.assertTrue(obs.success)
        self.assertEqual(obs.model_used, "ref-model")
        self.assertIsNotNone(obs.output)
        self.assertEqual(step.status, StepStatus.COMPLETED)

    def test_variable_interpolation_from_state(self):
        """Input parameters with ${var} or ${step.output} interpolate values from blackboard."""
        task = AgentTask(user_request="Interpolation test")
        state = AgentState(task=task)
        state.set_variable("target_user", "Alice")

        step = PlanStep(
            step_id="s3",
            objective="Greeting",
            input_parameters={"name": "${target_user}"},
        )

        obs = self.executor.execute_step(step, state)
        self.assertTrue(obs.success)
        self.assertEqual(obs.output["name"], "Alice")

    def test_security_blocked_action(self):
        """ActionValidator BLOCKED decision halts step with security error."""
        task = AgentTask(user_request="Delete system root")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="s4",
            objective="Delete system folder",
            tool_requirement="tool:delete_system_dir",
            input_parameters={"path": "C:/Windows"},
        )

        obs = self.executor.execute_step(step, state)

        self.assertFalse(obs.success)
        self.assertIn("Security policy blocked", obs.error)
        self.assertEqual(step.status, StepStatus.FAILED)

    def test_security_needs_confirmation(self):
        """ActionValidator NEEDS_CONFIRMATION flags step as WAITING_CONFIRMATION and adds state confirmation."""
        task = AgentTask(user_request="Kill process")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="s5",
            objective="Kill task",
            tool_requirement="rust:Process.Terminate",
            input_parameters={"pid": 4321},
        )

        obs = self.executor.execute_step(step, state, confirmed=False)

        self.assertFalse(obs.success)
        self.assertEqual(step.status, StepStatus.WAITING_CONFIRMATION)
        self.assertTrue(obs.metadata.get("waiting_confirmation"))
        self.assertEqual(len(state.pending_confirmations), 1)


if __name__ == "__main__":
    unittest.main()
