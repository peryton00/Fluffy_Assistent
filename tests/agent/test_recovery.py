"""
Failure Classification & Bounded Recovery Tests
Verifies deterministic failure classification and recovery boundaries.
"""

import unittest
from brain.agent.limits import AgentLimits
from brain.agent.recovery import FailureClassifier, FailureType, RecoveryAction, RecoveryManager
from brain.agent.step import PlanStep


class TestAgentRecovery(unittest.TestCase):
    """Test suite for failure recovery strategies."""

    def test_failure_classification(self):
        """Errors are categorized deterministically into standard FailureType buckets."""
        self.assertEqual(
            FailureClassifier.classify("Timed out waiting for socket response"),
            FailureType.TIMEOUT,
        )
        self.assertEqual(
            FailureClassifier.classify("Security policy blocked action"),
            FailureType.SECURITY_DENIED,
        )
        self.assertEqual(
            FailureClassifier.classify("No active and available inference backend found"),
            FailureType.MODEL_UNAVAILABLE,
        )
        self.assertEqual(
            FailureClassifier.classify("Could not connect to Rust Core on 127.0.0.1:9002"),
            FailureType.TOOL_UNAVAILABLE,
        )
        self.assertEqual(
            FailureClassifier.classify("Out of memory during model allocation"),
            FailureType.RESOURCE_LIMIT,
        )

    def test_security_denials_never_retried(self):
        """Security denials must strictly yield ABORT regardless of remaining retry budget."""
        step = PlanStep(step_id="s1", objective="Delete", attempt_count=1)
        limits = AgentLimits(max_retries_per_step=5, max_total_retries=20)

        action = RecoveryManager.determine_action(
            failure_type=FailureType.SECURITY_DENIED,
            step=step,
            total_retries=1,
            limits=limits,
        )
        self.assertEqual(action, RecoveryAction.ABORT)

    def test_bounded_retry_behavior(self):
        """Transient errors retry while within limits and transition to REPLAN/ABORT when exhausted."""
        step = PlanStep(step_id="s2", objective="Network call", attempt_count=1)
        limits = AgentLimits(max_retries_per_step=2, max_total_retries=5)

        # Attempt 1: Within limit -> RETRY
        action1 = RecoveryManager.determine_action(FailureType.TIMEOUT, step, total_retries=1, limits=limits)
        self.assertEqual(action1, RecoveryAction.RETRY)

        # Attempt 2: Exceeded step limit -> REPLAN
        step.attempt_count = 2
        action2 = RecoveryManager.determine_action(FailureType.TIMEOUT, step, total_retries=2, limits=limits)
        self.assertEqual(action2, RecoveryAction.REPLAN)

        # Total retry limit exceeded -> REPLAN
        step.attempt_count = 1
        action3 = RecoveryManager.determine_action(FailureType.TIMEOUT, step, total_retries=5, limits=limits)
        self.assertEqual(action3, RecoveryAction.REPLAN)

    def test_model_unavailability_yields_fallback_action(self):
        """Model unavailability prescribes FALLBACK_MODEL recovery action."""
        step = PlanStep(step_id="s3", objective="Reasoning", attempt_count=1)
        limits = AgentLimits()

        action = RecoveryManager.determine_action(FailureType.MODEL_UNAVAILABLE, step, total_retries=0, limits=limits)
        self.assertEqual(action, RecoveryAction.FALLBACK_MODEL)


if __name__ == "__main__":
    unittest.main()
