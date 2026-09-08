"""
Agent State & Blackboard Tests
Verifies task-scoped state isolation, variable setting/getting, and observation recording.
"""

import unittest
from brain.agent.observation import StepObservation
from brain.agent.state import AgentState
from brain.agent.task import AgentTask


class TestAgentState(unittest.TestCase):
    """Test suite for AgentState."""

    def test_state_isolation(self):
        """Two tasks maintain distinct, isolated state instances without crosstalk."""
        task1 = AgentTask(user_request="Task 1", task_id="task_1")
        task2 = AgentTask(user_request="Task 2", task_id="task_2")

        state1 = AgentState(task=task1)
        state2 = AgentState(task=task2)

        state1.set_variable("target_dir", "C:/Users/Documents")
        state2.set_variable("target_dir", "D:/Backups")

        self.assertEqual(state1.get_variable("target_dir"), "C:/Users/Documents")
        self.assertEqual(state2.get_variable("target_dir"), "D:/Backups")
        self.assertNotEqual(state1.get_variable("target_dir"), state2.get_variable("target_dir"))

    def test_record_observations_and_track_completion(self):
        """Observations update state maps and completed/failed step lists accurately."""
        task = AgentTask(user_request="Observation test")
        state = AgentState(task=task)

        obs_success = StepObservation(
            step_id="step_1",
            task_id=task.task_id,
            success=True,
            output={"files": ["a.txt", "b.txt"]},
        )
        obs_failure = StepObservation(
            step_id="step_2",
            task_id=task.task_id,
            success=False,
            error="Access denied",
        )

        state.record_observation(obs_success)
        state.record_observation(obs_failure)

        self.assertIn("step_1", state.completed_steps)
        self.assertIn("step_2", state.failed_steps)
        self.assertEqual(len(state.observations), 2)
        self.assertEqual(state.observations["step_1"].output, {"files": ["a.txt", "b.txt"]})

    def test_pending_confirmation_management(self):
        """State records and resolves pending confirmations cleanly."""
        task = AgentTask(user_request="Delete file")
        state = AgentState(task=task)

        state.add_pending_confirmation("conf_99", {"file": "important.txt", "action": "delete"})
        self.assertIn("conf_99", state.pending_confirmations)

        resolved = state.resolve_confirmation("conf_99")
        self.assertEqual(resolved["file"], "important.txt")
        self.assertNotIn("conf_99", state.pending_confirmations)


if __name__ == "__main__":
    unittest.main()
