"""
Unit & Integration Tests for Persistent AgentTaskManager in Fluffy Assistant
"""

import threading
import time
import unittest
from unittest.mock import MagicMock, patch

from brain.agent.contracts import ExecutionStatus
from brain.agent.interface import AgentResult
from brain.agent.manager import (
    AgentTaskManager,
    TaskRecord,
    TaskManagerError,
    TaskNotFoundError,
    TaskLifecycleError,
    get_task_manager,
    set_task_manager,
)
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus


class TestAgentTaskManager(unittest.TestCase):
    """Test suite for AgentTaskManager lifecycle management."""

    def setUp(self):
        self.manager = AgentTaskManager(max_history=5)

    def tearDown(self):
        set_task_manager(None)

    # -------------------------------------------------------------------------
    # 1. Task Registration & Identity
    # -------------------------------------------------------------------------

    def test_create_task_preserves_canonical_task_id(self):
        """Verify task creation assigns and preserves a single canonical task ID."""
        task = self.manager.create_task(
            user_request="Launch app",
            goal="Launch Notepad",
            task_id="task_custom_123",
            context={"app": "notepad"},
        )

        self.assertIsInstance(task, AgentTask)
        self.assertEqual(task.task_id, "task_custom_123")
        self.assertEqual(task.goal, "Launch Notepad")

        # Verify retrieval via manager
        retrieved_task = self.manager.get_task("task_custom_123")
        self.assertIsNotNone(retrieved_task)
        self.assertEqual(retrieved_task.task_id, "task_custom_123")

        # Verify orchestrator binding exists
        orchestrator = self.manager.get_orchestrator("task_custom_123")
        self.assertIsInstance(orchestrator, AgentOrchestrator)

    def test_register_existing_task(self):
        """Verify registering a pre-instantiated AgentTask."""
        existing_task = AgentTask(
            user_request="Scan wifi",
            task_id="task_wifi_01",
        )
        plan = AgentPlan(
            task_id="task_wifi_01",
            goal="Scan wifi",
            steps=[PlanStep(objective="Scan wifi", step_id="step_1")],
        )

        registered = self.manager.register_task(existing_task, plan=plan)
        self.assertEqual(registered.task_id, "task_wifi_01")
        self.assertEqual(self.manager.get_plan("task_wifi_01"), plan)

    def test_get_nonexistent_task(self):
        """Verify get_task and get_state return None for unknown task IDs."""
        self.assertIsNone(self.manager.get_task("nonexistent_id"))
        self.assertIsNone(self.manager.get_state("nonexistent_id"))
        self.assertIsNone(self.manager.get_orchestrator("nonexistent_id"))
        self.assertIsNone(self.manager.get_plan("nonexistent_id"))
        self.assertIsNone(self.manager.get_result("nonexistent_id"))

    # -------------------------------------------------------------------------
    # 2. Execution & Duplicate Start Protection
    # -------------------------------------------------------------------------

    def test_start_task_success(self):
        """Verify start_task runs through the bound orchestrator and records state."""
        task = self.manager.create_task(user_request="Test execution")
        
        # Mock executor inside the orchestrator to avoid real OS/tools
        orch = self.manager.get_orchestrator(task.task_id)
        mock_result = AgentResult(
            task_id=task.task_id,
            status=TaskStatus.COMPLETED,
            success=True,
            summary="Test completed.",
        )
        with patch.object(orch, "run", return_value=mock_result) as mock_run:
            result = self.manager.start_task(task.task_id)

            mock_run.assert_called_once_with(task=task, plan=None)
            self.assertTrue(result.success)
            self.assertEqual(result.summary, "Test completed.")
            self.assertEqual(self.manager.get_result(task.task_id), mock_result)

    def test_start_unknown_task_raises_not_found(self):
        """Verify starting an unknown task raises TaskNotFoundError."""
        with self.assertRaises(TaskNotFoundError):
            self.manager.start_task("unknown_task_xyz")

    def test_duplicate_start_prevention(self):
        """Verify starting an already running or terminal task raises TaskLifecycleError."""
        task = self.manager.create_task(user_request="Long running task")
        orch = self.manager.get_orchestrator(task.task_id)

        # Simulate task execution in progress
        record = self.manager.get_record(task.task_id)
        record.is_running = True

        with self.assertRaises(TaskLifecycleError) as ctx:
            self.manager.start_task(task.task_id)
        self.assertIn("already running", str(ctx.exception))

        # Reset running flag and mark terminal
        record.is_running = False
        task.status = TaskStatus.COMPLETED

        with self.assertRaises(TaskLifecycleError) as ctx2:
            self.manager.start_task(task.task_id)
        self.assertIn("terminal status", str(ctx2.exception))

    # -------------------------------------------------------------------------
    # 3. Cancellation Handling
    # -------------------------------------------------------------------------

    def test_cancel_task(self):
        """Verify cancelling an active task delegates to its orchestrator."""
        task = self.manager.create_task(user_request="Task to cancel")
        orch = self.manager.get_orchestrator(task.task_id)

        with patch.object(orch, "cancel", return_value=True) as mock_cancel:
            cancelled = self.manager.cancel_task(task.task_id)
            mock_cancel.assert_called_once_with(task.task_id)
            self.assertTrue(cancelled)

    def test_cancel_unknown_task_raises_not_found(self):
        """Verify cancelling an unknown task raises TaskNotFoundError."""
        with self.assertRaises(TaskNotFoundError):
            self.manager.cancel_task("unknown_cancel_id")

    # -------------------------------------------------------------------------
    # 4. Confirmation & Resume Handling
    # -------------------------------------------------------------------------

    def test_resume_task_confirmed_true(self):
        """Verify resuming a suspended task with confirmed=True uses existing orchestrator."""
        task = self.manager.create_task(user_request="Sensitive task")
        task.status = TaskStatus.WAITING_CONFIRMATION
        orch = self.manager.get_orchestrator(task.task_id)

        mock_resume_result = AgentResult(
            task_id=task.task_id,
            status=TaskStatus.COMPLETED,
            success=True,
            summary="Step confirmed and executed.",
        )

        with patch.object(orch, "resume", return_value=mock_resume_result) as mock_resume:
            result = self.manager.resume_task(task.task_id, confirmed=True, confirmation_id="conf_123")

            mock_resume.assert_called_once_with(
                task_id=task.task_id,
                confirmed=True,
                confirmation_id="conf_123",
            )
            self.assertTrue(result.success)
            self.assertEqual(result.summary, "Step confirmed and executed.")

    def test_resume_task_confirmed_false(self):
        """Verify resuming a suspended task with confirmed=False uses existing orchestrator."""
        task = self.manager.create_task(user_request="Dangerous operation")
        task.status = TaskStatus.WAITING_CONFIRMATION
        orch = self.manager.get_orchestrator(task.task_id)

        mock_declined_result = AgentResult(
            task_id=task.task_id,
            status=TaskStatus.FAILED,
            success=False,
            summary="User declined confirmation.",
        )

        with patch.object(orch, "resume", return_value=mock_declined_result) as mock_resume:
            result = self.manager.resume_task(task.task_id, confirmed=False)

            mock_resume.assert_called_once_with(
                task_id=task.task_id,
                confirmed=False,
                confirmation_id=None,
            )
            self.assertFalse(result.success)

    def test_resume_non_waiting_task_raises_lifecycle_error(self):
        """Verify resuming a task not in WAITING_CONFIRMATION raises TaskLifecycleError."""
        task = self.manager.create_task(user_request="Normal task")
        task.status = TaskStatus.CREATED

        with self.assertRaises(TaskLifecycleError) as ctx:
            self.manager.resume_task(task.task_id, confirmed=True)
        self.assertIn("expected WAITING_CONFIRMATION", str(ctx.exception))

    def test_end_to_end_waiting_confirmation_and_resume(self):
        """
        Critical test:
        1. create task
        2. start task -> orchestrator enters WAITING_CONFIRMATION
        3. start_task returns intermediate result
        4. manager retains task and identical orchestrator instance
        5. resume_task(confirmed=True) uses SAME orchestrator and finishes
        """
        task = self.manager.create_task(user_request="Critical delete action")
        orig_orch = self.manager.get_orchestrator(task.task_id)

        # Mock executor to trigger confirmation on first attempt, then succeed on resume
        step_exec = orig_orch.executor
        call_count = 0

        def mock_execute_step(step, state, confirmed=False):
            nonlocal call_count
            call_count += 1
            if not confirmed:
                from brain.agent.observation import StepObservation
                return StepObservation(
                    step_id=step.step_id,
                    task_id=task.task_id,
                    success=False,
                    metadata={
                        "waiting_confirmation": True,
                        "confirmation_id": "conf_xyz",
                        "message": "Please confirm delete",
                    },
                )
            else:
                from brain.agent.observation import StepObservation
                step.mark_completed({"deleted": True})
                return StepObservation(
                    step_id=step.step_id,
                    task_id=task.task_id,
                    success=True,
                    output={"deleted": True},
                )

        with patch.object(step_exec, "execute_step", side_effect=mock_execute_step):
            # 1. Start task -> stops in WAITING_CONFIRMATION
            res1 = self.manager.start_task(task.task_id)
            self.assertTrue(res1.waiting_confirmation)
            self.assertEqual(task.status, TaskStatus.WAITING_CONFIRMATION)

            # 2. Manager retains the task and the EXACT same orchestrator instance
            self.assertIsNotNone(self.manager.get_task(task.task_id))
            self.assertIs(self.manager.get_orchestrator(task.task_id), orig_orch)

            # 3. Resume task with confirmed=True
            res2 = self.manager.resume_task(task.task_id, confirmed=True, confirmation_id="conf_xyz")
            self.assertTrue(res2.success)
            self.assertEqual(task.status, TaskStatus.COMPLETED)
            self.assertEqual(call_count, 2)

    def test_concurrent_duplicate_resume_protection(self):
        """Verify concurrent resume attempts on the same task allow only one continuation."""
        task = self.manager.create_task(user_request="Sensitive task")
        task.status = TaskStatus.WAITING_CONFIRMATION
        orch = self.manager.get_orchestrator(task.task_id)

        resume_count = 0
        lock = threading.Lock()

        def slow_resume(*args, **kwargs):
            nonlocal resume_count
            with lock:
                resume_count += 1
            time.sleep(0.05)
            return AgentResult(task_id=task.task_id, status=TaskStatus.COMPLETED, success=True, summary="Resumed")

        results = []
        errors = []

        def worker():
            try:
                res = self.manager.resume_task(task.task_id, confirmed=True)
                results.append(res)
            except Exception as e:
                errors.append(e)

        with patch.object(orch, "resume", side_effect=slow_resume):
            t1 = threading.Thread(target=worker)
            t2 = threading.Thread(target=worker)
            t1.start()
            t2.start()
            t1.join()
            t2.join()

        self.assertEqual(resume_count, 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], TaskLifecycleError)

    # -------------------------------------------------------------------------
    # 5. List & Removal Operations
    # -------------------------------------------------------------------------

    def test_list_active_and_filtered_tasks(self):
        """Verify list_active_tasks and list_tasks filter correctly."""
        t1 = self.manager.create_task("Task 1")
        t1.status = TaskStatus.READY

        t2 = self.manager.create_task("Task 2")
        t2.status = TaskStatus.WAITING_CONFIRMATION

        t3 = self.manager.create_task("Task 3")
        t3.status = TaskStatus.COMPLETED

        active = self.manager.list_active_tasks()
        active_ids = [t.task_id for t in active]
        self.assertIn(t1.task_id, active_ids)
        self.assertIn(t2.task_id, active_ids)
        self.assertNotIn(t3.task_id, active_ids)

        completed = self.manager.list_tasks(status=TaskStatus.COMPLETED)
        self.assertEqual(len(completed), 1)
        self.assertEqual(completed[0].task_id, t3.task_id)

    def test_remove_task(self):
        """Verify explicit removal of completed task."""
        task = self.manager.create_task("Removable task")
        task.status = TaskStatus.COMPLETED

        self.assertTrue(self.manager.remove_task(task.task_id))
        self.assertIsNone(self.manager.get_task(task.task_id))
        self.assertFalse(self.manager.remove_task(task.task_id))

    def test_remove_running_task_raises_error(self):
        """Verify removing an active running task raises TaskLifecycleError."""
        task = self.manager.create_task("Running task")
        record = self.manager.get_record(task.task_id)
        record.is_running = True

        with self.assertRaises(TaskLifecycleError):
            self.manager.remove_task(task.task_id)

    # -------------------------------------------------------------------------
    # 6. Retention & Pruning Policy
    # -------------------------------------------------------------------------

    def test_bounded_retention_pruning(self):
        """Verify completed tasks are pruned beyond max_history, while active tasks survive."""
        manager = AgentTaskManager(max_history=3)

        # Create 2 active tasks
        active1 = manager.create_task("Active 1")
        active1.status = TaskStatus.EXECUTING

        active2 = manager.create_task("Active 2")
        active2.status = TaskStatus.WAITING_CONFIRMATION

        # Create 5 finished tasks
        finished_ids = []
        for i in range(5):
            t = manager.create_task(f"Finished {i}")
            t.status = TaskStatus.COMPLETED
            finished_ids.append(t.task_id)
            time.sleep(0.005)  # Ensure distinct updated_at timestamps

        # Force a prune check
        with manager._lock:
            manager._prune_history_locked()

        # Active tasks must NEVER be pruned
        self.assertIsNotNone(manager.get_task(active1.task_id))
        self.assertIsNotNone(manager.get_task(active2.task_id))

        # Finished tasks must be bounded to 3 (the 3 newest ones)
        retained_finished = [
            tid for tid in finished_ids if manager.get_task(tid) is not None
        ]
        self.assertEqual(len(retained_finished), 3)
        self.assertEqual(retained_finished, finished_ids[-3:])

    # -------------------------------------------------------------------------
    # 7. Thread Safety & Concurrency
    # -------------------------------------------------------------------------

    def test_concurrent_duplicate_start_protection(self):
        """Verify concurrent start attempts on the same task result in only one execution."""
        task = self.manager.create_task(user_request="Concurrent task")
        orch = self.manager.get_orchestrator(task.task_id)

        execution_count = 0
        lock = threading.Lock()

        def slow_run(*args, **kwargs):
            nonlocal execution_count
            with lock:
                execution_count += 1
            time.sleep(0.05)
            return AgentResult(task_id=task.task_id, status=TaskStatus.COMPLETED, success=True, summary="Done")

        results = []
        errors = []

        def worker():
            try:
                res = self.manager.start_task(task.task_id)
                results.append(res)
            except Exception as e:
                errors.append(e)

        with patch.object(orch, "run", side_effect=slow_run):
            t1 = threading.Thread(target=worker)
            t2 = threading.Thread(target=worker)
            t1.start()
            t2.start()
            t1.join()
            t2.join()

        self.assertEqual(execution_count, 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], TaskLifecycleError)

    def test_global_singleton_getter_and_setter(self):
        """Verify get_task_manager and set_task_manager singleton behaviors."""
        tm1 = get_task_manager()
        tm2 = get_task_manager()
        self.assertIs(tm1, tm2)

        custom_tm = AgentTaskManager(max_history=10)
        set_task_manager(custom_tm)
        self.assertIs(get_task_manager(), custom_tm)


if __name__ == "__main__":
    unittest.main()
