"""
Artifact Subsystem Configuration
Resource boundaries, workspace directories, and default generation parameters.
"""

from dataclasses import dataclass, field
from typing import Optional, List
from pathlib import Path

from brain.ai.config.paths import ApplicationDataPaths


@dataclass
class ArtifactConfig:
    """Resource limits and storage directories for local artifact generation."""
    workspace_dir: Optional[Path] = None
    max_file_size_bytes: int = 50 * 1024 * 1024  # 50 MB
    max_rows: int = 100_000
    max_columns: int = 1_000
    max_slides: int = 200
    max_cells: int = 500_000
    generation_timeout_seconds: float = 60.0
    enable_manifest: bool = True

    def get_effective_workspace_dir(self) -> Path:
        """Resolve primary destination directory for generated deliverables."""
        if self.workspace_dir:
            p = Path(self.workspace_dir).resolve()
            p.mkdir(parents=True, exist_ok=True)
            return p
        data_root = ApplicationDataPaths.get_app_data_dir() / "artifacts"
        data_root.mkdir(parents=True, exist_ok=True)
        return data_root

    def get_manifest_db_path(self) -> Path:
        """Resolve SQLite path for the artifact audit manifest."""
        manifest_dir = ApplicationDataPaths.get_app_data_dir() / "artifacts"
        manifest_dir.mkdir(parents=True, exist_ok=True)
        return manifest_dir / "manifest.db"
