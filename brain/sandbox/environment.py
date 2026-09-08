"""
Sandbox Environment Isolation
Constructs minimal sanitized execution environment, stripping secrets, tokens, credentials, and host profiles.
"""

import os
import sys
from typing import Dict, Any, Optional, Set


class SandboxEnvironmentPolicy:
    """
    Constructs a minimal, sanitized environment dictionary for sandboxed processes.
    """

    # Secret-bearing variable name patterns and substrings to deny
    BLOCKED_PATTERNS = {
        "KEY", "SECRET", "TOKEN", "PASSWORD", "AUTH", "PASSWD", "CREDENTIAL",
        "DATABASE", "DB_", "OPENAI", "ANTHROPIC", "AWS", "AZURE", "GITHUB",
        "SSH", "GPG", "PRIVATE", "COOKIE", "SESSION", "FLUFFY",
    }

    # Host user profile and system path variables to remove or sanitize
    SENSITIVE_HOST_VARS = {
        "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP",
        "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "COMPUTERNAME",
    }

    # Standard system variables permitted for basic OS runtime stability
    SAFE_PASSTHROUGH_WINDOWS = {
        "SYSTEMROOT", "WINDIR", "PATHEXT", "COMSPEC", "SYSTEMDRIVE",
    }

    SAFE_PASSTHROUGH_POSIX = {
        "TERM", "LANG", "LC_ALL", "TZ",
    }

    def __init__(self, custom_env: Optional[Dict[str, str]] = None):
        self._custom_env = custom_env or {}

    def build_sanitized_environment(self, workspace_work_dir: Optional[str] = None) -> Dict[str, str]:
        """
        Build minimal, isolated environment dictionary from host environment.
        """
        sanitized: Dict[str, str] = {}
        host_env = os.environ

        # 1. Select safe platform passthrough
        if sys.platform == "win32":
            safe_keys = self.SAFE_PASSTHROUGH_WINDOWS
        else:
            safe_keys = self.SAFE_PASSTHROUGH_POSIX

        for k in safe_keys:
            if k in host_env:
                sanitized[k] = host_env[k]

        # 2. Minimal sanitized PATH (only containing python interpreter dir and system32 for standard DLLs)
        python_dir = os.path.dirname(sys.executable)
        if sys.platform == "win32":
            sys32 = os.path.join(host_env.get("SystemRoot", "C:\\Windows"), "System32")
            sanitized["PATH"] = f"{python_dir};{sys32}"
        else:
            sanitized["PATH"] = f"{python_dir}:/usr/bin:/bin"

        # 3. Dedicated temp dir pointing to sandbox workspace work/ directory
        if workspace_work_dir:
            sanitized["TEMP"] = workspace_work_dir
            sanitized["TMP"] = workspace_work_dir
            sanitized["TMPDIR"] = workspace_work_dir

        # 4. Mandatory Python hardening flags
        sanitized["PYTHONUNBUFFERED"] = "1"
        sanitized["PYTHONDONTWRITEBYTECODE"] = "1"
        sanitized["PYTHONNOUSERSITE"] = "1"
        sanitized["PYTHONHASHSEED"] = "random"
        sanitized["PYTHONUTF8"] = "1"
        sanitized["PYTHONIOENCODING"] = "utf-8"
        sanitized["PYTHONPATH"] = ""  # Prevent loading host modules from cwd

        # 5. Merge approved custom environment entries with security filtering
        for k, v in self._custom_env.items():
            if not self._is_blocked_variable(k):
                sanitized[k] = str(v)

        return sanitized

    def _is_blocked_variable(self, name: str) -> bool:
        """Check if environment variable name contains blocked secret keywords."""
        name_upper = name.upper()
        if name_upper in self.SENSITIVE_HOST_VARS:
            return True
        for pattern in self.BLOCKED_PATTERNS:
            if pattern in name_upper:
                return True
        return False
