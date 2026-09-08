"""
Agent Orchestrator End-to-End Integration Tests
Validates core multi-step execution flows, Rust capability integration, Model Router integration,
confirmation handling, failure recovery, and IntentRouter handshake.
"""

import unittest
from typing import Dict, Any

from brain.agent.events import AgentEventType, EventEmitter
from brain.agent.execution import StepExecutor
from brain.agent.intent_router import IntentRouter
from brain.agent.llm_command_parser import CommandUnderstanding
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus
from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.registry import BackendRegistry
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelCapability
from brain.ai.models.registry import ModelRegistry
from brain.ai.router.policies import RoutingPolicyProfile
from brain.ai.router.router import DeterministicModelRouter
from brain.ai.runtime.manager import RuntimeManager
from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult


class MockSystemRustClient:
    """Mock Rust Client providing deterministic responses for tests."""
    def __init__(self):
        self.should_fail = False

    def execute_capability(self, capability_id: str, parameters: Dict[str, Any], request_id: str, timeout: float):
        if self.should_fail:
            return {"success": False, "error": {"message": "Temporary socket timeout"}}
        if capability_id == "System.GetHardware":
            return {
                "success": True,
                "data": {
                    "os": "windows 11",
                    "cpu_cores": 16,
                    "ram_gb": 32,
                    "gpu": "NVIDIA RTX 4080",
                },
            }
        elif capability_id == "Process.Terminate":
            return {"success": True, "data": {"killed": True, "pid": parameters.get("pid")}}
        return {"success": False, "error": {"message": f"Unknown capability '{capability_id}'"}}


class MockSecurityValidator(ActionValidator):
    def validate(self, command):
        intent = str(command.intent).lower()
        if "terminate" in intent or "kill" in intent:
            return ValidationResult(is_valid=True, safety_level=SafetyLevel.NEEDS_CONFIRMATION, message="Confirm process termination")
        return ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="Safe")


