"""
Integration tests for Fluffy Brain Pipeline
Flow: Input -> Command -> Security Validator -> Session Memory -> State
"""
import unittest

from brain.agent.command_parser import Command, Intent
from brain.security.action_validator import ActionValidator, SafetyLevel
from brain.memory.session import get_session_memory, reset_session_memory
from brain.runtime import state


class TestIntegrationPipeline(unittest.TestCase):

    def setUp(self):
        self.validator = ActionValidator()
        reset_session_memory()

    def test_pipeline_execution_flow(self):
        # 1. Create Command
        cmd = Command(
            raw_text="open notepad",
            intent=Intent.OPEN_APP,
            parameters={"app_name": "notepad"}
        )
        self.assertEqual(cmd.intent, Intent.OPEN_APP)

        # 2. Validate
        val = self.validator.validate(cmd)
        self.assertTrue(val.is_valid)
        self.assertEqual(val.safety_level, SafetyLevel.SAFE)

        # 3. Record in Session Memory & Runtime State
        session = get_session_memory()
        session.set_pending_validation(cmd, val)
        state.add_execution_log(f"Validated command: {cmd.intent}", "info")

        # 4. Check state
        self.assertTrue(len(state.EXECUTION_LOGS) > 0)


if __name__ == "__main__":
    unittest.main()
