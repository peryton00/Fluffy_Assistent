"""
Sandbox Filesystem Isolation and Workspace Management
Enforces directory boundary constraints, path canonicalization, and traversal defense.
"""

import os
import shutil
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List

from brain.sandbox.errors import SandboxPathTraversalError, SandboxSecurityError


class SandboxFilesystemPolicy:
    """
    Manages isolated filesystem workspace and verifies path access boundaries.
    """

    # Windows reserved device names
    WINDOWS_RESERVED_NAMES = {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    }

    def __init__(self, base_dir: Optional[Path] = None):
        if base_dir is None:
            # Place in standard OS temp or fluffy_data/scratch
            app_scratch = Path(tempfile.gettempdir()) / "fluffy_sandbox"
            self.base_dir = app_scratch.resolve()
        else:
            self.base_dir = Path(base_dir).resolve()
        
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def provision_workspace(self, execution_id: str) -> Dict[str, Path]:
        """
        Create an isolated per-execution workspace directory tree:
        <base_dir>/<execution_id>/
            input/
            work/
            output/
        """
        # Validate execution_id format
        if not execution_id or ".." in execution_id or "/" in execution_id or "\\" in execution_id:
            raise SandboxSecurityError(f"Invalid execution ID for workspace creation: '{execution_id}'")

        exec_root = (self.base_dir / execution_id).resolve()
        input_dir = exec_root / "input"
        work_dir = exec_root / "work"
        output_dir = exec_root / "output"

        input_dir.mkdir(parents=True, exist_ok=True)
        work_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)

        return {
            "root": exec_root,
            "input": input_dir,
            "work": work_dir,
            "output": output_dir,
        }

    def is_safe_workspace_path(self, target_path: Path, workspace_root: Path) -> bool:
        """
        Verify that target_path strictly resolves within workspace_root.
        Defends against directory traversal, symlinks, junction points, and reserved names.
        """
        try:
            ws_root_resolved = workspace_root.resolve()
            
            # Check for Windows device / UNC paths
            path_str = str(target_path).strip()
            if path_str.startswith(("\\\\", "//", "\\\\?\\", "\\\\.\\")):
                return False

            # Check for reserved Windows filenames
            name_part = target_path.name.split(".")[0].upper()
            if name_part in self.WINDOWS_RESERVED_NAMES:
                return False

            # Canonical resolution
            if target_path.is_absolute():
                target_resolved = target_path.resolve()
            else:
                target_resolved = (ws_root_resolved / target_path).resolve()

            # Must be relative to workspace_root
            if not target_resolved.is_relative_to(ws_root_resolved):
                return False

            # Check symlink destination if exists
            if target_resolved.is_symlink():
                real_target = Path(os.path.realpath(str(target_resolved)))
                if not real_target.is_relative_to(ws_root_resolved):
                    return False

            return True
        except Exception:
            return False

    def validate_path_access(self, target_path: Path, workspace_root: Path) -> Path:
        """
        Validate path and return resolved path. Raises SandboxPathTraversalError if invalid.
        """
        if not self.is_safe_workspace_path(target_path, workspace_root):
            raise SandboxPathTraversalError(
                f"Path '{target_path}' escapes the sandbox workspace boundary '{workspace_root}'."
            )
        
        ws_root_resolved = workspace_root.resolve()
        if target_path.is_absolute():
            return target_path.resolve()
        return (ws_root_resolved / target_path).resolve()

    def cleanup_workspace(self, execution_id: str) -> None:
        """Deterministically remove the workspace directory for an execution."""
        if not execution_id or ".." in execution_id or "/" in execution_id or "\\" in execution_id:
            return
        
        exec_root = (self.base_dir / execution_id).resolve()
        if exec_root.exists() and exec_root.is_relative_to(self.base_dir):
            try:
                shutil.rmtree(exec_root, ignore_errors=True)
            except Exception:
                pass

    def list_output_files(self, workspace_root: Path) -> List[str]:
        """List files produced in the work/ and output/ directories."""
        files = []
        for subdir in ("work", "output"):
            target = workspace_root / subdir
            if target.exists():
                for root, _, filenames in os.walk(target):
                    for fn in filenames:
                        full = Path(root) / fn
                        try:
                            rel = full.relative_to(workspace_root)
                            files.append(str(rel).replace("\\", "/"))
                        except Exception:
                            pass
        return files
