"""
Knowledge Subsystem Configuration
"""

from typing import Optional
from dataclasses import dataclass, field
from pathlib import Path

from brain.ai.config.paths import ApplicationDataPaths


@dataclass
class KnowledgeConfig:
    """Configuration parameters for the local knowledge subsystem."""
    data_dir: Optional[Path] = None
    target_chunk_size: int = 500
    chunk_overlap: int = 50
    embedding_dimension: int = 256
    default_top_k: int = 5
    default_alpha: float = 0.7  # 0.7 vector, 0.3 lexical
    enable_reranking: bool = True

    def get_effective_data_dir(self) -> Path:
        """Resolve storage location according to platform application data standards."""
        if self.data_dir:
            return Path(self.data_dir).resolve()
        data_root = ApplicationDataPaths.get_app_data_dir() / "knowledge"
        data_root.mkdir(parents=True, exist_ok=True)
        return data_root

    def get_index_db_path(self) -> Path:
        """Resolve SQLite index file path."""
        return self.get_effective_data_dir() / "index.db"
