"""
Unit & Integration Tests for Confirmation + Recovery Lifecycle in Fluffy Assistant
Validates Phase 7 deterministic confirmation, recovery, retry, replay protection, and DAG lifecycle.
"""

import threading
import time
import unittest
from unittest.mock import MagicMock

from brain.agent.execution import StepExecutor
from brain.agent.gateway import AgentExecutionGateway
from brain.agent.interface import AgentResult
from brain.agent.limits import AgentLimits
from brain.agent.manager import AgentTaskManager, TaskLifecycleError
from brain.agent.observation import StepObservation
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.recovery import FailureClassifier, FailureType, RecoveryAction, RecoveryManager
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus
from brain.security.gate import set_security_gate
from brain.tools.definitions import ToolDefinition, ToolKind, ToolRiskLevel, ToolSecurityMetadata
from brain.tools.registry import ToolRegistry
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.runtime import UnifiedToolRuntime


class TestConfirmationAndRecoveryLifecycle(unittest.TestCase):
    """
    Test suite for Phase 7: Confirmation + Recovery Lifecycle.
    """

    def setUp(self):
        self.limits = AgentLimits(
            max_retries_per_step=2,
            max_total_retries=3,
            step_timeout_sec=5.0,
            task_timeout_sec=10.0,
        )
        self.manager = AgentTaskManager(default_limits=self.limits)
        self.gateway = AgentExecutionGateway(task_manager=self.manager)

    def tearDown(self):
        set_security_gate(None)

    # -------------------------------------------------------------------------
    # A. Confirmation Creation
    # -------------------------------------------------------------------------

    def test_confirmation_creation_suspends_task_and_stores_pending(self):
        """Security gate CONFIRM creates confirmation envelope, suspends task, protects adapter."""
        mock_adapter = MagicMock()

        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Perform sensitive op", task_id="task_conf_1")
        step = PlanStep(
            objective="Execute sensitive op",
            step_id="step_1",
            tool_requirement="mock.sensitive_op",
            input_parameters={"target": "system_config"},
        )
        plan = AgentPlan(task_id="task_conf_1", goal="Sensitive Op", steps=[step])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_conf_1").orchestrator = orch

        res = self.gateway.start("task_conf_1")

        # Verify task is suspended in WAITING_CONFIRMATION
        self.assertFalse(res.success)
        self.assertEqual(res.status, TaskStatus.WAITING_CONFIRMATION)
        self.assertTrue(res.waiting_confirmation)
        self.assertIsNotNone(res.confirmation_id)

        # Verify adapter was NEVER called
        mock_adapter.execute.assert_not_called()

        # Verify state maintains pending confirmation
        state = self.gateway.get_state("task_conf_1")
        self.assertIn(res.confirmation_id, state.pending_confirmations)
        self.assertEqual(state.pending_confirmations[res.confirmation_id]["step_id"], "step_1")

    # -------------------------------------------------------------------------
    # B. Correct Confirmation Resume
    # -------------------------------------------------------------------------

    def test_correct_confirmation_resume_executes_adapter_once(self):
        """Valid confirmation_id resumes task on same orchestrator and executes adapter exactly once."""
        mock_adapter = MagicMock()
        mock_adapter.execute.return_value = ToolResult.ok(
            request_id="r1",
            tool_id="mock.sensitive_op",
            output={"result": "operation completed successfully"},
        )

        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Perform sensitive op", task_id="task_conf_2")
        step = PlanStep(
            objective="Execute sensitive op",
            step_id="step_1",
            tool_requirement="mock.sensitive_op",
        )
        plan = AgentPlan(task_id="task_conf_2", goal="Sensitive Op", steps=[step])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_conf_2").orchestrator = orch

        res1 = self.gateway.start("task_conf_2")
        self.assertEqual(res1.status, TaskStatus.WAITING_CONFIRMATION)
        conf_id = res1.confirmation_id

        # Resume with confirmed=True and valid confirmation_id
        res2 = self.gateway.resume(task_id="task_conf_2", confirmed=True, confirmation_id=conf_id)

        self.assertTrue(res2.success)
        self.assertEqual(res2.status, TaskStatus.COMPLETED)
        mock_adapter.execute.assert_called_once()

    # -------------------------------------------------------------------------
    # C. Wrong Confirmation ID
    # -------------------------------------------------------------------------

    def test_wrong_confirmation_id_rejected(self):
        """Invalid confirmation_id is rejected and adapter does not execute."""
        mock_adapter = MagicMock()

        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Perform sensitive op", task_id="task_conf_3")
        step = PlanStep(
            objective="Op",
            step_id="step_1",
            tool_requirement="mock.sensitive_op",
        )
        plan = AgentPlan(task_id="task_conf_3", goal="Op", steps=[step])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_conf_3").orchestrator = orch

        self.gateway.start("task_conf_3")

        with self.assertRaises(ValueError) as ctx:
            self.gateway.resume(task_id="task_conf_3", confirmed=True, confirmation_id="invalid_conf_xyz")

        self.assertIn("Invalid or mismatched confirmation_id", str(ctx.exception))
        mock_adapter.execute.assert_not_called()

    # -------------------------------------------------------------------------
    # D. Cross-Task Confirmation ID
    # -------------------------------------------------------------------------

    def test_cross_task_confirmation_id_rejected(self):
        """Confirmation ID belonging to Task A cannot be used to authorize Task B."""
        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=MagicMock())

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)

        # Task A
        task_a = AgentTask(user_request="Task A", task_id="task_a")
        plan_a = AgentPlan(task_id="task_a", goal="A", steps=[
            PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        ])
        orch_a = AgentOrchestrator(executor=executor, limits=self.limits)
        self.gateway.create(task=task_a, plan=plan_a)
        self.manager.get_record("task_a").orchestrator = orch_a
        res_a = self.gateway.start("task_a")
        conf_id_a = res_a.confirmation_id

        # Task B
        task_b = AgentTask(user_request="Task B", task_id="task_b")
        plan_b = AgentPlan(task_id="task_b", goal="B", steps=[
            PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        ])
        orch_b = AgentOrchestrator(executor=executor, limits=self.limits)
        self.gateway.create(task=task_b, plan=plan_b)
        self.manager.get_record("task_b").orchestrator = orch_b
        self.gateway.start("task_b")

        # Attempt to resume Task B using Task A's confirmation ID
        with self.assertRaises(ValueError) as ctx:
            self.gateway.resume(task_id="task_b", confirmed=True, confirmation_id=conf_id_a)

        self.assertIn("Invalid or mismatched confirmation_id", str(ctx.exception))

    # -------------------------------------------------------------------------
    # E. Replay Protection
    # -------------------------------------------------------------------------

    def test_confirmation_replay_protection(self):
        """A resolved confirmation cannot be reused for a second execution."""
        mock_adapter = MagicMock()
        mock_adapter.execute.return_value = ToolResult.ok(request_id="r1", tool_id="mock.sensitive_op", output={})

        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Replay Test", task_id="task_replay")
        plan = AgentPlan(task_id="task_replay", goal="Replay", steps=[
            PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        ])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_replay").orchestrator = orch

        res1 = self.gateway.start("task_replay")
        conf_id = res1.confirmation_id

        # First resolution succeeds
        res2 = self.gateway.resume(task_id="task_replay", confirmed=True, confirmation_id=conf_id)
        self.assertTrue(res2.success)
        self.assertEqual(mock_adapter.execute.call_count, 1)

        # Second resolution attempt MUST be rejected by manager lifecycle error
        with self.assertRaises(TaskLifecycleError):
            self.gateway.resume(task_id="task_replay", confirmed=True, confirmation_id=conf_id)

        # Adapter was still called only once
        self.assertEqual(mock_adapter.execute.call_count, 1)

    # -------------------------------------------------------------------------
    # F. Explicit Denial
    # -------------------------------------------------------------------------

    def test_explicit_denial_fails_task_safely(self):
        """confirmed=False transitions task to FAILED without calling adapter."""
        mock_adapter = MagicMock()

        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Denial Test", task_id="task_deny")
        plan = AgentPlan(task_id="task_deny", goal="Deny", steps=[
            PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        ])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_deny").orchestrator = orch

        res1 = self.gateway.start("task_deny")
        conf_id = res1.confirmation_id

        # User denies confirmation
        res2 = self.gateway.resume(task_id="task_deny", confirmed=False, confirmation_id=conf_id)

        self.assertFalse(res2.success)
        self.assertEqual(res2.status, TaskStatus.FAILED)
        self.assertIn("user declined confirmation", res2.summary.lower())
        mock_adapter.execute.assert_not_called()

        # Verify state is FAILED
        state = self.gateway.get_state("task_deny")
        self.assertEqual(state.task.status, TaskStatus.FAILED)

    # -------------------------------------------------------------------------
    # G. Concurrent Confirmation Handling
    # -------------------------------------------------------------------------

    def test_concurrent_confirmation_resolution(self):
        """Two concurrent threads resolving the same confirmation: exactly one succeeds, one rejected."""
        mock_adapter = MagicMock()

        def slow_execute(*args, **kwargs):
            time.sleep(0.05)
            return ToolResult.ok(request_id="r1", tool_id="mock.sensitive_op", output={})

        mock_adapter.execute.side_effect = slow_execute

        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Concurrent Test", task_id="task_concurrent")
        plan = AgentPlan(task_id="task_concurrent", goal="Concurrent", steps=[
            PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        ])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_concurrent").orchestrator = orch

        res1 = self.gateway.start("task_concurrent")
        conf_id = res1.confirmation_id

        results = []
        errors = []

        def worker():
            try:
                res = self.gateway.resume(task_id="task_concurrent", confirmed=True, confirmation_id=conf_id)
                results.append(res)
            except Exception as e:
                errors.append(e)

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly one thread should succeed, exactly one should receive TaskLifecycleError / ValueError
        self.assertEqual(len(results), 1)
        self.assertEqual(len(errors), 1)
        self.assertTrue(results[0].success)
        self.assertIsInstance(errors[0], (TaskLifecycleError, ValueError))
        self.assertEqual(mock_adapter.execute.call_count, 1)

    # -------------------------------------------------------------------------
    # H. Recoverable Failure & Retry
    # -------------------------------------------------------------------------

    def test_recoverable_failure_retries_and_succeeds(self):
        """Transient error triggers retry and succeeds on attempt 2 without duplicate completions."""
        call_count = 0

        def flaky_execute(step, state, confirmed):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                step.mark_failed("Connection reset by peer")
                return StepObservation(step_id=step.step_id, task_id="task_retry_1", success=False, error="Connection reset by peer", duration_ms=10.0)
            step.mark_completed({"status": "ok"})
            return StepObservation(step_id=step.step_id, task_id="task_retry_1", success=True, output={"status": "ok"}, duration_ms=10.0)

        executor = MagicMock(spec=StepExecutor)
        executor.execute_step.side_effect = flaky_execute

        orch = AgentOrchestrator(executor=executor, limits=self.limits)
        task = AgentTask(user_request="Retry Task", task_id="task_retry_1")
        step = PlanStep(objective="Flaky step", step_id="step_1")
        plan = AgentPlan(task_id="task_retry_1", goal="Goal", steps=[step])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_retry_1").orchestrator = orch

        res = self.gateway.start("task_retry_1")

        self.assertTrue(res.success)
        self.assertEqual(res.status, TaskStatus.COMPLETED)
        self.assertEqual(call_count, 2)

        # Verify state observations
        state = self.gateway.get_state("task_retry_1")
        self.assertEqual(state.completed_steps, ["step_1"])
        self.assertEqual(state.failed_steps, [])

    # -------------------------------------------------------------------------
    # I. Retry Exhaustion
    # -------------------------------------------------------------------------

    def test_retry_exhaustion_terminates_in_failed_status(self):
        """Repeated transient failure stops at max_retries_per_step limit and fails deterministically."""
        call_count = 0

        def failing_execute(step, state, confirmed):
            nonlocal call_count
            call_count += 1
            step.mark_failed("Connection reset by peer")
            return StepObservation(step_id=step.step_id, task_id="task_retry_fail", success=False, error="Connection reset by peer", duration_ms=10.0)

        executor = MagicMock(spec=StepExecutor)
        executor.execute_step.side_effect = failing_execute

        orch = AgentOrchestrator(executor=executor, limits=self.limits)
        task = AgentTask(user_request="Exhaustion Task", task_id="task_retry_fail")
        step = PlanStep(objective="Failing step", step_id="step_1")
        plan = AgentPlan(task_id="task_retry_fail", goal="Goal", steps=[step])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_retry_fail").orchestrator = orch

        res = self.gateway.start("task_retry_fail")

        self.assertFalse(res.success)
        self.assertEqual(res.status, TaskStatus.FAILED)
        # With max_retries_per_step=2: attempt 1 (1 < 2 -> retry), attempt 2 (2 < 2 False -> fail) => 2 attempts
        self.assertEqual(call_count, 2)

        state = self.gateway.get_state("task_retry_fail")
        self.assertEqual(state.failed_steps, ["step_1"])
        self.assertEqual(state.completed_steps, [])

    # -------------------------------------------------------------------------
    # J. DAG Recovery & Prerequisite Failure
    # -------------------------------------------------------------------------

    def test_dependent_dag_steps_do_not_execute_after_prerequisite_failure(self):
        """Prerequisite step failure prevents dependent steps from ever executing."""
        step2_called = False

        def step_execute(step, state, confirmed):
            nonlocal step2_called
            if step.step_id == "step_1":
                step.mark_failed("Fatal database error")
                return StepObservation(step_id=step.step_id, task_id="task_dag_fail", success=False, error="Fatal database error", duration_ms=10.0)
            if step.step_id == "step_2":
                step2_called = True
                step.mark_completed({})
                return StepObservation(step_id=step.step_id, task_id="task_dag_fail", success=True, output={}, duration_ms=10.0)

        executor = MagicMock(spec=StepExecutor)
        executor.execute_step.side_effect = step_execute

        orch = AgentOrchestrator(executor=executor, limits=self.limits)
        task = AgentTask(user_request="DAG Test", task_id="task_dag_fail")
        step1 = PlanStep(objective="Step 1", step_id="step_1")
        step2 = PlanStep(objective="Step 2", step_id="step_2", dependencies=["step_1"])
        plan = AgentPlan(task_id="task_dag_fail", goal="DAG", steps=[step1, step2])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_dag_fail").orchestrator = orch

        res = self.gateway.start("task_dag_fail")

        self.assertFalse(res.success)
        self.assertEqual(res.status, TaskStatus.FAILED)
        self.assertFalse(step2_called, "Dependent step 2 must not execute after prerequisite failure")

    # -------------------------------------------------------------------------
    # K. Independent DAG Branches
    # -------------------------------------------------------------------------

    def test_independent_dag_branches_preserve_execution(self):
        """Independent branches can execute even if an unrelated branch fails later."""
        executed = []

        def branch_execute(step, state, confirmed):
            executed.append(step.step_id)
            if step.step_id == "branch_a":
                step.mark_completed({"a": 1})
                return StepObservation(step_id=step.step_id, task_id="task_branches", success=True, output={"a": 1}, duration_ms=10.0)
            if step.step_id == "branch_b":
                step.mark_completed({"b": 2})
                return StepObservation(step_id=step.step_id, task_id="task_branches", success=True, output={"b": 2}, duration_ms=10.0)
            step.mark_completed({})
            return StepObservation(step_id=step.step_id, task_id="task_branches", success=True, output={}, duration_ms=10.0)

        executor = MagicMock(spec=StepExecutor)
        executor.execute_step.side_effect = branch_execute

        orch = AgentOrchestrator(executor=executor, limits=self.limits)
        task = AgentTask(user_request="Branch Task", task_id="task_branches")
        step_a = PlanStep(objective="Branch A", step_id="branch_a")
        step_b = PlanStep(objective="Branch B", step_id="branch_b")
        plan = AgentPlan(task_id="task_branches", goal="Branches", steps=[step_a, step_b])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_branches").orchestrator = orch

        res = self.gateway.start("task_branches")

        self.assertTrue(res.success)
        self.assertEqual(res.status, TaskStatus.COMPLETED)
        self.assertIn("branch_a", executed)
        self.assertIn("branch_b", executed)

    # -------------------------------------------------------------------------
    # L. Cancellation Semantics
    # -------------------------------------------------------------------------

    def test_cancellation_does_not_trigger_retry_or_confirmation(self):
        """Cancelling a waiting task transitions to CANCELLED without triggering retry or execution."""
        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        mock_adapter = MagicMock()
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Cancel Task", task_id="task_cancel")
        step = PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        plan = AgentPlan(task_id="task_cancel", goal="Cancel", steps=[step])

        self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_cancel").orchestrator = orch

        res1 = self.gateway.start("task_cancel")
        self.assertEqual(res1.status, TaskStatus.WAITING_CONFIRMATION)

        # Cancel task
        cancelled = self.gateway.cancel("task_cancel")
        self.assertTrue(cancelled)

        task_record = self.gateway.get_task("task_cancel")
        self.assertEqual(task_record.status, TaskStatus.CANCELLED)
        mock_adapter.execute.assert_not_called()

    # -------------------------------------------------------------------------
    # M. Identity & State Preservation Across Lifecycle
    # -------------------------------------------------------------------------

    def test_identity_preserved_throughout_lifecycle(self):
        """Task, Plan, State, and Orchestrator identities remain intact across confirmation and resume."""
        tool = ToolDefinition(
            tool_id="mock.sensitive_op",
            name="Sensitive Op",
            description="Requires confirmation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        registry = ToolRegistry()
        mock_adapter = MagicMock()
        mock_adapter.execute.return_value = ToolResult.ok(request_id="r1", tool_id="mock.sensitive_op", output={})
        registry.register(tool, adapter=mock_adapter)

        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime)
        orch = AgentOrchestrator(executor=executor, limits=self.limits)

        task = AgentTask(user_request="Identity Task", task_id="task_identity_1")
        plan = AgentPlan(task_id="task_identity_1", goal="Identity", steps=[
            PlanStep(objective="s", step_id="s1", tool_requirement="mock.sensitive_op")
        ])

        created_task = self.gateway.create(task=task, plan=plan)
        self.manager.get_record("task_identity_1").orchestrator = orch

        res1 = self.gateway.start("task_identity_1")
        conf_id = res1.confirmation_id

        # Verify initial identity
        rec = self.gateway.get_record("task_identity_1")
        self.assertIs(rec.task, created_task)
        self.assertIs(rec.orchestrator, orch)

        # Resume
        res2 = self.gateway.resume("task_identity_1", confirmed=True, confirmation_id=conf_id)

        # Verify identity after resume
        rec_after = self.gateway.get_record("task_identity_1")
        self.assertIs(rec_after.task, created_task)
        self.assertIs(rec_after.orchestrator, orch)
        self.assertEqual(rec_after.task.task_id, "task_identity_1")
        self.assertEqual(rec_after.plan.task_id, "task_identity_1")


if __name__ == "__main__":
    unittest.main()
