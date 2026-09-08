"""
Cryptographic Content Hashing for Document Ingestion
Provides deterministic SHA-256 content hashing for deduplication and change detection.
"""

import hashlib
from pathlib import Path
from typing import Union


def compute_content_hash(source: Union[str, bytes, Path]) -> str:
    """
    Compute deterministic SHA-256 hash of a file path, string, or byte payload.
    """
    hasher = hashlib.sha256()

    if isinstance(source, Path) or (isinstance(source, str) and Path(source).is_file()):
        file_path = Path(source)
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
    elif isinstance(source, str):
        hasher.update(source.encode("utf-8"))
    elif isinstance(source, bytes):
        hasher.update(source)
    else:
        hasher.update(str(source).encode("utf-8"))

    return hasher.hexdigest()
