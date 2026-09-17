"""
Step Executor & Tool Runtime Boundary Tests
Verifies canonical tool execution via UnifiedToolRuntime, dependency injection,
non-tool execution separation, context propagation, error normalization, and security enforcement.
"""

import unittest
from unittest.mock import MagicMock, patch
from typing import Dict, Any

from brain.agent.execution import StepExecutor
from brain.agent.observation import StepObservation
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
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.runtime import UnifiedToolRuntime


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
    """Test suite for StepExecutor and canonical tool runtime boundary."""

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

    # -------------------------------------------------------------------------
    # 1. Existing Core Execution Tests
    # -------------------------------------------------------------------------

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

    # -------------------------------------------------------------------------
    # 2. Phase 5: Canonical Tool Runtime Boundary Tests
    # -------------------------------------------------------------------------

    def test_tool_step_uses_injected_unified_tool_runtime(self):
        """Verify StepExecutor dispatches tool steps through injected UnifiedToolRuntime."""
        mock_runtime = MagicMock(spec=UnifiedToolRuntime)
        mock_runtime.execute.return_value = ToolResult.ok(
            request_id="req_001",
            tool_id="test_tool",
            output={"result": "success_payload"},
            duration_ms=12.5,
            metadata={"custom_flag": True},
        )

        executor = StepExecutor(tool_runtime=mock_runtime)
        task = AgentTask(user_request="Run custom tool", task_id="task_tool_01")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="step_tool_1",
            objective="Execute custom tool",
            tool_requirement="test_tool",
            input_parameters={"param1": "val1"},
            timeout=15.0,
            metadata={"env": "prod"},
        )

        obs = executor.execute_step(step, state)

        # Verify tool runtime was called
        mock_runtime.execute.assert_called_once()
        call_args, call_kwargs = mock_runtime.execute.call_args
        tool_req: ToolRequest = call_args[0]

        # Verify context propagation
        self.assertEqual(tool_req.tool_id, "test_tool")
        self.assertEqual(tool_req.parameters, {"param1": "val1"})
        self.assertEqual(tool_req.task_id, "task_tool_01")
        self.assertEqual(tool_req.step_id, "step_tool_1")
        self.assertEqual(tool_req.timeout, 15.0)
        self.assertEqual(tool_req.metadata.get("env"), "prod")
        self.assertEqual(call_kwargs.get("confirmed"), False)

        # Verify observation
        self.assertTrue(obs.success)
        self.assertEqual(obs.output, {"result": "success_payload"})
        self.assertEqual(step.status, StepStatus.COMPLETED)

    @patch("brain.tools.command_executor.CommandExecutor.execute")
    def test_canonical_tool_step_does_not_invoke_command_executor(self, mock_cmd_exec):
        """Verify StepExecutor does NOT directly invoke CommandExecutor."""
        mock_runtime = MagicMock(spec=UnifiedToolRuntime)
        mock_runtime.execute.return_value = ToolResult.ok(
            request_id="req_002",
            tool_id="tool:safe_action",
            output="ok",
        )

        executor = StepExecutor(tool_runtime=mock_runtime)
        task = AgentTask(user_request="Safe tool task")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="step_1",
            objective="Safe action",
            tool_requirement="tool:safe_action",
        )

        obs = executor.execute_step(step, state)

        self.assertTrue(obs.success)
        mock_cmd_exec.assert_not_called()

    def test_runtime_structured_error_propagation(self):
        """Verify structured runtime error is normalized and recorded in StepObservation and PlanStep."""
        mock_runtime = MagicMock(spec=UnifiedToolRuntime)
        mock_runtime.execute.return_value = ToolResult.fail(
            request_id="req_003",
            tool_id="tool:failing",
            error="Connection refused by remote host",
            error_type=ToolErrorType.EXECUTION_ERROR,
            duration_ms=5.0,
            metadata={"error_code": 503},
        )

        executor = StepExecutor(tool_runtime=mock_runtime)
        task = AgentTask(user_request="Failing task")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="step_fail",
            objective="Failing action",
            tool_requirement="tool:failing",
        )

        obs = executor.execute_step(step, state)

        self.assertFalse(obs.success)
        self.assertEqual(obs.error, "Connection refused by remote host")
        self.assertEqual(step.status, StepStatus.FAILED)
        self.assertEqual(obs.metadata["tool_result"]["error_type"], "execution_error")

    def test_security_denial_normalization(self):
        """Verify SECURITY_DENIED error type flags security_blocked in observation metadata."""
        mock_runtime = MagicMock(spec=UnifiedToolRuntime)
        mock_runtime.execute.return_value = ToolResult.fail(
            request_id="req_004",
            tool_id="tool:restricted",
            error="Access denied by security sandbox policy",
            error_type=ToolErrorType.SECURITY_DENIED,
        )

        executor = StepExecutor(tool_runtime=mock_runtime)
        task = AgentTask(user_request="Restricted task")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="step_sec",
            objective="Restricted action",
            tool_requirement="tool:restricted",
        )

        obs = executor.execute_step(step, state)

        self.assertFalse(obs.success)
        self.assertTrue(obs.metadata["security_blocked"])
        self.assertEqual(step.status, StepStatus.FAILED)

    def test_structured_tool_output_and_metadata_preserved(self):
        """Verify nested and complex tool outputs remain intact without stringification."""
        complex_payload = {
            "processes": [
                {"pid": 101, "name": "node.exe", "memory_mb": 256},
                {"pid": 102, "name": "python.exe", "memory_mb": 512},
            ],
            "total_count": 2,
        }

        mock_runtime = MagicMock(spec=UnifiedToolRuntime)
        mock_runtime.execute.return_value = ToolResult.ok(
            request_id="req_005",
            tool_id="tool:list_processes",
            output=complex_payload,
            metadata={"query_time_utc": "2026-09-18T00:00:00Z"},
        )

        executor = StepExecutor(tool_runtime=mock_runtime)
        task = AgentTask(user_request="List processes")
        state = AgentState(task=task)
        step = PlanStep(
            step_id="step_proc",
            objective="List processes",
            tool_requirement="tool:list_processes",
        )

        obs = executor.execute_step(step, state)

        self.assertTrue(obs.success)
        self.assertEqual(obs.output, complex_payload)
        self.assertIsInstance(obs.output["processes"], list)

    def test_non_tool_execution_types_bypass_tool_runtime(self):
        """Verify model reasoning and data steps do NOT invoke UnifiedToolRuntime."""
        mock_runtime = MagicMock(spec=UnifiedToolRuntime)

        executor = StepExecutor(
            tool_runtime=mock_runtime,
            model_router=self.router,
            ai_runtime=self.runtime,
        )

        # 1. Model step
        task = AgentTask(user_request="Model step")
        state = AgentState(task=task)
        model_step = PlanStep(
            step_id="s_model",
            objective="Think",
            model_requirement={"task_type": "general_chat"},
            input_parameters={"prompt": "Think about this"},
        )
        executor.execute_step(model_step, state)
        mock_runtime.execute.assert_not_called()

        # 2. Data/blackboard step
        data_step = PlanStep(
            step_id="s_data",
            objective="Store data",
            input_parameters={"key": "value"},
        )
        executor.execute_step(data_step, state)
        mock_runtime.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
