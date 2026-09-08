"""
Deterministic Document Chunker
Produces stable, reproducible chunks preserving paragraph, page, and section boundaries without LLM dependencies.
"""

from typing import List, Optional
import re

from brain.knowledge.documents import KnowledgeDocument, DocumentChunk, ParsedDocument, ParsedSection
from brain.knowledge.metadata import ChunkMetadata
from brain.knowledge.chunking.interface import Chunker
from brain.knowledge.ingestion.hashing import compute_content_hash


class DeterministicChunker(Chunker):
    """
    Deterministic text chunker that preserves section/paragraph semantics,
    stable chunk numbering, and cryptographic chunk content hashing.
    """

    def __init__(
        self,
        target_chunk_size: int = 500,
        chunk_overlap: int = 50,
        min_chunk_size: int = 50,
    ):
        self.target_chunk_size = target_chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size

    def _split_text_into_windows(self, text: str) -> List[str]:
        """Split a string into overlapping chunks honoring word and sentence boundaries."""
        if len(text) <= self.target_chunk_size:
            return [text.strip()] if text.strip() else []

        chunks: List[str] = []
        # Split on sentence ends or newlines
        sentences = re.split(r"(?<=[.!?\n])\s+", text)
        current_chunk: List[str] = []
        current_len = 0

        for sentence in sentences:
            s_len = len(sentence)
            if not sentence:
                continue

            if current_len + s_len > self.target_chunk_size and current_chunk:
                chunk_str = " ".join(current_chunk).strip()
                if chunk_str:
                    chunks.append(chunk_str)

                # Keep overlap from the end
                overlap_tokens: List[str] = []
                overlap_len = 0
                for item in reversed(current_chunk):
                    if overlap_len + len(item) <= self.chunk_overlap:
                        overlap_tokens.insert(0, item)
                        overlap_len += len(item) + 1
                    else:
                        break
                current_chunk = overlap_tokens
                current_len = sum(len(x) + 1 for x in current_chunk)

            current_chunk.append(sentence)
            current_len += s_len + 1

        if current_chunk:
            final_str = " ".join(current_chunk).strip()
            if final_str:
                chunks.append(final_str)

        return chunks

    def chunk(self, document: KnowledgeDocument) -> List[DocumentChunk]:
        """Produce deterministic chunks from document sections or raw text."""
        doc_id = document.document_id
        parsed: Optional[ParsedDocument] = getattr(document, "_parsed_content", None)

        raw_sections: List[ParsedSection] = []
        if parsed and parsed.sections:
            raw_sections = parsed.sections
        else:
            # Fallback if raw sections not available
            raw_text = getattr(parsed, "raw_text", "") or ""
            raw_sections = [ParsedSection(text=raw_text, page_number=1, section_title="General")]

        chunks: List[DocumentChunk] = []
        chunk_idx = 0

        for sec in raw_sections:
            sec_text = sec.text.strip()
            if not sec_text:
                continue

            windows = self._split_text_into_windows(sec_text)
            sec_offset = sec.start_offset

            for w in windows:
                if len(w) < self.min_chunk_size and chunks:
                    # Append small trailing window to previous chunk if feasible
                    continue

                chunk_id = f"{doc_id}_chk_{chunk_idx:04d}"
                c_hash = compute_content_hash(w)
                token_count = len(w.split())

                meta = ChunkMetadata(
                    chunk_id=chunk_id,
                    document_id=doc_id,
                    chunk_index=chunk_idx,
                    page_number=sec.page_number,
                    section=sec.section_title,
                    start_offset=sec_offset,
                    end_offset=sec_offset + len(w),
                    token_count=token_count,
                    content_hash=c_hash,
                    custom_metadata=dict(sec.metadata),
                )
                chunks.append(DocumentChunk(metadata=meta, text=w))
                chunk_idx += 1
                sec_offset += len(w)

        # Update chunk_count in document metadata
        document.metadata.chunk_count = len(chunks)
        document.chunks = chunks
        return chunks
