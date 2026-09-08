"""
Dependency-Aware Step Scheduler Tests
Verifies topological scheduling and dependent step blocking.
"""

import unittest
from brain.agent.plan import AgentPlan
from brain.agent.step import PlanStep, StepStatus


class TestStepScheduler(unittest.TestCase):
    """Test suite for dependency-aware step scheduling."""

    def test_independent_steps_scheduled_immediately(self):
        """Steps without dependencies are ready immediately."""
        s1 = PlanStep(step_id="step_a", objective="Find files")
        s2 = PlanStep(step_id="step_b", objective="Get system power")

        plan = AgentPlan(task_id="t1", goal="Test", steps=[s1, s2])
        ready = plan.get_ready_steps(completed_step_ids=set())

        self.assertEqual(len(ready), 2)
        ready_ids = [s.step_id for s in ready]
        self.assertIn("step_a", ready_ids)
        self.assertIn("step_b", ready_ids)

    def test_dependent_step_blocked_until_dependency_completes(self):
        """Steps with unfulfilled dependencies are not returned as ready."""
        s1 = PlanStep(step_id="step_1", objective="List directory")
        s2 = PlanStep(step_id="step_2", objective="Analyze directory", dependencies=["step_1"])
        s3 = PlanStep(step_id="step_3", objective="Create summary report", dependencies=["step_2"])

        plan = AgentPlan(task_id="t2", goal="Sequential pipeline", steps=[s1, s2, s3])

        # Stage 0: Nothing completed -> only step_1 is ready
        ready_0 = plan.get_ready_steps(completed_step_ids=set())
        self.assertEqual(len(ready_0), 1)
        self.assertEqual(ready_0[0].step_id, "step_1")

        # Stage 1: step_1 completed -> step_2 becomes ready
        s1.mark_completed(output={"files": ["a.py"]})
        ready_1 = plan.get_ready_steps(completed_step_ids={"step_1"})
        self.assertEqual(len(ready_1), 1)
        self.assertEqual(ready_1[0].step_id, "step_2")

        # Stage 2: step_2 completed -> step_3 becomes ready
        s2.mark_completed(output={"analysis": "clean"})
        ready_2 = plan.get_ready_steps(completed_step_ids={"step_1", "step_2"})
        self.assertEqual(len(ready_2), 1)
        self.assertEqual(ready_2[0].step_id, "step_3")

        # Stage 3: step_3 completed -> no steps ready, plan completed
        s3.mark_completed(output="Report done")
        ready_3 = plan.get_ready_steps(completed_step_ids={"step_1", "step_2", "step_3"})
        self.assertEqual(len(ready_3), 0)
        self.assertTrue(plan.is_all_completed())


if __name__ == "__main__":
    unittest.main()
