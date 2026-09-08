"""
Paths & AIConfig Tests
Verifies platform-independent path resolution and offline-first configuration defaults.
"""

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from brain.ai.config.paths import ApplicationDataPaths
from brain.ai.config.ai_config import AIConfig, get_ai_config, set_ai_config


class TestPathsAndConfig(unittest.TestCase):
    """Test ApplicationDataPaths and AIConfig."""

    def tearDown(self):
        set_ai_config(None)

    def test_windows_path_resolution(self):
        """Verify Windows path resolution maps to AppData/Local."""
        with patch.object(ApplicationDataPaths, "get_system_name", return_value="windows"), \
             patch.dict(os.environ, {"LOCALAPPDATA": "C:\\Users\\TestUser\\AppData\\Local"}):
            app_dir = ApplicationDataPaths.get_app_data_dir()
            expected = Path("C:/Users/TestUser/AppData/Local/Fluffy")
            self.assertEqual(app_dir, expected)
            models_dir = ApplicationDataPaths.get_models_dir()
            self.assertEqual(models_dir, expected / "models")

    def test_linux_path_resolution(self):
        """Verify Linux path resolution maps to XDG_DATA_HOME or .local/share."""
        with patch.object(ApplicationDataPaths, "get_system_name", return_value="linux"), \
             patch.dict(os.environ, {"XDG_DATA_HOME": "/home/testuser/.local/share"}):
            app_dir = ApplicationDataPaths.get_app_data_dir()
            expected = Path("/home/testuser/.local/share/fluffy")
            self.assertEqual(app_dir, expected)
            models_dir = ApplicationDataPaths.get_models_dir()
            self.assertEqual(models_dir, expected / "models")

    def test_macos_path_resolution(self):
        """Verify macOS path resolution maps to Library/Application Support."""
        with patch.object(ApplicationDataPaths, "get_system_name", return_value="macos"), \
             patch.object(Path, "home", return_value=Path("/Users/testuser")):
            app_dir = ApplicationDataPaths.get_app_data_dir()
            expected = Path("/Users/testuser/Library/Application Support/Fluffy")
            self.assertEqual(app_dir, expected)
            models_dir = ApplicationDataPaths.get_models_dir()
            self.assertEqual(models_dir, expected / "models")

    def test_custom_override_environment_variables(self):
        """Verify explicit user overrides via FLUFFY_MODELS_DIR and FLUFFY_DATA_DIR."""
        with patch.dict(os.environ, {
            "FLUFFY_DATA_DIR": "/custom/fluffy/data",
            "FLUFFY_MODELS_DIR": "/custom/ai/models",
            "FLUFFY_OFFLINE_MODE": "true",
            "FLUFFY_DEFAULT_MODEL": "test-qwen-2.5",
        }):
            app_dir = ApplicationDataPaths.get_app_data_dir()
            models_dir = ApplicationDataPaths.get_models_dir()
            self.assertEqual(app_dir, Path("/custom/fluffy/data").resolve())
            self.assertEqual(models_dir, Path("/custom/ai/models").resolve())

            cfg = AIConfig.from_env()
            self.assertEqual(cfg.default_model_id, "test-qwen-2.5")
            self.assertTrue(cfg.offline_mode)
            self.assertEqual(cfg.models_dir, Path("/custom/ai/models").resolve())


if __name__ == "__main__":
    unittest.main()
