"""
Atomic Write Transaction Manager
Guarantees transactional deliverable commits: files are staged, validated, and atomically committed.
"""

import os
import shutil
import uuid
import hashlib
from pathlib import Path
from typing import Optional, Callable, Tuple

from brain.artifacts.definitions import OverwritePolicy, ValidationStatus
from brain.artifacts.storage.paths import ArtifactPathManager


class AtomicWriteTransaction:
    """
    Context and executor for atomic, transactional artifact writes.
    Prevents corrupt or invalid deliverables from reaching the destination filesystem.
    """

    @classmethod
    def commit_transaction(
        cls,
        target_path: Path,
        write_callback: Callable[[Path], None],
        validate_callback: Callable[[Path], bool],
        overwrite_policy: OverwritePolicy = OverwritePolicy.VERSION,
    ) -> Tuple[Path, str, int]:
        """
        Execute full atomic generation and validation transaction:
        1. Resolve safe destination based on OverwritePolicy.
        2. Create temp file in same directory for staging.
        3. Invoke write_callback(temp_file).
        4. Invoke validate_callback(temp_file).
        5. If valid, atomically rename temp_file to destination with backup protection.
        6. Compute SHA-256 hash and file size.
        Returns: (final_path, sha256_hash, size_bytes)
        """
        target_dir = target_path.parent
        target_dir.mkdir(parents=True, exist_ok=True)

        resolved_dest, is_replace = ArtifactPathManager.resolve_destination_path(
            base_dir=target_dir,
            filename=target_path.name,
            overwrite_policy=overwrite_policy,
        )

        # Temporary staging path in the same directory (ensures atomic same-filesystem rename)
        temp_filename = f".tmp_{uuid.uuid4().hex}_{resolved_dest.name}"
        temp_path = target_dir / temp_filename

        backup_path: Optional[Path] = None

        try:
            # 1. Write content to temp file
            write_callback(temp_path)

            if not temp_path.exists() or temp_path.stat().st_size == 0:
                raise ValueError("Artifact generator produced empty or nonexistent file.")

            # 2. Structural Validation
            is_valid = validate_callback(temp_path)
            if not is_valid:
                raise ValueError(f"Structural validation failed for staged artifact: {temp_path.name}")

            # 3. Handle Replace Backup if target exists
            if is_replace and resolved_dest.exists():
                backup_path = target_dir / f".backup_{uuid.uuid4().hex}_{resolved_dest.name}"
                shutil.copy2(resolved_dest, backup_path)

            # 4. Atomic Rename / Replace
            os.replace(temp_path, resolved_dest)

            # 5. Clean up backup if replace succeeded
            if backup_path and backup_path.exists():
                try:
                    backup_path.unlink()
                except Exception:
                    pass

            # 6. Compute stats & hash
            size_bytes = resolved_dest.stat().st_size
            hasher = hashlib.sha256()
            with open(resolved_dest, "rb") as f:
                while chunk := f.read(65536):
                    hasher.update(chunk)
            content_hash = hasher.hexdigest()

            return resolved_dest, content_hash, size_bytes

        except Exception as e:
            # Rollback: Clean temp file
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass

            # Rollback: Restore backup if replacement failed midway
            if backup_path and backup_path.exists():
                try:
                    os.replace(backup_path, resolved_dest)
                except Exception:
                    pass

            raise e
