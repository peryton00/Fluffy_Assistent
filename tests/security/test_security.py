"""
Unit tests for Fluffy Brain Security & Policy Subsystem
"""
import unittest

from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult
from brain.security.security_monitor import SecurityMonitor
from brain.security.guardian_manager import (
    GUARDIAN_MEMORY,
    GUARDIAN_BASELINE,
    GUARDIAN_DETECTOR,
    GUARDIAN_SCORER,
    GUARDIAN_STATE,
)
from brain.agent.command_parser import Command, Intent

# Test backward-compatibility shims
import brain.action_validator as shim_validator
import brain.security_monitor as shim_sec_mon
import brain.guardian_manager as shim_guardian


class TestSecuritySubsystem(unittest.TestCase):

    def setUp(self):
        self.validator = ActionValidator()

    def test_safe_app_open(self):
        cmd = Command(raw_text="open notepad", intent=Intent.OPEN_APP, parameters={"app_name": "notepad"})
        val = self.validator.validate(cmd)
        self.assertTrue(val.is_valid)
        self.assertEqual(val.safety_level, SafetyLevel.SAFE)

    def test_protected_windows_path_blocked(self):
        cmd = Command(
            raw_text="delete file C:\\Windows\\System32\\calc.exe",
            intent=Intent.DELETE_FILE,
            parameters={"full_path": "C:\\Windows\\System32\\calc.exe"}
        )
        val = self.validator.validate(cmd)
        self.assertFalse(val.is_valid)
        self.assertEqual(val.safety_level, SafetyLevel.BLOCKED)

    def test_action_validator_shim(self):
        validator = shim_validator.ActionValidator()
        cmd = Command(raw_text="help", intent=Intent.HELP, parameters={})
        val = validator.validate(cmd)
        self.assertTrue(val.is_valid)

    def test_guardian_scorer(self):
        score = GUARDIAN_SCORER.score("notepad.exe", 1234, [])
        self.assertIsInstance(score, (int, float))


if __name__ == "__main__":
    unittest.main()
