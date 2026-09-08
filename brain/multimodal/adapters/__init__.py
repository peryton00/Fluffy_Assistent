"""
Multimodal Adapters
Bridges multimodal parsing results to the canonical Knowledge and RAG subsystems.
"""

from brain.multimodal.adapters.knowledge import (
    MultimodalKnowledgeAdapter,
    MultimodalImageDocumentParser,
)

__all__ = [
    "MultimodalKnowledgeAdapter",
    "MultimodalImageDocumentParser",
]
