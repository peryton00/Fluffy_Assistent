"""
Phase 2C Adversarial Integration Verification Test Suite
Tests every acceptance scenario defined in the Phase 2C verification specification.
"""

import unittest
import time
from typing import Dict, Any, List

from brain.agent.task import AgentTask, TaskStatus
from brain.agent.step import PlanStep, StepStatus
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.state import AgentState
from brain.agent.limits import AgentLimits
from brain.agent.events import AgentEvent, AgentEventType, EventEmitter
from brain.agent.observation import StepObservation
from brain.agent.execution import StepExecutor
from brain.agent.recovery import FailureClassifier, FailureType, RecoveryAction, RecoveryManager
from brain.agent.evaluator import GoalEvaluator
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.intent_router import IntentRouter
from brain.agent.llm_command_parser import CommandUnderstanding
from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.registry import BackendRegistry
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelCapability
from brain.ai.models.registry import ModelRegistry
from brain.ai.router.request import RoutingRequest, TaskType, QualityRequirement
from brain.ai.router.router import DeterministicModelRouter, get_router
from brain.ai.runtime.manager import RuntimeManager, get_runtime
from brain.runtime.rust_capability_client import RustCapabilityClient, get_capability_client
from brain.security.action_validator import ActionValidator, SafetyLevel


