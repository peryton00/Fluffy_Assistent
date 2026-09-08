"""
Agent Plan & Validator Tests
Verifies plan validation, step bounds, dependency validation, and cycle detection.
"""

import unittest
from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.step import PlanStep, StepStatus


class TestAgentPlan(unittest.TestCase):
    """Test suite for AgentPlan and PlanValidator."""

    def test_valid_linear_plan(self):
        """A valid sequenced plan passes validation."""
        s1 = PlanStep(step_id="step_1", objective="List processes", tool_requirement="rust:Process.List")
        s2 = PlanStep(step_id="step_2", objective="Analyze processes", dependencies=["step_1"])

        plan = AgentPlan(task_id="task_101", goal="Find top CPU process", steps=[s1, s2])
        is_valid, err = PlanValidator.validate(plan, max_steps=10)

        self.assertTrue(is_valid)
        self.assertIsNone(err)

    def test_plan_exceeds_max_steps(self):
        """Plans exceeding max step bounds must fail validation."""
        steps = [PlanStep(step_id=f"step_{i}", objective=f"Objective {i}") for i in range(15)]
        plan = AgentPlan(task_id="task_102", goal="Large plan", steps=steps)

        is_valid, err = PlanValidator.validate(plan, max_steps=10)
        self.assertFalse(is_valid)
        self.assertIn("exceeds maximum allowed steps", err)

    def test_duplicate_step_id_rejected(self):
        """Plans with duplicate step IDs must fail validation."""
        s1 = PlanStep(step_id="dup_id", objective="Action 1")
        s2 = PlanStep(step_id="dup_id", objective="Action 2")

        plan = AgentPlan(task_id="task_103", goal="Duplicate ID plan", steps=[s1, s2])
        is_valid, err = PlanValidator.validate(plan)
        self.assertFalse(is_valid)
        self.assertIn("Duplicate step_id", err)

    def test_nonexistent_dependency_rejected(self):
        """Plans with references to non-existent dependencies must fail validation."""
        s1 = PlanStep(step_id="step_1", objective="Action 1", dependencies=["missing_step"])

        plan = AgentPlan(task_id="task_104", goal="Missing dependency plan", steps=[s1])
        is_valid, err = PlanValidator.validate(plan)
        self.assertFalse(is_valid)
        self.assertIn("depends on non-existent step", err)

    def test_cyclic_dependency_rejected(self):
        """Plans with cyclic dependency loops must fail topological validation."""
        s1 = PlanStep(step_id="step_a", objective="Action A", dependencies=["step_b"])
        s2 = PlanStep(step_id="step_b", objective="Action B", dependencies=["step_a"])

        plan = AgentPlan(task_id="task_105", goal="Cyclic plan", steps=[s1, s2])
        is_valid, err = PlanValidator.validate(plan)
        self.assertFalse(is_valid)
        self.assertIn("Cyclic dependency detected", err)

    def test_serialization_and_deserialization(self):
        """Plan serializes and reconstructs accurately."""
        s1 = PlanStep(step_id="s1", objective="Step 1", tool_requirement="tool:web_search")
        plan = AgentPlan(task_id="task_106", goal="Search plan", steps=[s1])

        data = plan.to_dict()
        reconstructed = AgentPlan.from_dict(data)

        self.assertEqual(reconstructed.task_id, plan.task_id)
        self.assertEqual(len(reconstructed.steps), 1)
        self.assertEqual(reconstructed.steps[0].step_id, "s1")


if __name__ == "__main__":
    unittest.main()
