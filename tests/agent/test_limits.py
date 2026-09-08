"""
Agent Resource & Safety Limits Tests
Verifies limits configuration and serialization.
"""

import unittest
from brain.agent.limits import AgentLimits


class TestAgentLimits(unittest.TestCase):
    """Test suite for AgentLimits."""

    def test_default_limits(self):
        """Default limits match production safety baselines."""
        limits = AgentLimits()
        self.assertEqual(limits.max_plan_steps, 20)
        self.assertEqual(limits.max_retries_per_step, 3)
        self.assertEqual(limits.max_total_retries, 10)
        self.assertEqual(limits.step_timeout_sec, 30.0)
        self.assertEqual(limits.task_timeout_sec, 300.0)

    def test_serialization_and_deserialization(self):
        """Limits serialize and deserialize cleanly."""
        custom = AgentLimits(max_plan_steps=10, step_timeout_sec=15.0)
        data = custom.to_dict()
        reconstructed = AgentLimits.from_dict(data)

        self.assertEqual(reconstructed.max_plan_steps, 10)
        self.assertEqual(reconstructed.step_timeout_sec, 15.0)
        self.assertEqual(reconstructed.max_retries_per_step, 3)


if __name__ == "__main__":
    unittest.main()
