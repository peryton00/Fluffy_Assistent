"""
Local SQLite-backed Knowledge Index
Provides thread-safe local persistence for document metadata, text chunks, and embedding vectors.
"""

import sqlite3
import json
import threading
import math
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import numpy as np

from brain.ai.config.paths import ApplicationDataPaths
from brain.knowledge.definitions import DocumentStatus, DocumentMimeType, DocumentClassification
from brain.knowledge.metadata import DocumentMetadata, ChunkMetadata
from brain.knowledge.documents import KnowledgeDocument, DocumentChunk
from brain.knowledge.index.interface import KnowledgeIndex


class LocalKnowledgeIndex(KnowledgeIndex):
    """
    Local persistent knowledge index backed by SQLite.
    Stores metadata, full-text chunks, and dense embedding vectors.
    """

    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            data_dir = ApplicationDataPaths.get_app_data_dir() / "knowledge"
            data_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = data_dir / "index.db"
        else:
            self.db_path = Path(db_path)
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.RLock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Initialize database schema."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Documents table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    document_id TEXT PRIMARY KEY,
                    source_path TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    content_hash TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    modified_at REAL NOT NULL,
                    indexed_at REAL NOT NULL,
                    parser_name TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    classification TEXT NOT NULL,
                    owner TEXT,
                    allowed_identities_json TEXT,
                    chunk_count INTEGER NOT NULL,
                    page_count INTEGER,
                    error_message TEXT,
                    custom_metadata_json TEXT
                )
            """)

            # Chunks table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    chunk_id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    page_number INTEGER,
                    section TEXT,
                    start_offset INTEGER NOT NULL,
                    end_offset INTEGER NOT NULL,
                    token_count INTEGER NOT NULL,
                    content_hash TEXT NOT NULL,
                    text TEXT NOT NULL,
                    embedding_json TEXT,
                    custom_metadata_json TEXT,
                    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
                )
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_path ON documents(source_path)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_hash ON documents(content_hash)")

            conn.commit()
            conn.close()

    def upsert_document(self, document: KnowledgeDocument) -> bool:
        """Insert or replace document metadata and chunks atomically."""
        meta = document.metadata
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            try:
                # 1. Clean up any existing record for this path or document ID
                cursor.execute("DELETE FROM chunks WHERE document_id IN (SELECT document_id FROM documents WHERE source_path = ? OR document_id = ?)", (meta.source_path, meta.document_id))
                cursor.execute("DELETE FROM documents WHERE source_path = ? OR document_id = ?", (meta.source_path, meta.document_id))

                # 2. Insert document
                cursor.execute("""
                    INSERT INTO documents (
                        document_id, source_path, display_name, mime_type, size_bytes, content_hash,
                        created_at, modified_at, indexed_at, parser_name, version, status,
                        classification, owner, allowed_identities_json, chunk_count, page_count,
                        error_message, custom_metadata_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    meta.document_id,
                    meta.source_path,
                    meta.display_name,
                    meta.mime_type.value,
                    meta.size_bytes,
                    meta.content_hash,
                    meta.created_at,
                    meta.modified_at,
                    meta.indexed_at,
                    meta.parser_name,
                    meta.version,
                    meta.status.value,
                    meta.classification.value,
                    meta.owner,
                    json.dumps(meta.allowed_identities),
                    meta.chunk_count,
                    meta.page_count,
                    meta.error_message,
                    json.dumps(meta.custom_metadata),
                ))

                # 2. Delete existing chunks for this document
                cursor.execute("DELETE FROM chunks WHERE document_id = ?", (meta.document_id,))

                # 3. Insert new chunks
                for chunk in document.chunks:
                    c_meta = chunk.metadata
                    emb_json = json.dumps(chunk.embedding) if chunk.embedding is not None else None
                    cursor.execute("""
                        INSERT INTO chunks (
                            chunk_id, document_id, chunk_index, page_number, section,
                            start_offset, end_offset, token_count, content_hash, text,
                            embedding_json, custom_metadata_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        c_meta.chunk_id,
                        c_meta.document_id,
                        c_meta.chunk_index,
                        c_meta.page_number,
                        c_meta.section,
                        c_meta.start_offset,
                        c_meta.end_offset,
                        c_meta.token_count,
                        c_meta.content_hash,
                        chunk.text,
                        emb_json,
                        json.dumps(c_meta.custom_metadata),
                    ))

                conn.commit()
                return True
            except Exception as e:
                conn.rollback()
                print(f"[LocalKnowledgeIndex] Upsert error: {e}")
                return False
            finally:
                conn.close()

    def get_document(self, document_id: str) -> Optional[DocumentMetadata]:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE document_id = ?", (document_id,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return None
            return self._row_to_doc_metadata(row)

    def get_document_by_path(self, source_path: str) -> Optional[DocumentMetadata]:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE source_path = ?", (source_path,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return None
            return self._row_to_doc_metadata(row)

    def list_documents(self) -> List[DocumentMetadata]:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents ORDER BY indexed_at DESC")
            rows = cursor.fetchall()
            conn.close()
            return [self._row_to_doc_metadata(r) for r in rows]

    def delete_document(self, document_id: str) -> bool:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
                cursor.execute("DELETE FROM documents WHERE document_id = ?", (document_id,))
                conn.commit()
                return True
            except Exception as e:
                conn.rollback()
                print(f"[LocalKnowledgeIndex] Delete error: {e}")
                return False
            finally:
                conn.close()

    def get_chunks_for_document(self, document_id: str) -> List[DocumentChunk]:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC", (document_id,))
            rows = cursor.fetchall()
            conn.close()
            return [self._row_to_chunk(r) for r in rows]

    def search_vector(
        self,
        query_vector: List[float],
        top_k: int = 10,
        document_ids: Optional[List[str]] = None,
    ) -> List[Tuple[DocumentChunk, float]]:
        """Compute cosine similarities between query vector and stored chunk embeddings."""
        if not query_vector:
            return []

        q_vec = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 1e-9:
            q_vec = q_vec / q_norm

        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()

            query_sql = "SELECT * FROM chunks WHERE embedding_json IS NOT NULL"
            params = []
            if document_ids:
                placeholders = ",".join("?" * len(document_ids))
                query_sql += f" AND document_id IN ({placeholders})"
                params.extend(document_ids)

            cursor.execute(query_sql, params)
            rows = cursor.fetchall()
            conn.close()

            scored: List[Tuple[DocumentChunk, float]] = []
            for r in rows:
                emb_str = r["embedding_json"]
                if not emb_str:
                    continue
                try:
                    c_vec = np.array(json.loads(emb_str), dtype=np.float32)
                    c_norm = np.linalg.norm(c_vec)
                    if c_norm > 1e-9:
                        c_vec = c_vec / c_norm
                    sim = float(np.dot(q_vec, c_vec))
                    chunk = self._row_to_chunk(r)
                    scored.append((chunk, sim))
                except Exception:
                    continue

            scored.sort(key=lambda x: x[1], reverse=True)
            return scored[:top_k]

    def search_lexical(
        self,
        query_text: str,
        top_k: int = 10,
        document_ids: Optional[List[str]] = None,
    ) -> List[Tuple[DocumentChunk, float]]:
        """Perform lexical token matching score (BM25 approximation)."""
        tokens = [t.lower() for t in query_text.split() if len(t) >= 2]
        if not tokens:
            return []

        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()

            query_sql = "SELECT * FROM chunks"
            params = []
            if document_ids:
                placeholders = ",".join("?" * len(document_ids))
                query_sql += f" WHERE document_id IN ({placeholders})"
                params.extend(document_ids)

            cursor.execute(query_sql, params)
            rows = cursor.fetchall()
            conn.close()

            scored: List[Tuple[DocumentChunk, float]] = []
            for r in rows:
                text_lower = r["text"].lower()
                matched_tokens = sum(1 for t in tokens if t in text_lower)
                if matched_tokens > 0:
                    score = float(matched_tokens) / float(len(tokens))
                    chunk = self._row_to_chunk(r)
                    scored.append((chunk, score))

            scored.sort(key=lambda x: x[1], reverse=True)
            return scored[:top_k]

    def count_documents(self) -> int:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM documents")
            count = cursor.fetchone()[0]
            conn.close()
            return count

    def count_chunks(self) -> int:
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM chunks")
            count = cursor.fetchone()[0]
            conn.close()
            return count

    def close(self) -> None:
        pass

    def _row_to_doc_metadata(self, row: sqlite3.Row) -> DocumentMetadata:
        allowed = json.loads(row["allowed_identities_json"]) if row["allowed_identities_json"] else []
        custom = json.loads(row["custom_metadata_json"]) if row["custom_metadata_json"] else {}
        return DocumentMetadata(
            document_id=row["document_id"],
            source_path=row["source_path"],
            display_name=row["display_name"],
            mime_type=DocumentMimeType(row["mime_type"]),
            size_bytes=row["size_bytes"],
            content_hash=row["content_hash"],
            created_at=row["created_at"],
            modified_at=row["modified_at"],
            indexed_at=row["indexed_at"],
            parser_name=row["parser_name"],
            version=row["version"],
            status=DocumentStatus(row["status"]),
            classification=DocumentClassification(row["classification"]),
            owner=row["owner"],
            allowed_identities=allowed,
            chunk_count=row["chunk_count"],
            page_count=row["page_count"],
            error_message=row["error_message"],
            custom_metadata=custom,
        )

    def _row_to_chunk(self, row: sqlite3.Row) -> DocumentChunk:
        custom = json.loads(row["custom_metadata_json"]) if row["custom_metadata_json"] else {}
        emb = json.loads(row["embedding_json"]) if row["embedding_json"] else None
        meta = ChunkMetadata(
            chunk_id=row["chunk_id"],
            document_id=row["document_id"],
            chunk_index=row["chunk_index"],
            page_number=row["page_number"],
            section=row["section"],
            start_offset=row["start_offset"],
            end_offset=row["end_offset"],
            token_count=row["token_count"],
            content_hash=row["content_hash"],
            custom_metadata=custom,
        )
        return DocumentChunk(metadata=meta, text=row["text"], embedding=emb)
