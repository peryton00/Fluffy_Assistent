"""
Knowledge Health Monitoring
Provides non-destructive health checks, index metrics, and failure diagnostics.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import time

from brain.knowledge.definitions import KnowledgeHealthStatus


@dataclass
class KnowledgeHealth:
    """Diagnostic health state of the knowledge subsystem."""
    status: KnowledgeHealthStatus = KnowledgeHealthStatus.HEALTHY
    total_documents: int = 0
    total_chunks: int = 0
    embedding_model: str = "fluffy-local-deterministic-256"
    embedding_dimension: int = 256
    supported_extensions: List[str] = field(default_factory=list)
    last_error: Optional[str] = None
    last_checked: float = field(default_factory=time.time)

    @property
    def is_healthy(self) -> bool:
        return self.status in (KnowledgeHealthStatus.HEALTHY, KnowledgeHealthStatus.DEGRADED)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "is_healthy": self.is_healthy,
            "total_documents": self.total_documents,
            "total_chunks": self.total_chunks,
            "embedding_model": self.embedding_model,
            "embedding_dimension": self.embedding_dimension,
            "supported_extensions": self.supported_extensions,
            "last_error": self.last_error,
            "last_checked": self.last_checked,
        }