class TestAdversarialIntegration(unittest.TestCase):
    """Adversarial verification tests covering sections 1 through 15."""

    # ── Section 1: IntentRouter -> Agent Path ─────────────────────────────────
    def test_section_1_complex_request_routes_to_agent_orchestrator(self):
        """Verify that a complex agent task request reaches AgentOrchestrator."""
        router = IntentRouter()
        
        # Complex multi-step agent task understanding
        understanding = CommandUnderstanding({
            "intent": "agent_task",
            "text": "Analyze hardware specs and optimize system performance",
            "parameters": {"scope": "system_analysis"},
            "confidence": 0.95,
            "original_text": "Analyze hardware specs and optimize system performance",
        })
        
        result = router.route(understanding, original_message="Analyze hardware specs")
        
        self.assertEqual(result["type"], "agent")
        self.assertIn("result", result)
        self.assertIn("task_id", result["result"])
        # Verify result status is a valid TaskStatus
        self.assertIn(result["result"]["status"], [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value])

    def test_section_1_simple_request_routes_to_direct_fast_path(self):
        """Verify that a simple request takes the direct command path without invoking AgentOrchestrator."""
        router = IntentRouter()
        
        understanding = CommandUnderstanding({
            "intent": "help",
            "text": "Show help information",
            "parameters": {},
            "confidence": 1.0,
        })
        
        result = router.route(understanding, original_message="help")
        # Direct path returns command or llm type, not 'agent'
        self.assertNotEqual(result["type"], "agent")
        self.assertTrue(result["success"])

    # ── Section 2: Real Rust Capability Integration ───────────────────────────
    def test_section_2_rust_capability_execution_path(self):
        """
        Verify that StepExecutor routes to RustCapabilityClient and attempts real TCP 9002 IPC.
        If Core is unreachable (not running in background), returns clean error without throwing unhandled exceptions.
        """
        client = get_capability_client()
        executor = StepExecutor(rust_client=client)
        
        task = AgentTask(user_request="Get hardware info")
        state = AgentState(task=task)
        step = PlanStep(
            objective="Query system hardware",
            tool_requirement="rust:System.GetHardware",
            input_parameters={},
            timeout=1.0,
        )
        
        obs = executor.execute_step(step, state)
        
        # Verify observation properties
        self.assertEqual(obs.step_id, step.step_id)
        self.assertEqual(obs.tool_used, "rust:System.GetHardware")
        self.assertIn("rust_response", obs.metadata)
        # Either successful if Core is running and responding, or clean error 'core_unreachable' / 'timeout' / 'empty_response'
        if not obs.success:
            err_code = obs.metadata["rust_response"].get("error", {}).get("code", "")
            self.assertIn(err_code, ("core_unreachable", "timeout", "empty_response", "client_error"))

    # ── Section 3: Model Router Integration ───────────────────────────────────
    def test_section_3_model_router_generation_path(self):
        """
        Verify PlanStep -> RoutingRequest -> ModelRouter -> RoutingDecision -> AIModelRuntime.
        Verify Agent does not select model names directly or bypass ModelRouter.
        """
        model_reg = ModelRegistry()
        backend_reg = BackendRegistry()
        backend_reg.register(ReferenceBackend())
        ref_model = ModelDefinition(
            model_id="ref-model",
            display_name="Reference Model",
            provider="reference",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
            is_installed=True,
        )
        model_reg.register(ref_model)
        
        router = DeterministicModelRouter(model_registry=model_reg, backend_registry=backend_reg)
        runtime = RuntimeManager(backend_registry=backend_reg, registry=model_reg)
        executor = StepExecutor(model_router=router, ai_runtime=runtime)
        
        task = AgentTask(user_request="Summarize recent system health")
        state = AgentState(task=task)
        step = PlanStep(
            objective="Summarize system status",
            model_requirement={"task_type": "general_chat", "quality": "medium", "min_context": 2048},
            input_parameters={"prompt": "Summarize system status in 10 words."},
        )
        
        obs = executor.execute_step(step, state)
        self.assertTrue(obs.success)
        self.assertIsNotNone(obs.model_used)
        self.assertIn("routing_decision", obs.metadata)
        decision_meta = obs.metadata["routing_decision"]
        self.assertEqual(decision_meta["selected_model"], "ref-model")
        self.assertIn("reason", decision_meta)

    # ── Section 4: Multi-Step State & Blackboard Parameter Propagation ────────
    def test_section_4_multi_step_state_propagation(self):
        """
        Step 1 produces structured output -> stored in blackboard ->
        Step 2 parameter interpolation reads Step 1 output -> Step 2 executes -> COMPLETED.
        """
        task = AgentTask(user_request="Pipeline test")
        
        step1 = PlanStep(
            step_id="step_1",
            objective="Generate initial data",
            input_parameters={"data": "alpha_123"},
        )
        step2 = PlanStep(
            step_id="step_2",
            objective="Process data from step 1",
            dependencies=["step_1"],
            input_parameters={"received_data": "${step_1.output}"},
        )
        
        plan = AgentPlan(task_id=task.task_id, goal="Pipeline", steps=[step1, step2])
        orchestrator = AgentOrchestrator()
        result = orchestrator.run(task, plan=plan)
        
        self.assertTrue(result.success)
        self.assertEqual(result.status, TaskStatus.COMPLETED)
        
        state = orchestrator.get_state(task.task_id)
        obs2 = state.observations.get("step_2")
        self.assertIsNotNone(obs2)
        # Verify parameter interpolation resolved step 1 output
        self.assertEqual(obs2.output.get("received_data"), {"data": "alpha_123"})

    # ── Section 5: Dependency Scheduling & Topological Execution ──────────────
    def test_section_5_dependency_scheduling_order(self):
        """
        Verify A -> B -> C dependency chain with independent step D.
        A executes, B cannot execute before A, C cannot execute before B.
        """
        task = AgentTask(user_request="Dependency ordering test")
        
        execution_order: List[str] = []
        
        class TrackingExecutor(StepExecutor):
            def execute_step(self, step: PlanStep, state: AgentState, confirmed: bool = False) -> StepObservation:
                execution_order.append(step.step_id)
                step.mark_completed({"executed": step.step_id})
                return StepObservation(step_id=step.step_id, task_id=state.task.task_id, success=True, output=step.step_id)
        
        # Define in intentionally scrambled list order
        step_c = PlanStep(step_id="step_c", objective="Step C", dependencies=["step_b"])
        step_b = PlanStep(step_id="step_b", objective="Step B", dependencies=["step_a"])
        step_d = PlanStep(step_id="step_d", objective="Step D independent")
        step_a = PlanStep(step_id="step_a", objective="Step A")
        
        plan = AgentPlan(task_id=task.task_id, goal="DAG test", steps=[step_c, step_b, step_d, step_a])
        
        orchestrator = AgentOrchestrator(executor=TrackingExecutor())
        result = orchestrator.run(task, plan=plan)
        
        self.assertTrue(result.success)
        # Step A must precede B, Step B must precede C
        self.assertLess(execution_order.index("step_a"), execution_order.index("step_b"))
        self.assertLess(execution_order.index("step_b"), execution_order.index("step_c"))
        self.assertIn("step_d", execution_order)

    # ── Section 6: Security Boundary & Guardian/ActionValidator Gate ──────────
    def test_section_6_confirmation_required_suspends_task(self):
        """Verify confirmation-required actions suspend task in WAITING_CONFIRMATION."""
        task = AgentTask(user_request="Create system backup directory")
        step = PlanStep(
            step_id="step_mkdir",
            objective="Create folder in custom directory",
            tool_requirement="tool:create_folder",
            input_parameters={"full_path": "C:\\FluffyTestSafeConfirmDir\\custom_folder"},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Custom folder creation", steps=[step])
        
        orchestrator = AgentOrchestrator()
        result = orchestrator.run(task, plan=plan)
        
        self.assertFalse(result.success)
        self.assertEqual(result.status, TaskStatus.WAITING_CONFIRMATION)
        self.assertTrue(result.waiting_confirmation)
        self.assertIsNotNone(result.confirmation_id)

    def test_section_6_security_denied_is_unrecoverable(self):
        """Verify SECURITY_DENIED cannot be retried or bypassed."""
        task = AgentTask(user_request="Delete Windows system files")
        step = PlanStep(
            step_id="step_del",
            objective="Delete system directory",
            tool_requirement="tool:delete_folder",
            input_parameters={"full_path": "C:\\Windows\\System32"},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Delete protected directory", steps=[step])
        
        orchestrator = AgentOrchestrator()
        result = orchestrator.run(task, plan=plan)
        
        self.assertFalse(result.success)
        self.assertEqual(result.status, TaskStatus.FAILED)
        self.assertIn("Security policy blocked action", result.error)

    # ── Section 7: Confirmation Correlation ───────────────────────────────────
    def test_section_7_confirmation_correlation_and_resume(self):
        """Test mismatched confirmation rejection, then valid confirmation resumes task."""
        class SafeConfirmExecutor(StepExecutor):
            def execute_step(self, step: PlanStep, state: AgentState, confirmed: bool = False) -> StepObservation:
                if not confirmed:
                    # Require confirmation safely without invoking OS shutdown
                    conf_id = "conf_test_12345"
                    step.mark_waiting_confirmation({
                        "confirmation_id": conf_id,
                        "message": "Please confirm safe action",
                    })
                    state.add_pending_confirmation(conf_id, {
                        "step_id": step.step_id,
                        "task_id": state.task.task_id,
                        "message": "Please confirm safe action",
                    })
                    return StepObservation(
                        step_id=step.step_id,
                        task_id=state.task.task_id,
                        success=False,
                        error="Waiting for user confirmation",
                        metadata={"waiting_confirmation": True, "confirmation_id": conf_id},
                    )
                # Resumed and confirmed
                step.mark_completed({"confirmed_and_executed": True})
                return StepObservation(
                    step_id=step.step_id,
                    task_id=state.task.task_id,
                    success=True,
                    output={"confirmed_and_executed": True},
                )

        task = AgentTask(user_request="Perform confirmed operation")
        step = PlanStep(
            step_id="step_safe_confirm",
            objective="Perform sensitive operation with confirmation",
        )
        plan = AgentPlan(task_id=task.task_id, goal="Safe confirm test", steps=[step])
        
        orchestrator = AgentOrchestrator(executor=SafeConfirmExecutor())
        res1 = orchestrator.run(task, plan=plan)
        self.assertEqual(res1.status, TaskStatus.WAITING_CONFIRMATION)
        self.assertEqual(res1.confirmation_id, "conf_test_12345")
        
        # Mismatched confirmation ID must be rejected and must NOT authorize pending action
        with self.assertRaises(ValueError):
            orchestrator.resume(task.task_id, confirmed=True, confirmation_id="conf_mismatched_999")
        
        # State must remain WAITING_CONFIRMATION
        state_after_mismatch = orchestrator.get_state(task.task_id)
        self.assertEqual(state_after_mismatch.task.status, TaskStatus.WAITING_CONFIRMATION)
        
        # Valid confirmation resumes the same task from its suspended state
        res_resumed = orchestrator.resume(task.task_id, confirmed=True, confirmation_id=res1.confirmation_id)
        self.assertEqual(res_resumed.status, TaskStatus.COMPLETED)
        self.assertTrue(res_resumed.success)

    # ── Section 8: Bounded Failure Recovery ───────────────────────────────────
    def test_section_8_bounded_retry_and_recovery(self):
        """Verify transient failure is retried up to limit and succeeds upon subsequent attempt."""
        task = AgentTask(user_request="Retry test")
        
        attempts = {"count": 0}
        
        class FlakyExecutor(StepExecutor):
            def execute_step(self, step: PlanStep, state: AgentState, confirmed: bool = False) -> StepObservation:
                attempts["count"] += 1
                if attempts["count"] == 1:
                    step.mark_failed("Connection reset by peer (temporary)")
                    return StepObservation(step_id=step.step_id, task_id=state.task.task_id, success=False, error="Connection reset by peer")
                step.mark_completed({"status": "ok"})
                return StepObservation(step_id=step.step_id, task_id=state.task.task_id, success=True, output={"status": "ok"})
        
        step = PlanStep(step_id="flaky_step", objective="Flaky step")
        plan = AgentPlan(task_id=task.task_id, goal="Flaky", steps=[step])
        
        orchestrator = AgentOrchestrator(executor=FlakyExecutor())
        result = orchestrator.run(task, plan=plan)
        
        self.assertTrue(result.success)
        self.assertEqual(attempts["count"], 2)

    # ── Section 9: Cancellation ───────────────────────────────────────────────
    def test_section_9_task_cancellation(self):
        """Verify task cancellation stops execution and marks CANCELLED."""
        orchestrator = AgentOrchestrator()
        task = AgentTask(user_request="Long task")
        step = PlanStep(
            step_id="step_conf",
            objective="Needs conf",
            tool_requirement="tool:create_folder",
            input_parameters={"full_path": "C:\\FluffyTestSafeConfirmDir\\custom_cancel"},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Cancel test", steps=[step])
        
        res = orchestrator.run(task, plan=plan)
        self.assertEqual(res.status, TaskStatus.WAITING_CONFIRMATION)
        
        cancelled = orchestrator.cancel(task.task_id)
        self.assertTrue(cancelled)
        
        state = orchestrator.get_state(task.task_id)
        self.assertEqual(state.task.status, TaskStatus.CANCELLED)

    # ── Section 10: Limits Enforcement ────────────────────────────────────────
    def test_section_10_limits_enforced_by_execution(self):
        """Verify plan step limits and retry limits are strictly enforced."""
        limits = AgentLimits(max_plan_steps=2, max_retries_per_step=1)
        orchestrator = AgentOrchestrator(limits=limits)
        
        # Plan with 3 steps exceeds max_plan_steps=2
        task = AgentTask(user_request="Excess steps test")
        steps = [PlanStep(step_id=f"step_{i}", objective=f"Step {i}") for i in range(3)]
        plan = AgentPlan(task_id=task.task_id, goal="Excess", steps=steps)
        
        result = orchestrator.run(task, plan=plan)
        self.assertFalse(result.success)
        self.assertIn("exceeds maximum allowed steps limit", result.error)

    # ── Section 11: Goal Evaluation ───────────────────────────────────────────
    def test_section_11_goal_evaluation_success_and_failure(self):
        """Verify GoalEvaluator distinguishes complete from incomplete/failed tasks."""
        task = AgentTask(user_request="Goal eval test")
        state = AgentState(task=task)
        
        # No plan -> not complete
        eval1 = GoalEvaluator.evaluate(state)
        self.assertFalse(eval1.is_complete)
        
        # Plan with failed step -> not complete
        step1 = PlanStep(step_id="s1", objective="S1")
        step1.mark_failed("Fatal error")
        state.plan = AgentPlan(task_id=task.task_id, goal="Goal", steps=[step1])
        eval2 = GoalEvaluator.evaluate(state)
        self.assertFalse(eval2.is_complete)
        self.assertTrue(eval2.needs_replan)
        
        # Plan with completed step -> complete
        step1.status = StepStatus.COMPLETED
        state.record_observation(StepObservation(step_id="s1", task_id=task.task_id, success=True, output="Finished"))
        eval3 = GoalEvaluator.evaluate(state)
        self.assertTrue(eval3.is_complete)
        self.assertEqual(eval3.summary, "Finished")

    # ── Section 12: LLM Plan Validation & Schema Sanitization ─────────────────
    def test_section_12_malformed_llm_plans_rejected(self):
        """Verify cyclic, duplicate, and missing dependencies are caught by PlanValidator."""
        # 1. Duplicate step IDs
        plan_dup = AgentPlan(
            task_id="t1",
            goal="Duplicate",
            steps=[PlanStep(step_id="s1", objective="1"), PlanStep(step_id="s1", objective="2")],
        )
        is_valid, err = PlanValidator.validate(plan_dup)
        self.assertFalse(is_valid)
        self.assertIn("Duplicate step_id", err)
        
        # 2. Non-existent dependency
        plan_missing_dep = AgentPlan(
            task_id="t2",
            goal="Missing dep",
            steps=[PlanStep(step_id="s1", objective="1", dependencies=["non_existent_s0"])],
        )
        is_valid, err = PlanValidator.validate(plan_missing_dep)
        self.assertFalse(is_valid)
        self.assertIn("depends on non-existent step", err)
        
        # 3. Cyclic dependency
        plan_cycle = AgentPlan(
            task_id="t3",
            goal="Cycle",
            steps=[
                PlanStep(step_id="s1", objective="1", dependencies=["s2"]),
                PlanStep(step_id="s2", objective="2", dependencies=["s1"]),
            ],
        )
        is_valid, err = PlanValidator.validate(plan_cycle)
        self.assertFalse(is_valid)
        self.assertIn("Cyclic dependency", err)

    # ── Section 13: No Security Bypass via Recovery ───────────────────────────
    def test_section_13_security_denied_cannot_fallback_or_replan(self):
        """Verify RecoveryManager strictly refuses to retry or replan on SECURITY_DENIED."""
        step = PlanStep(step_id="s_sec", objective="Blocked action")
        limits = AgentLimits()
        
        action = RecoveryManager.determine_action(
            failure_type=FailureType.SECURITY_DENIED,
            step=step,
            total_retries=0,
            limits=limits,
        )
        self.assertEqual(action, RecoveryAction.ABORT)

    # ── Section 14: Lifecycle Event Ordering ──────────────────────────────────
    def test_section_14_event_emission_sequence(self):
        """Verify that orchestrator emits events in strict lifecycle sequence."""
        events: List[AgentEvent] = []
        emitter = EventEmitter()
        emitter.subscribe(lambda e: events.append(e))
        
        orchestrator = AgentOrchestrator(event_emitter=emitter)
        task = AgentTask(user_request="Event order test")
        step = PlanStep(step_id="s_evt", objective="Evt step")
        plan = AgentPlan(task_id=task.task_id, goal="Event test", steps=[step])
        
        result = orchestrator.run(task, plan=plan)
        self.assertTrue(result.success)
        
        event_types = [e.event_type for e in events]
        expected_sequence = [
            AgentEventType.TASK_CREATED,
            AgentEventType.PLAN_CREATED,
            AgentEventType.STEP_STARTED,
            AgentEventType.STEP_COMPLETED,
            AgentEventType.TASK_COMPLETED,
        ]
        self.assertEqual(event_types, expected_sequence)

    # ── Section 15: Cross-Task State Isolation ────────────────────────────────
    def test_section_15_task_state_isolation(self):
        """Verify two tasks execute with complete isolation between their states and blackboards."""
        orchestrator = AgentOrchestrator()
        
        task_a = AgentTask(user_request="Task A")
        step_a = PlanStep(step_id="s1", objective="A", input_parameters={"val": "AAA"})
        plan_a = AgentPlan(task_id=task_a.task_id, goal="A", steps=[step_a])
        
        task_b = AgentTask(user_request="Task B")
        step_b = PlanStep(step_id="s1", objective="B", input_parameters={"val": "BBB"})
        plan_b = AgentPlan(task_id=task_b.task_id, goal="B", steps=[step_b])
        
        res_a = orchestrator.run(task_a, plan=plan_a)
        res_b = orchestrator.run(task_b, plan=plan_b)
        
        state_a = orchestrator.get_state(task_a.task_id)
        state_b = orchestrator.get_state(task_b.task_id)
        
        self.assertNotEqual(state_a.task.task_id, state_b.task.task_id)
        self.assertEqual(state_a.observations["s1"].output["val"], "AAA")
        self.assertEqual(state_b.observations["s1"].output["val"], "BBB")


if __name__ == "__main__":
    unittest.main()
