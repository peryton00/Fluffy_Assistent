"""
Unit Tests for Canonical PlanCompiler in Fluffy Assistant
"""

import unittest
from unittest.mock import patch, MagicMock

from brain.agent.compiler import PlanCompiler, PlanCompilationError
from brain.agent.llm_command_parser import CommandUnderstanding
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask
from brain.agent.orchestrator import AgentOrchestrator


class TestPlanCompiler(unittest.TestCase):
    """Test suite for PlanCompiler pipeline."""

    def setUp(self):
        self.compiler = PlanCompiler(max_steps=10)

    # -------------------------------------------------------------------------
    # 1. Single-Step Compilation Tests
    # -------------------------------------------------------------------------

    def test_single_step_compilation(self):
        """Test compiling a single-step CommandUnderstanding."""
        understanding = CommandUnderstanding({
            "intent": "open_app",
            "parameters": {"app_name": "notepad", "tool_requirement": "rust:System.LaunchApp"},
            "text": "Open notepad",
            "original_text": "please open notepad",
        })

        plan = self.compiler.compile(understanding, task_id="task_100")

        self.assertIsInstance(plan, AgentPlan)
        self.assertEqual(plan.task_id, "task_100")
        self.assertEqual(plan.goal, "please open notepad")
        self.assertEqual(len(plan.steps), 1)

        step = plan.steps[0]
        self.assertEqual(step.step_id, "step_1")
        self.assertEqual(step.objective, "Open notepad")
        self.assertEqual(step.tool_requirement, "rust:System.LaunchApp")
        self.assertEqual(step.input_parameters, {"app_name": "notepad", "tool_requirement": "rust:System.LaunchApp"})
        self.assertEqual(step.dependencies, [])
        self.assertEqual(step.status, StepStatus.PENDING)

        # Ensure plan validates
        is_valid, err = PlanValidator.validate(plan)
        self.assertTrue(is_valid, f"Validation failed: {err}")

    def test_single_step_from_dict(self):
        """Test compiling a single-step dict representation."""
        data = {
            "intent": "system_info",
            "parameters": {"detailed": True},
            "text": "Get system information",
        }

        plan = self.compiler.compile(data)
        self.assertEqual(len(plan.steps), 1)
        self.assertEqual(plan.steps[0].step_id, "step_1")
        self.assertEqual(plan.steps[0].tool_requirement, "system_info")
        self.assertEqual(plan.steps[0].input_parameters, {"detailed": True})

    # -------------------------------------------------------------------------
    # 2. Multi-Step Compilation Tests
    # -------------------------------------------------------------------------

    def test_multi_step_sequential_dependencies(self):
        """
        Verify multi-step compilation creates deterministic sequential dependencies:
        A depends on []
        B depends on [A]
        C depends on [B]
        """
        understanding = CommandUnderstanding({
            "intent": "multi_step",
            "parameters": {},
            "steps": [
                {"intent": "search_files", "parameters": {"pattern": "*.pdf"}, "text": "Find PDFs"},
                {"intent": "read_file", "parameters": {"path": "doc.pdf"}, "text": "Extract text"},
                {"intent": "summarize", "parameters": {"max_words": 100}, "text": "Generate summary"},
            ],
            "text": "Find PDFs, extract text, and summarize",
            "original_text": "Find PDFs, extract text, and summarize",
        })

        plan = self.compiler.compile(understanding, task_id="task_multi")

        self.assertEqual(len(plan.steps), 3)

        step_a, step_b, step_c = plan.steps

        # Verify step IDs
        self.assertEqual(step_a.step_id, "step_1")
        self.assertEqual(step_b.step_id, "step_2")
        self.assertEqual(step_c.step_id, "step_3")

        # Verify objectives and parameters survived
        self.assertEqual(step_a.objective, "Find PDFs")
        self.assertEqual(step_a.input_parameters, {"pattern": "*.pdf"})
        self.assertEqual(step_b.objective, "Extract text")
        self.assertEqual(step_b.input_parameters, {"path": "doc.pdf"})
        self.assertEqual(step_c.objective, "Generate summary")
        self.assertEqual(step_c.input_parameters, {"max_words": 100})

        # Verify deterministic sequential dependencies
        self.assertEqual(step_a.dependencies, [])
        self.assertEqual(step_b.dependencies, ["step_1"])
        self.assertEqual(step_c.dependencies, ["step_2"])

        # Validate DAG
        is_valid, err = PlanValidator.validate(plan)
        self.assertTrue(is_valid, f"Multi-step plan validation failed: {err}")

    def test_multi_step_with_primitive_strings(self):
        """Test multi-step compilation when steps are plain strings."""
        understanding = CommandUnderstanding({
            "intent": "multi_step",
            "steps": ["Step A: Download", "Step B: Process", "Step C: Clean up"],
            "text": "Multi-step primitive task",
        })

        plan = self.compiler.compile(understanding)
        self.assertEqual(len(plan.steps), 3)
        self.assertEqual(plan.steps[0].objective, "Step A: Download")
        self.assertEqual(plan.steps[0].dependencies, [])
        self.assertEqual(plan.steps[1].objective, "Step B: Process")
        self.assertEqual(plan.steps[1].dependencies, ["step_1"])
        self.assertEqual(plan.steps[2].objective, "Step C: Clean up")
        self.assertEqual(plan.steps[2].dependencies, ["step_2"])

    # -------------------------------------------------------------------------
    # 3. Explicit Dependencies Tests
    # -------------------------------------------------------------------------

    def test_explicit_dependencies_preserved(self):
        """Verify explicit dependencies in parser steps are preserved accurately."""
        understanding = CommandUnderstanding({
            "intent": "multi_step",
            "steps": [
                {"intent": "step_a", "text": "Task A", "dependencies": []},
                {"intent": "step_b", "text": "Task B", "dependencies": []},  # independent from A
                {"intent": "step_c", "text": "Task C", "dependencies": ["step_1", "step_2"]},  # joins A and B
            ],
            "text": "Join pattern task",
        })

        plan = self.compiler.compile(understanding)
        self.assertEqual(len(plan.steps), 3)
        self.assertEqual(plan.steps[0].dependencies, [])
        self.assertEqual(plan.steps[1].dependencies, [])
        self.assertEqual(plan.steps[2].dependencies, ["step_1", "step_2"])

        is_valid, err = PlanValidator.validate(plan)
        self.assertTrue(is_valid, f"DAG with diamond/join dependencies failed validation: {err}")

    # -------------------------------------------------------------------------
    # 4. Step IDs Determinism
    # -------------------------------------------------------------------------

    def test_step_ids_deterministic_and_unique(self):
        """Verify compiled step IDs are deterministic, unique, and strictly structured."""
        raw_steps = [{"text": f"Action {i}"} for i in range(5)]
        understanding = CommandUnderstanding({"intent": "multi_step", "steps": raw_steps})

        plan1 = self.compiler.compile(understanding, task_id="t1")
        plan2 = self.compiler.compile(understanding, task_id="t2")

        ids1 = [s.step_id for s in plan1.steps]
        ids2 = [s.step_id for s in plan2.steps]

        expected = ["step_1", "step_2", "step_3", "step_4", "step_5"]
        self.assertEqual(ids1, expected)
        self.assertEqual(ids2, expected)
        self.assertEqual(len(set(ids1)), 5)

    # -------------------------------------------------------------------------
    # 5. Clarification Handling
    # -------------------------------------------------------------------------

    def test_clarification_needed_raises_error(self):
        """Verify needs_clarification=True raises PlanCompilationError with clarification_needed."""
        understanding = CommandUnderstanding({
            "intent": "unknown",
            "needs_clarification": True,
            "text": "Did you mean open Chrome or Firefox?",
            "original_text": "open browser",
        })

        with self.assertRaises(PlanCompilationError) as ctx:
            self.compiler.compile(understanding)

        err = ctx.exception
        self.assertEqual(err.category, "clarification_needed")
        self.assertIn("Did you mean open Chrome or Firefox?", err.message)

    # -------------------------------------------------------------------------
    # 6. Unsupported Functionality Handling
    # -------------------------------------------------------------------------

    def test_unsupported_functionality_raises_error(self):
        """Verify requires_new_functionality=True raises PlanCompilationError with unsupported_functionality."""
        understanding = CommandUnderstanding({
            "intent": "send_sms",
            "requires_new_functionality": True,
            "suggested_implementation": "Implement Twilio SMS gateway provider",
            "text": "Send SMS to +1234567890",
        })

        with self.assertRaises(PlanCompilationError) as ctx:
            self.compiler.compile(understanding)

        err = ctx.exception
        self.assertEqual(err.category, "unsupported_functionality")
        self.assertIn("send_sms", err.message)
        self.assertIn("Twilio SMS gateway provider", err.message)

    # -------------------------------------------------------------------------
    # 7. Plan Validation
    # -------------------------------------------------------------------------

    def test_plan_validator_rejection_on_limit_exceeded(self):
        """Verify that exceeding max_steps limit is rejected via PlanValidator."""
        small_compiler = PlanCompiler(max_steps=2)
        raw_steps = [{"text": f"Action {i}"} for i in range(5)]
        understanding = CommandUnderstanding({"intent": "multi_step", "steps": raw_steps})

        with self.assertRaises(PlanCompilationError) as ctx:
            small_compiler.compile(understanding)

        err = ctx.exception
        self.assertEqual(err.category, "validation_error")
        self.assertIn("maximum allowed steps limit", err.message)

    def test_plan_validator_rejection_on_invalid_dag_cycle(self):
        """Verify invalid explicit cyclic dependencies are caught by PlanValidator."""
        understanding = CommandUnderstanding({
            "intent": "multi_step",
            "steps": [
                {"intent": "a", "text": "Step 1", "dependencies": ["step_2"]},
                {"intent": "b", "text": "Step 2", "dependencies": ["step_1"]},
            ],
        })

        with self.assertRaises(PlanCompilationError) as ctx:
            self.compiler.compile(understanding)

        err = ctx.exception
        self.assertEqual(err.category, "validation_error")
        self.assertIn("Cyclic dependency detected", err.message)

    # -------------------------------------------------------------------------
    # 8. Serialization Round-Trip
    # -------------------------------------------------------------------------

    def test_serialization_round_trip(self):
        """Verify compiled plan -> to_dict() -> from_dict() preserves structure."""
        understanding = CommandUnderstanding({
            "intent": "multi_step",
            "steps": [
                {"intent": "tool_a", "parameters": {"x": 1}, "text": "First"},
                {"intent": "tool_b", "parameters": {"y": 2}, "text": "Second"},
            ],
            "text": "Two step process",
        })

        plan = self.compiler.compile(understanding, task_id="task_ser")
        plan_dict = plan.to_dict()

        restored_plan = AgentPlan.from_dict(plan_dict)
        self.assertEqual(restored_plan.task_id, "task_ser")
        self.assertEqual(restored_plan.goal, "Two step process")
        self.assertEqual(len(restored_plan.steps), 2)
        self.assertEqual(restored_plan.steps[0].step_id, "step_1")
        self.assertEqual(restored_plan.steps[1].step_id, "step_2")
        self.assertEqual(restored_plan.steps[1].dependencies, ["step_1"])
        self.assertEqual(restored_plan.metadata["source"], "plan_compiler")

    # -------------------------------------------------------------------------
    # 9. compile_from_task and AgentOrchestrator Integration
    # -------------------------------------------------------------------------

    def test_compile_from_task_direct(self):
        """Verify compile_from_task works directly with an AgentTask."""
        task = AgentTask(
            user_request="Launch app",
            goal="Launch calculator",
            context={
                "tool_requirement": "rust:System.LaunchApp",
                "parameters": {"app_name": "calc"},
            },
        )

        plan = self.compiler.compile_from_task(task)
        self.assertEqual(plan.task_id, task.task_id)
        self.assertEqual(plan.goal, "Launch calculator")
        self.assertEqual(len(plan.steps), 1)
        self.assertEqual(plan.steps[0].tool_requirement, "rust:System.LaunchApp")
        self.assertEqual(plan.steps[0].input_parameters, {"app_name": "calc"})

    def test_orchestrator_default_plan_uses_compiler(self):
        """Verify AgentOrchestrator._create_default_plan uses PlanCompiler cleanly."""
        orchestrator = AgentOrchestrator()
        task = AgentTask(
            user_request="Check disk space",
            context={"tool_requirement": "rust:System.GetStorage"},
        )

        plan = orchestrator._create_default_plan(task)
        self.assertIsInstance(plan, AgentPlan)
        self.assertEqual(plan.task_id, task.task_id)
        self.assertEqual(plan.steps[0].tool_requirement, "rust:System.GetStorage")
        self.assertEqual(plan.metadata.get("source"), "plan_compiler_from_task")

    # -------------------------------------------------------------------------
    # 10. Side-Effect Safety Tests
    # -------------------------------------------------------------------------

    @patch("brain.tools.runtime.UnifiedToolRuntime")
    @patch("brain.agent.execution.StepExecutor.execute_step")
    @patch("brain.agent.orchestrator.AgentOrchestrator.run")
    def test_compiler_strictly_side_effect_free(
        self,
        mock_orchestrator_run,
        mock_execute_step,
        mock_tool_runtime,
    ):
        """
        Verify that PlanCompiler NEVER executes tools, models, executors, or orchestrators.
        """
        understanding = CommandUnderstanding({
            "intent": "multi_step",
            "steps": [
                {"intent": "rust:System.LaunchApp", "parameters": {"app": "notepad"}},
                {"intent": "rust:System.KillProcess", "parameters": {"pid": 1234}},
            ],
            "text": "Launch and kill",
        })

        plan = self.compiler.compile(understanding)

        self.assertIsNotNone(plan)
        # Verify NO execution tools or runtimes were called
        mock_orchestrator_run.assert_not_called()
        mock_execute_step.assert_not_called()
        mock_tool_runtime.assert_not_called()


if __name__ == "__main__":
    unittest.main()
