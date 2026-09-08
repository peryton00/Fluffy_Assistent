"""
Agent Task & State Machine Tests
Verifies task creation, state transitions, and illegal transition rejection.
"""

import unittest
from brain.agent.task import AgentTask, TaskStatus


class TestAgentTask(unittest.TestCase):
    """Test suite for AgentTask and lifecycle state machine."""

    def test_task_creation_and_defaults(self):
        """Task initializes with correct defaults and correlation IDs."""
        task = AgentTask(user_request="Find all error logs and summarize them")
        self.assertEqual(task.status, TaskStatus.CREATED)
        self.assertEqual(task.goal, "Find all error logs and summarize them")
        self.assertTrue(task.task_id.startswith("task_"))
        self.assertIsNotNone(task.correlation_id)
        self.assertFalse(task.is_terminal)

    def test_valid_state_transitions(self):
        """Task transitions through legal lifecycle progression."""
        task = AgentTask(user_request="Test task")

        task.transition_to(TaskStatus.PLANNING, reason="Starting planner")
        self.assertEqual(task.status, TaskStatus.PLANNING)

        task.transition_to(TaskStatus.READY, reason="Plan approved")
        self.assertEqual(task.status, TaskStatus.READY)

        task.transition_to(TaskStatus.EXECUTING)
        self.assertEqual(task.status, TaskStatus.EXECUTING)

        task.transition_to(TaskStatus.WAITING_CONFIRMATION)
        self.assertEqual(task.status, TaskStatus.WAITING_CONFIRMATION)

        task.transition_to(TaskStatus.EXECUTING)
        self.assertEqual(task.status, TaskStatus.EXECUTING)

        task.transition_to(TaskStatus.COMPLETED)
        self.assertEqual(task.status, TaskStatus.COMPLETED)
        self.assertTrue(task.is_terminal)

    def test_invalid_state_transitions_rejected(self):
        """Task strictly rejects illegal state transitions."""
        task = AgentTask(user_request="Test task")

        # CREATED cannot jump directly to COMPLETED
        with self.assertRaises(ValueError):
            task.transition_to(TaskStatus.COMPLETED)

        # Transition to COMPLETED is terminal; cannot transition further
        task.transition_to(TaskStatus.PLANNING)
        task.transition_to(TaskStatus.READY)
        task.transition_to(TaskStatus.EXECUTING)
        task.transition_to(TaskStatus.COMPLETED)

        with self.assertRaises(ValueError):
            task.transition_to(TaskStatus.EXECUTING)

    def test_serialization_and_deserialization(self):
        """Task serializes and deserializes accurately."""
        task = AgentTask(
            user_request="Inspect system power state",
            priority=2,
            constraints={"timeout": 60},
        )
        task.transition_to(TaskStatus.PLANNING)

        data = task.to_dict()
        reconstructed = AgentTask.from_dict(data)

        self.assertEqual(reconstructed.task_id, task.task_id)
        self.assertEqual(reconstructed.user_request, task.user_request)
        self.assertEqual(reconstructed.status, TaskStatus.PLANNING)
        self.assertEqual(reconstructed.priority, 2)
        self.assertEqual(reconstructed.constraints, {"timeout": 60})


if __name__ == "__main__":
    unittest.main()
