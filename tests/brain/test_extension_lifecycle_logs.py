"""
Tests for Extension Lifecycle, Logging, Deletion, and Fallback Routing.
Verifies that:
1. Extension creation records execution logs in state.EXECUTION_LOGS.
2. Extension deletion unregisters the extension, cleans registry, and records warning execution logs.
3. Attempting to use a deleted or nonexistent capability triggers self-improvement / new functionality flow rather than echoing fake chat responses.
"""

import unittest
import tempfile
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from brain.extensions.extension_loader import ExtensionLoader
from brain.extensions.extension_creator import ExtensionCreator
from brain.agent.llm_command_parser import LLMCommandParser, CommandUnderstanding
from brain.agent.intent_router import IntentRouter
from brain.runtime import state


class TestExtensionLifecycleLogs(unittest.TestCase):

    def setUp(self):
        # Clear execution logs before test
        with state.LOCK:
            state.EXECUTION_LOGS.clear()

    def test_extension_creation_and_deletion_logging(self):
        """Verify that creating and deleting an extension writes to state.EXECUTION_LOGS."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            creator = ExtensionCreator()
            creator.extensions_dir = tmp_path

            mock_code = MagicMock()
            mock_code.patterns = ["(?i)custom test skill"]
            mock_code.executor_method = "def execute(self, cmd): return {'success': True, 'message': 'Custom test done'}"
            mock_code.validation = "def validate(self, cmd): return None"

            # 1. Create extension
            created = creator.create_extension(
                intent_name="custom_test_skill",
                generated_code=mock_code,
                description="Custom test skill for logs",
            )
            self.assertEqual(created, "custom_test_skill")

            # Verify creation log
            with state.LOCK:
                log_messages = [log["message"] for log in state.EXECUTION_LOGS]
            self.assertTrue(
                any("Extension 'custom_test_skill' created" in msg for msg in log_messages),
                f"Expected creation log not found in: {log_messages}"
            )

            # 2. Delete extension
            deleted = creator.delete_extension("custom_test_skill")
            self.assertTrue(deleted)

            # Verify deletion log
            with state.LOCK:
                log_messages = [log["message"] for log in state.EXECUTION_LOGS]
            self.assertTrue(
                any("Extension 'custom_test_skill' deleted" in msg for msg in log_messages),
                f"Expected deletion log not found in: {log_messages}"
            )

    def test_extension_loader_unregister_and_delete(self):
        """Verify that ExtensionLoader.delete_extension cleans up registry and in-memory caches."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            loader = ExtensionLoader()
            loader.extensions_dir = tmp_path
            loader.registry_path = tmp_path / "registry.json"

            # Create a mock extension folder
            ext_dir = tmp_path / "mock_skill"
            ext_dir.mkdir()
            (ext_dir / "metadata.json").write_text(json.dumps({
                "name": "Mock Skill",
                "intent": "mock_skill",
                "description": "Mock skill desc",
                "directory": "mock_skill"
            }))
            (ext_dir / "handler.py").write_text("def get_handler(): return None")
            (ext_dir / "validator.py").write_text("def get_validator(): return None")

            # Register in registry
            loader.register_extension("mock_skill", {
                "name": "Mock Skill",
                "intent": "mock_skill",
                "directory": "mock_skill",
                "enabled": True
            })
            loader.extensions["mock_skill"] = {"handler": None, "validator": None, "metadata": {}}

            self.assertTrue(loader.has_extension("mock_skill"))

            # Delete
            ok = loader.delete_extension("mock_skill")
            self.assertTrue(ok)
            self.assertFalse(loader.has_extension("mock_skill"))
            self.assertNotIn("mock_skill", loader.load_registry())
            self.assertFalse(ext_dir.exists())

    def test_deleted_or_missing_extension_routes_to_new_functionality(self):
        """Verify that calling an unknown / deleted extension intent routes to self-improvement and NOT chat fallback."""
        router = IntentRouter()
        
        # Simulated understanding where intent was extracted as 'scan_wifi' (which is not an active extension)
        understanding = CommandUnderstanding({
            "intent": "scan_wifi",
            "requires_new_functionality": False,  # Even if LLM marked False
            "parameters": {},
            "original_text": "scan for nearby wifi networks",
            "text": "Sure! I’ll scan for nearby Wi‑Fi networks and provide you with a list of SSIDs, signal strengths, and security types."
        })

        with patch.object(router, "_handle_new_functionality") as mock_new, \
             patch("brain.extensions.extension_loader.get_extension_loader") as mock_loader_getter:
            
            mock_loader = MagicMock()
            mock_loader.has_extension.return_value = False
            mock_loader.find_extension_for_command.return_value = None
            mock_loader_getter.return_value = mock_loader

            mock_new.return_value = {
                "type": "command",
                "success": False,
                "message": "I don't have the ability to 'scan_wifi' yet, but I can learn it!",
                "stream": None,
                "result": None
            }

            result = router.route(understanding, original_message="scan for nearby wifi networks")
            
            # Must route to _handle_new_functionality rather than returning the fake chat response
            self.assertTrue(mock_new.called)
            self.assertIn("learn it", result["message"])


if __name__ == "__main__":
    unittest.main()
