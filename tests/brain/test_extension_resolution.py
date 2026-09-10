"""
Tests for Extension Identity, Resolution, and Idempotent Creation.
Verifies that:
- Extensions have stable semantic identities (e.g. bluetooth_scan).
- Repeated and equivalent commands resolve to existing extensions without creating duplicates.
- Generic names (e.g. new_feature, feature, unknown) are rejected.
- Extension creation is idempotent (in-place update, no _v2/_v3 directories).
"""

import unittest
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from brain.extensions.extension_loader import ExtensionLoader
from brain.extensions.extension_creator import ExtensionCreator
from brain.agent.llm_command_parser import LLMCommandParser, CommandUnderstanding
from brain.agent.intent_router import IntentRouter


class TestExtensionResolution(unittest.TestCase):

    def setUp(self):
        self.loader = ExtensionLoader()
        self.loader.load_all_extensions()

    def test_a_stable_extension_identity(self):
        """Test A: Extension has a stable semantic identity and metadata."""
        self.assertTrue(self.loader.has_extension("bluetooth_scan"))
        ext = self.loader.extensions["bluetooth_scan"]
        self.assertEqual(ext["name"], "bluetooth_scan")
        self.assertEqual(ext["metadata"]["intent"], "bluetooth_scan")
        self.assertNotIn("new_feature", self.loader.extensions)
        self.assertNotIn("new_feature_v2", self.loader.extensions)

    def test_b_exact_repeat_resolves_to_existing_extension(self):
        """Test B: Running the exact same command matches the existing extension."""
        matched = self.loader.find_extension_for_command("scan bluetooth")
        self.assertEqual(matched, "bluetooth_scan")

        # Pre-resolution in LLMCommandParser
        parser = LLMCommandParser()
        understanding = parser.parse_with_llm("scan bluetooth")
        self.assertEqual(understanding.intent, "bluetooth_scan")
        self.assertFalse(understanding.requires_new_functionality)

    def test_c_equivalent_wording_resolves_to_same_extension(self):
        """Test C: Natural language variations resolve to the same canonical extension."""
        variations = [
            "scan bluetooth",
            "scan bluetooth devices",
            "bluetooth scan",
            "find nearby bluetooth devices",
            "discover bluetooth",
            "list bluetooth devices",
        ]
        for phrase in variations:
            matched = self.loader.find_extension_for_command(phrase)
            self.assertEqual(matched, "bluetooth_scan", f"Failed to match variation: '{phrase}'")

    def test_d_generic_intent_rejection(self):
        """Test D: Generic intents like 'new_feature', 'feature', 'unknown' are rejected and sanitized."""
        parser = LLMCommandParser()
        
        # Generic placeholders must be sanitized to meaningful fallback
        self.assertEqual(parser._sanitize_intent_name("new_feature", "download youtube video"), "download_youtube_video")
        self.assertEqual(parser._sanitize_intent_name("feature", "compress pdf files"), "compress_pdf_files")
        self.assertEqual(parser._sanitize_intent_name("unknown", "check cpu temperature"), "check_cpu_temperature")
        self.assertEqual(parser._sanitize_intent_name("descriptive_snake_case_intent", "convert mp4 to mp3"), "convert_mp4_mp3")

        # Valid semantic names must be preserved
        self.assertEqual(parser._sanitize_intent_name("bluetooth_scan", "scan bluetooth"), "bluetooth_scan")
        self.assertEqual(parser._sanitize_intent_name("weather_lookup", "check weather"), "weather_lookup")

    def test_e_idempotent_creation_no_v2_folders(self):
        """Test E: Creating an extension with an existing intent name updates in-place without _v2."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            creator = ExtensionCreator()
            creator.extensions_dir = tmp_path
            
            mock_code = MagicMock()
            mock_code.patterns = ["(?i)test command"]
            mock_code.executor_method = "def execute(self, cmd): return {'success': True}"
            mock_code.validation = "def validate(self, cmd): return None"

            # 1. First creation
            intent1 = creator.create_extension(
                intent_name="sample_tool",
                generated_code=mock_code,
                description="Sample tool v1",
            )
            self.assertEqual(intent1, "sample_tool")
            self.assertTrue((tmp_path / "sample_tool").exists())
            self.assertFalse((tmp_path / "sample_tool_v2").exists())

            # 2. Second creation of the exact same intent (e.g. improvement/update)
            intent2 = creator.create_extension(
                intent_name="sample_tool",
                generated_code=mock_code,
                description="Sample tool v2 updated",
            )
            self.assertEqual(intent2, "sample_tool")
            # Must NOT create a _v2 folder
            self.assertFalse((tmp_path / "sample_tool_v2").exists())
            self.assertTrue((tmp_path / "sample_tool").exists())

    def test_f_router_prioritizes_existing_extension_over_self_improvement(self):
        """Test F: IntentRouter executes existing extension without triggering self-improvement."""
        router = IntentRouter()
        
        # Simulate an understanding that might have had requires_new_functionality mistakenly set
        understanding = CommandUnderstanding({
            "intent": "bluetooth_scan",
            "requires_new_functionality": True,
            "parameters": {},
            "original_text": "scan bluetooth",
            "text": "Scanning bluetooth..."
        })

        with patch.object(router, "_execute_extension") as mock_exec, \
             patch.object(router, "_handle_new_functionality") as mock_new:
            
            mock_exec.return_value = {"type": "command", "success": True, "message": "Done"}
            result = router.route(understanding, original_message="scan bluetooth")
            
            # Must call _execute_extension and NOT _handle_new_functionality
            self.assertTrue(mock_exec.called)
            self.assertFalse(mock_new.called)


if __name__ == "__main__":
    unittest.main()
