"""
Unit & Integration Tests for AgentExecutionGateway in Fluffy Assistant
"""

import unittest
from unittest.mock import MagicMock, patch

from brain.agent.gateway import (
    AgentExecutionGateway,
    GatewayError,
    GatewayIdentityError,
    GatewayValidationError,
    get_agent_gateway,
    set_agent_gateway,
)
from brain.agent.interface import AgentResult
from brain.agent.manager import (
    AgentTaskManager,
    TaskNotFoundError,
    TaskLifecycleError,
    set_task_manager,
)
from brain.agent.observation import StepObservation
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus


class TestAgentExecutionGateway(unittest.TestCase):
    """Test suite for AgentExecutionGateway."""

    def setUp(self):
        # Create an isolated task manager for testing
        self.task_manager = AgentTaskManager(max_history=10)
        self.gateway = AgentExecutionGateway(task_manager=self.task_manager)

    def tearDown(self):
        set_task_manager(None)
        set_agent_gateway(None)

    # -------------------------------------------------------------------------
    # A. Gateway Creation & Registration
    # -------------------------------------------------------------------------

    def test_create_with_agent_task_and_plan(self):
        """Verify registering a valid AgentTask and matching AgentPlan."""
        task = AgentTask(
            user_request="Launch app",
            goal="Launch Notepad",
            task_id="task_calc_01",
        )
        plan = AgentPlan(
            task_id="task_calc_01",
            goal="Launch Notepad",
            steps=[PlanStep(objective="Launch Notepad", step_id="step_1")],
        )

        registered_task = self.gateway.create(task=task, plan=plan)

        self.assertEqual(registered_task.task_id, "task_calc_01")
        self.assertEqual(self.gateway.get_task("task_calc_01"), task)
        self.assertEqual(self.gateway.get_plan("task_calc_01"), plan)
        self.assertIsInstance(self.gateway.get_orchestrator("task_calc_01"), AgentOrchestrator)

    def test_create_from_string_request(self):
        """Verify creating a task from a string request via gateway."""
        task = self.gateway.create(
            task="Check disk space",
            goal="Check free storage",
            task_id="task_disk_01",
            context={"tool": "storage"},
        )

        self.assertEqual(task.task_id, "task_disk_01")
        self.assertEqual(task.user_request, "Check disk space")
        self.assertEqual(self.gateway.get_task("task_disk_01"), task)

    def test_create_empty_request_raises_validation_error(self):
        """Verify empty string request raises GatewayValidationError."""
        with self.assertRaises(GatewayValidationError):
            self.gateway.create(task="")

        with self.assertRaises(GatewayValidationError):
            self.gateway.create(task=12345)  # Invalid type

    # -------------------------------------------------------------------------
    # B. Identity Mismatch Validation
    # -------------------------------------------------------------------------

    def test_identity_mismatch_raises_gateway_identity_error(self):
        """Verify identity mismatch between task and plan is rejected deterministically."""
        task = AgentTask(user_request="Action A", task_id="task_A")
        plan = AgentPlan(task_id="task_B", goal="Action A", steps=[PlanStep(objective="Action A", step_id="step_1")])

        with self.assertRaises(GatewayIdentityError) as ctx:
            self.gateway.create(task=task, plan=plan)

        self.assertEqual(ctx.exception.task_id, "task_A")
        self.assertEqual(ctx.exception.plan_task_id, "task_B")

        # Verify task was NOT registered in manager
        self.assertIsNone(self.gateway.get_task("task_A"))
        self.assertIsNone(self.gateway.get_task("task_B"))

    def test_invalid_plan_dag_rejected_by_gateway(self):
        """Verify cyclic plan is rejected by PlanValidator at gateway boundary."""
        task = AgentTask(user_request="Cyclic task", task_id="task_cyclic")
        step1 = PlanStep(objective="S1", step_id="step_1", dependencies=["step_2"])
        step2 = PlanStep(objective="S2", step_id="step_2", dependencies=["step_1"])
        plan = AgentPlan(task_id="task_cyclic", goal="Cyclic task", steps=[step1, step2])

        with self.assertRaises(GatewayValidationError) as ctx:
            self.gateway.create(task=task, plan=plan)

        self.assertIn("Cyclic dependency detected", ctx.exception.details.get("error", ""))
        self.assertIsNone(self.gateway.get_task("task_cyclic"))

    # -------------------------------------------------------------------------
    # C. Start Delegation
    # -------------------------------------------------------------------------

    def test_start_delegates_to_task_manager(self):
        """Verify start() invokes start_task on the manager using the persistent orchestrator."""
        task = self.gateway.create(task="Execute test action", task_id="task_exec_01")
        orch = self.gateway.get_orchestrator("task_exec_01")

        mock_result = AgentResult(
            task_id="task_exec_01",
            status=TaskStatus.COMPLETED,
            success=True,
            summary="Execution finished.",
        )

        with patch.object(orch, "run", return_value=mock_result) as mock_run:
            result = self.gateway.start("task_exec_01")

            mock_run.assert_called_once_with(task=task, plan=None)
            self.assertTrue(result.success)
            self.assertEqual(result.summary, "Execution finished.")
            self.assertEqual(self.gateway.get_result("task_exec_01"), mock_result)

    # -------------------------------------------------------------------------
    # D. WAITING_CONFIRMATION & Resume
    # -------------------------------------------------------------------------

    def test_start_to_waiting_confirmation_and_resume_flow(self):
        """
        Verify controlled WAITING_CONFIRMATION scenario:
        gateway.start() -> WAITING_CONFIRMATION -> gateway.resume() -> same orchestrator instance.
        """
        task = self.gateway.create(task="Delete database row", task_id="task_db_del")
        orig_orch = self.gateway.get_orchestrator("task_db_del")

        call_count = 0

        def mock_execute_step(step, state, confirmed=False):
            nonlocal call_count
            call_count += 1
            if not confirmed:
                return StepObservation(
                    step_id=step.step_id,
                    task_id=task.task_id,
                    success=False,
                    metadata={
                        "waiting_confirmation": True,
                        "confirmation_id": "conf_db_01",
                        "message": "Confirm deletion",
                    },
                )
            else:
                step.mark_completed({"deleted": True})
                return StepObservation(
                    step_id=step.step_id,
                    task_id=task.task_id,
                    success=True,
                    output={"deleted": True},
                )

        with patch.object(orig_orch.executor, "execute_step", side_effect=mock_execute_step):
            # 1. Start execution -> suspends in WAITING_CONFIRMATION
            res1 = self.gateway.start("task_db_del")
            self.assertTrue(res1.waiting_confirmation)
            self.assertEqual(self.gateway.get_task("task_db_del").status, TaskStatus.WAITING_CONFIRMATION)

            # 2. Verify SAME orchestrator instance is retained
            self.assertIs(self.gateway.get_orchestrator("task_db_del"), orig_orch)

            # 3. Resume via gateway
            res2 = self.gateway.resume("task_db_del", confirmed=True, confirmation_id="conf_db_01")
            self.assertTrue(res2.success)
            self.assertEqual(self.gateway.get_task("task_db_del").status, TaskStatus.COMPLETED)
            self.assertEqual(call_count, 2)

    # -------------------------------------------------------------------------
    # E. Cancellation
    # -------------------------------------------------------------------------

    def test_cancel_delegates_to_manager(self):
        """Verify cancel() delegates directly to manager and orchestrator."""
        task = self.gateway.create(task="Task to cancel", task_id="task_cancel_01")
        orch = self.gateway.get_orchestrator("task_cancel_01")

        with patch.object(orch, "cancel", return_value=True) as mock_cancel:
            cancelled = self.gateway.cancel("task_cancel_01")
            mock_cancel.assert_called_once_with("task_cancel_01")
            self.assertTrue(cancelled)

    # -------------------------------------------------------------------------
    # F. Lookup Accessors & Listing
    # -------------------------------------------------------------------------

    def test_read_only_lookups_resolve_through_manager(self):
        """Verify get_task, get_state, get_plan, get_result, get_record, list_active_tasks."""
        t1 = self.gateway.create("Task One", task_id="t1")
        t1.status = TaskStatus.EXECUTING

        t2 = self.gateway.create("Task Two", task_id="t2")
        t2.status = TaskStatus.COMPLETED

        self.assertEqual(self.gateway.get_task("t1"), t1)
        self.assertIsNotNone(self.gateway.get_record("t1"))
        self.assertIsNone(self.gateway.get_task("nonexistent_task"))

        active = self.gateway.list_active_tasks()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].task_id, "t1")

        all_tasks = self.gateway.list_tasks()
        self.assertEqual(len(all_tasks), 2)

    # -------------------------------------------------------------------------
    # G. Error Propagation
    # -------------------------------------------------------------------------

    def test_error_propagation_for_unknown_task_and_lifecycle(self):
        """Verify domain errors from manager propagate through the gateway."""
        with self.assertRaises(TaskNotFoundError):
            self.gateway.start("unknown_task_id")

        with self.assertRaises(TaskNotFoundError):
            self.gateway.cancel("unknown_task_id")

        with self.assertRaises(TaskNotFoundError):
            self.gateway.resume("unknown_task_id", confirmed=True)

        task = self.gateway.create(task="Normal task", task_id="t_norm")
        task.status = TaskStatus.COMPLETED

        with self.assertRaises(TaskLifecycleError):
            self.gateway.start("t_norm")

    # -------------------------------------------------------------------------
    # H. No Duplicate Registry
    # -------------------------------------------------------------------------

    def test_gateway_has_no_independent_task_registry(self):
        """Verify AgentExecutionGateway contains no internal task dict or duplicate storage."""
        gw_attrs = vars(self.gateway)
        self.assertEqual(list(gw_attrs.keys()), ["task_manager"])

    # -------------------------------------------------------------------------
    # I. Singleton Behavior & Injection
    # -------------------------------------------------------------------------

    def test_singleton_getter_and_setter(self):
        """Verify get_agent_gateway and set_agent_gateway singleton access."""
        gw1 = get_agent_gateway()
        gw2 = get_agent_gateway()
        self.assertIs(gw1, gw2)

        custom_gw = AgentExecutionGateway(task_manager=self.task_manager)
        set_agent_gateway(custom_gw)
        self.assertIs(get_agent_gateway(), custom_gw)


if __name__ == "__main__":
    unittest.main()
