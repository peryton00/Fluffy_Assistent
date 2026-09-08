"""
Safe Local Document Discovery
Provides traversal-defended directory scanning and path validation for knowledge ingestion.
"""

import os
import re
from pathlib import Path
from typing import List, Optional, Set


class DocumentDiscovery:
    """
    Discovers local text-bearing files within permitted directories while defending against
    path traversal, UNC device escapes, and protected system locations.
    """

    SUPPORTED_EXTENSIONS: Set[str] = {
        ".txt", ".md", ".markdown", ".pdf", ".docx",
        ".json", ".csv", ".log", ".yaml", ".yml",
        ".py", ".rs", ".js", ".ts", ".html", ".css", ".xml",
        ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff",
    }

    PROTECTED_SYSTEM_PATHS: Set[str] = {
        "c:\\windows", "c:/windows", "c:\\program files", "c:/program files",
        "/etc", "c:\\etc", "c:/etc", "/root", "c:\\root", "c:/root",
        "/var", "c:\\var", "c:/var", "/usr", "c:\\usr", "c:/usr",
        "/sys", "c:\\sys", "c:/sys", "/proc", "c:\\proc", "c:/proc",
    }

    RESERVED_DEVICE_NAMES: Set[str] = {
        "con", "prn", "aux", "nul",
        "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    }

    @classmethod
    def is_safe_path(cls, path_str: str, allowed_root: Optional[Path] = None) -> bool:
        """Validate if path is safe from traversal and system escape."""
        if not path_str or "\x00" in path_str:
            return False

        # 1. Block UNC prefixes and device paths
        if path_str.startswith("\\\\") or path_str.startswith("//"):
            return False

        # 2. Block relative traversal tokens in input path
        norm_parts = path_str.replace("\\", "/").split("/")
        if ".." in norm_parts:
            return False

        # 3. Block Windows reserved device names
        for part in norm_parts:
            base_part = part.split(".")[0].lower()
            if base_part in cls.RESERVED_DEVICE_NAMES:
                return False

        try:
            target_path = Path(path_str).resolve()
        except Exception:
            return False

        for part in target_path.parts:
            base_part = part.split(".")[0].lower()
            if base_part in cls.RESERVED_DEVICE_NAMES:
                return False

        # 4. Check protected paths
        resolved_str = str(target_path).lower().replace("\\", "/")
        for prot in cls.PROTECTED_SYSTEM_PATHS:
            prot_clean = prot.lower().replace("\\", "/")
            if resolved_str == prot_clean or resolved_str.startswith(prot_clean + "/") or resolved_str.startswith(prot_clean):
                return False

        # 5. If an allowed root is given, ensure confinement
        if allowed_root is not None:
            root_resolved = allowed_root.resolve()
            try:
                target_path.relative_to(root_resolved)
            except ValueError:
                return False

        return True

    @classmethod
    def discover_files(
        cls,
        root_dir: Path,
        recursive: bool = True,
        max_files: int = 1000,
    ) -> List[Path]:
        """Scan directory for supported text-bearing document files."""
        if not root_dir.exists() or not root_dir.is_dir():
            return []

        if not cls.is_safe_path(str(root_dir)):
            return []

        discovered: List[Path] = []

        if recursive:
            iterator = root_dir.rglob("*")
        else:
            iterator = root_dir.glob("*")

        for file_path in iterator:
            if len(discovered) >= max_files:
                break
            if file_path.is_file():
                if file_path.suffix.lower() in cls.SUPPORTED_EXTENSIONS:
                    if cls.is_safe_path(str(file_path), allowed_root=root_dir):
                        discovered.append(file_path.resolve())

        return discovered