class TestAgentOrchestratorEndToEnd(unittest.TestCase):
    """Full End-to-End Orchestrator Integration Test Suite."""

    def setUp(self):
        # AI Foundations
        self.model_reg = ModelRegistry()
        self.backend_reg = BackendRegistry()
        self.backend_reg.register(ReferenceBackend())

        self.model = ModelDefinition(
            model_id="ref-chat-model",
            display_name="Reference Chat Model",
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

        self.rust_client = MockSystemRustClient()
        self.event_emitter = EventEmitter()
        self.emitted_events = []

        self.event_emitter.subscribe(lambda evt: self.emitted_events.append(evt))

        self.executor = StepExecutor(
            rust_client=self.rust_client,
            model_router=self.router,
            ai_runtime=self.runtime,
            action_validator=MockSecurityValidator(),
        )

        self.orchestrator = AgentOrchestrator(
            executor=self.executor,
            event_emitter=self.event_emitter,
        )

    def test_acceptance_flow_system_inspection_and_summarization(self):
        """
        Acceptance Test 1:
        User Request -> AgentTask -> AgentPlan
          Step 1: System.GetHardware (Rust Capability) -> Observation
          Step 2: Summarize findings (Model Router + AI Runtime) -> Observation
        -> GoalEvaluator -> COMPLETED
        """
        task = AgentTask(
            user_request="Inspect the running system and summarize what you find.",
            goal="Inspect system and summarize hardware specs.",
        )

        step1 = PlanStep(
            step_id="step_hardware",
            objective="Query system hardware specifications via Rust",
            tool_requirement="rust:System.GetHardware",
        )
        step2 = PlanStep(
            step_id="step_summary",
            objective="Summarize system inspection findings",
            dependencies=["step_hardware"],
            model_requirement={"task_type": "general_chat", "quality": "medium"},
            input_parameters={"prompt": "Summarize the system specs: 16 cores, 32GB RAM, Windows 11"},
        )

        plan = AgentPlan(task_id=task.task_id, goal=task.goal, steps=[step1, step2])

        # Run orchestrator
        result = self.orchestrator.run(task, plan=plan)

        self.assertTrue(result.success)
        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(len(result.observations), 2)
        self.assertEqual(step1.status, StepStatus.COMPLETED)
        self.assertEqual(step2.status, StepStatus.COMPLETED)

        # Verify emitted events in order
        event_types = [e.event_type for e in self.emitted_events]
        self.assertEqual(event_types[0], AgentEventType.TASK_CREATED)
        self.assertEqual(event_types[1], AgentEventType.PLAN_CREATED)
        self.assertIn(AgentEventType.STEP_STARTED, event_types)
        self.assertIn(AgentEventType.STEP_COMPLETED, event_types)
        self.assertEqual(event_types[-1], AgentEventType.TASK_COMPLETED)

    def test_acceptance_flow_security_confirmation(self):
        """
        Acceptance Test 2:
        Task with dangerous action triggers WAITING_CONFIRMATION, suspends,
        and cleanly completes upon user approval.
        """
        task = AgentTask(user_request="Terminate unresponsive process PID 777")
        step = PlanStep(
            step_id="step_kill",
            objective="Terminate process",
            tool_requirement="rust:Process.Terminate",
            input_parameters={"pid": 777},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Terminate process", steps=[step])

        # 1. Run -> Suspends
        res1 = self.orchestrator.run(task, plan=plan)
        self.assertTrue(res1.waiting_confirmation)
        self.assertEqual(res1.status, TaskStatus.WAITING_CONFIRMATION)

        # 2. User confirms
        res2 = self.orchestrator.resume(task.task_id, confirmed=True, confirmation_id=res1.confirmation_id)
        self.assertTrue(res2.success)
        self.assertEqual(res2.status, TaskStatus.COMPLETED)
        self.assertEqual(step.status, StepStatus.COMPLETED)

    def test_acceptance_flow_failure_and_bounded_recovery(self):
        """
        Acceptance Test 3:
        Transient step failure recovers cleanly through bounded retries.
        """
        task = AgentTask(user_request="Fetch hardware with intermittent glitch")
        step = PlanStep(
            step_id="step_flaky",
            objective="Fetch hardware info",
            tool_requirement="rust:System.GetHardware",
        )
        plan = AgentPlan(task_id=task.task_id, goal="Flaky test", steps=[step])

        # Set rust client to fail once then succeed
        self.rust_client.should_fail = True

        # Custom mock executor that fails on first attempt and succeeds on second
        original_execute = self.executor.execute_step
        attempt_tracker = {"count": 0}

        def flaky_execute(st, state, confirmed=False):
            attempt_tracker["count"] += 1
            if attempt_tracker["count"] == 1:
                self.rust_client.should_fail = True
            else:
                self.rust_client.should_fail = False
            return original_execute(st, state, confirmed=confirmed)

        self.executor.execute_step = flaky_execute

        result = self.orchestrator.run(task, plan=plan)

        self.assertTrue(result.success)
        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(attempt_tracker["count"], 2)

    def test_task_cancellation(self):
        """Cancelling a task marks status as CANCELLED and stops execution."""
        task = AgentTask(user_request="Task to cancel")
        step = PlanStep(
            step_id="step_c",
            objective="Kill task",
            tool_requirement="rust:Process.Terminate",
            input_parameters={"pid": 111},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Cancel test", steps=[step])

        # Run -> suspends in confirmation
        res = self.orchestrator.run(task, plan=plan)
        self.assertTrue(res.waiting_confirmation)

        # Cancel
        cancelled = self.orchestrator.cancel(task.task_id)
        self.assertTrue(cancelled)
        self.assertEqual(task.status, TaskStatus.CANCELLED)

    def test_intent_router_agent_task_integration(self):
        """IntentRouter routes agent_task intents through AgentOrchestrator."""
        intent_router = IntentRouter()
        understanding = CommandUnderstanding({
            "intent": "agent_task",
            "text": "Inspect system hardware",
            "original_text": "Inspect system hardware",
            "parameters": {"tool_requirement": None, "parameters": {"msg": "System ready"}},
        })

        response = intent_router.route(understanding, original_message="Inspect system hardware")

        self.assertEqual(response["type"], "agent")
        self.assertTrue(response["success"])
        self.assertIsNotNone(response["result"])
        self.assertEqual(response["result"]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
