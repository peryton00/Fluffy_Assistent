"""
Platform-Independent Application Data & Model Path Resolution
Provides standard OS-compliant paths for Windows, Linux, and macOS.
"""

import os
import platform
from pathlib import Path
from typing import Optional


class ApplicationDataPaths:
    """
    Resolves application directories according to OS standards.
    Supports user overrides via environment variables.
    """

    @staticmethod
    def get_system_name() -> str:
        """Get canonical lowercased OS name ('windows', 'linux', 'macos')."""
        sys_name = platform.system().lower()
        if sys_name == "darwin":
            return "macos"
        return sys_name

    @classmethod
    def get_app_data_dir(cls, custom_root: Optional[str] = None) -> Path:
        """
        Get the root Fluffy application data directory.
        Priority:
          1. custom_root parameter
          2. FLUFFY_DATA_DIR environment variable
          3. Platform default:
             - Windows: %LOCALAPPDATA%/Fluffy (or %APPDATA%/Fluffy)
             - macOS: ~/Library/Application Support/Fluffy
             - Linux/Other: $XDG_DATA_HOME/fluffy or ~/.local/share/fluffy
        """
        # 1. Custom parameter
        if custom_root:
            return Path(custom_root).expanduser().resolve()

        # 2. Environment variable
        env_data = os.getenv("FLUFFY_DATA_DIR")
        if env_data:
            return Path(env_data).expanduser().resolve()

        # 3. Platform default
        sys_name = cls.get_system_name()

        if sys_name == "windows":
            local_appdata = os.getenv("LOCALAPPDATA")
            if local_appdata:
                return Path(local_appdata) / "Fluffy"
            appdata = os.getenv("APPDATA")
            if appdata:
                return Path(appdata) / "Fluffy"
            return Path.home() / "AppData" / "Local" / "Fluffy"

        elif sys_name == "macos":
            return Path.home() / "Library" / "Application Support" / "Fluffy"

        else:
            # Linux / BSD / POSIX standards
            xdg_data = os.getenv("XDG_DATA_HOME")
            if xdg_data:
                return Path(xdg_data) / "fluffy"
            return Path.home() / ".local" / "share" / "fluffy"

    @classmethod
    def get_models_dir(cls, custom_dir: Optional[str] = None) -> Path:
        """
        Get the local AI models storage directory.
        Priority:
          1. custom_dir parameter
          2. FLUFFY_MODELS_DIR environment variable
          3. Project repository local models fallback (if fluffy_data/models exists)
          4. ApplicationDataDir / models
        """
        if custom_dir:
            return Path(custom_dir).expanduser().resolve()

        env_models = os.getenv("FLUFFY_MODELS_DIR")
        if env_models:
            return Path(env_models).expanduser().resolve()

        # Check project root fallback
        project_root = Path(__file__).parent.parent.parent.parent
        repo_models = project_root / "fluffy_data" / "models"
        if repo_models.exists():
            return repo_models.resolve()

        app_dir = cls.get_app_data_dir()
        return app_dir / "models"

    @classmethod
    def get_cache_dir(cls) -> Path:
        """Get cache directory for temporary model weights and runtime caches."""
        app_dir = cls.get_app_data_dir()
        return app_dir / "cache"

    @classmethod
    def ensure_directories(cls) -> None:
        """Ensure core application paths exist."""
        cls.get_app_data_dir().mkdir(parents=True, exist_ok=True)
        cls.get_models_dir().mkdir(parents=True, exist_ok=True)
        cls.get_cache_dir().mkdir(parents=True, exist_ok=True)
