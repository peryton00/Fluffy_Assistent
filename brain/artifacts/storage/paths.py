"""
Artifact Path and Filename Safety Manager
Enforces safe path boundaries, traversal defenses, and versioned filename resolution.
"""

import re
from pathlib import Path
from typing import Optional, Tuple, Union

from brain.artifacts.definitions import OverwritePolicy
from brain.knowledge.ingestion.discovery import DocumentDiscovery


class ArtifactPathManager:
    """
    Manages filesystem path sanitization and collision resolution for generated artifacts.
    Reuses canonical security boundaries from DocumentDiscovery.
    """

    ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

    @classmethod
    def sanitize_filename(cls, filename: str, default_ext: str = ".txt") -> str:
        """
        Sanitize user or agent proposed filename:
        - Strip traversal components
        - Replace illegal characters
        - Ensure valid non-empty name and extension
        """
        # Take basename only
        clean = Path(filename).name.strip()
        clean = cls.ILLEGAL_FILENAME_CHARS.sub("_", clean)
        clean = clean.strip(". ")

        if not clean:
            clean = "artifact"

        if "." not in clean and default_ext:
            ext = default_ext if default_ext.startswith(".") else f".{default_ext}"
            clean = f"{clean}{ext}"

        # Check Windows reserved device names
        stem_lower = clean.split(".")[0].lower()
        if stem_lower in DocumentDiscovery.RESERVED_DEVICE_NAMES:
            clean = f"safe_{clean}"

        return clean

    @classmethod
    def is_safe_destination(cls, target_dir: Union[Path, str], workspace_root: Optional[Path] = None) -> bool:
        """
        Validate destination directory path safety against traversal and protected OS paths.
        """
        return DocumentDiscovery.is_safe_path(str(target_dir), allowed_root=workspace_root)

    @classmethod
    def resolve_destination_path(
        cls,
        base_dir: Path,
        filename: str,
        overwrite_policy: OverwritePolicy = OverwritePolicy.VERSION,
    ) -> Tuple[Path, bool]:
        """
        Resolve target destination path based on OverwritePolicy.
        Returns (resolved_path, will_replace_existing).
        """
        clean_name = cls.sanitize_filename(filename)
        candidate = base_dir / clean_name

        if not candidate.exists():
            return candidate, False

        if overwrite_policy == OverwritePolicy.DENY:
            raise FileExistsError(f"Artifact already exists and overwrite policy is DENY: {candidate}")

        if overwrite_policy == OverwritePolicy.REPLACE:
            return candidate, True

        # OverwritePolicy.VERSION -> resolve 'filename (1).ext'
        stem = candidate.stem
        suffix = candidate.suffix
        version = 1
        while candidate.exists():
            candidate = base_dir / f"{stem} ({version}){suffix}"
            version += 1

        return candidate, False
