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

    def test_network_anomaly_to_security_observation(self):
        from brain.guardian.network_correlation import NetworkAnomaly, NetworkCorrelationEngine
        engine = NetworkCorrelationEngine()

        anomaly = NetworkAnomaly(
            id="net_listen_tcp_8080_1700000000",
            type="UNEXPECTED_LISTENING_SOCKET",
            severity="high",
            confidence=0.85,
            timestamp=1700000000.0,
            summary="Unexpected TCP listening socket on port 8080 (unmapped)",
            explanation="An unmapped TCP listening socket was observed bound to 0.0.0.0:8080 without an identifiable process.",
            evidence={"port": 8080, "protocol": "TCP", "bound_address": "0.0.0.0", "anomaly_subtype": "UNMAPPED_LISTENER"},
            related_process={"pid": 4567, "name": "rogue.exe"},
            related_connection={"protocol": "TCP", "local_address": "0.0.0.0", "local_port": 8080, "state": "LISTEN"},
        )

        obs = engine.to_network_security_observation(anomaly)
        self.assertEqual(obs["observation_id"], "net_listen_tcp_8080_1700000000")
        self.assertEqual(obs["timestamp_epoch_ms"], 1700000000000)
        self.assertEqual(obs["risk_level"], "high")
        self.assertEqual(obs["anomaly_kind"], "unexpected_listening_socket")
        self.assertEqual(obs["affected_ip"], "0.0.0.0")
        self.assertEqual(obs["affected_pid"], 4567)
        self.assertIn("Unexpected TCP listening socket", obs["description"])
        self.assertTrue(len(obs["evidence"]) > 0)

    def test_auth_utils_dynamic_token_and_no_hardcoded_fallback(self):
        import os
        import brain.security.auth_utils as auth_utils

        # Reset any cached runtime token
        auth_utils._RUNTIME_TOKEN = None
        orig_env = os.environ.pop("FLUFFY_TOKEN", None)

        try:
            # 1. Without env var, generates a random high-entropy token
            tok1 = auth_utils._get_token()
            self.assertNotEqual(tok1, "fluffy_dev_token")
            self.assertEqual(len(tok1), 64)  # 32 bytes hex = 64 characters

            # Cached within the same process session
            tok2 = auth_utils._get_token()
            self.assertEqual(tok1, tok2)

            # Fresh session gets a different token
            auth_utils._RUNTIME_TOKEN = None
            tok3 = auth_utils._get_token()
            self.assertNotEqual(tok1, tok3)
            self.assertEqual(len(tok3), 64)

            # 2. When env var is explicitly provided, it is honored
            os.environ["FLUFFY_TOKEN"] = "custom_production_token_12345"
            self.assertEqual(auth_utils._get_token(), "custom_production_token_12345")
        finally:
            if orig_env is not None:
                os.environ["FLUFFY_TOKEN"] = orig_env
            else:
                os.environ.pop("FLUFFY_TOKEN", None)
            auth_utils._RUNTIME_TOKEN = None


if __name__ == "__main__":
    unittest.main()
