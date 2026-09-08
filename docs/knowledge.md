# Local Knowledge / RAG Subsystem

## 1. Overview & Architectural Philosophy

Phase 2F implements a production-grade, local-first, permission-aware **Knowledge / RAG Subsystem** for Fluffy Assistant. Tailored for confidential industrial deployments under SIH problem statement **SIH26117** (*Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work*), it operates completely offline without cloud APIs or third-party telemetry.

The Knowledge Subsystem is exposed as a first-class capability provider within the **Unified Tool Runtime** under `knowledge.search`.

```text
                     Agent / StepExecutor
                              ↓
                    UnifiedToolRuntime
                              ↓
                ToolResolver & SchemaValidator
                              ↓
               ToolSecurityPolicy & ActionValidator
                              ↓
                Guardian Behavioral Observation
                              ↓
            KnowledgeToolAdapter (knowledge.search)
                              ↓
                       KnowledgeRuntime
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
  IngestionManager      LocalKnowledgeIndex   RetrievalEngine
  - Discovery & Hash    (SQLite + Vectors)    - Hybrid Scoring
  - Format Parsers                            - Deterministic Rerank
  - Deterministic Chunker                     - Permission Policy Gate
        │                     │                     │
        └─────────────────────┴─────────────────────┘
                              ↓
      RetrievalResult + Citations → ToolResult → StepObservation
```

---

## 2. Ingestion Pipeline & Supported Formats

The ingestion pipeline canonicalizes paths, enforces traversal protection, computes cryptographic SHA-256 content hashes, and selects the appropriate format parser.

### Supported Text-Bearing Formats
- **Plain Text & Markdown** (`.txt`, `.md`, `.markdown`, `.json`, `.csv`, `.log`, `.yaml`, `.py`, `.rs`, `.html`): Segmented by headers (`# Header`) and paragraph blocks (`\n\n`).
- **Text-Based PDF** (`.pdf`): Decompresses internal content streams (`BT ... ET`) and extracts text per page with page number metadata.
- **Microsoft Word** (`.docx`): Reads `word/document.xml` using standard library `zipfile` and XML parsing, extracting headings, paragraphs, and structured tables.

### Scanned PDF & OCR Handling
> [!IMPORTANT]
> **Phase 2F Scope Notice**:
> Phase 2F supports **text-bearing local documents**. If a PDF contains 0 extractable text characters (scanned images or rasterized blueprints), the parser explicitly flags the document with status `DocumentStatus.OCR_REQUIRED` rather than failing silently or generating empty chunks. Scanned document OCR and multimodal vision retrieval are scheduled for **Phase 2G — Multimodal / OCR**.

---

## 3. Deterministic Chunking

- **Implementation**: `DeterministicChunker` (`brain/knowledge/chunking/deterministic.py`).
- **Target Size**: 500 characters (configurable via `KnowledgeConfig.target_chunk_size`).
- **Overlap**: 50 characters (`KnowledgeConfig.chunk_overlap`).
- **Boundary Preservation**: Splits strictly along paragraph boundaries (`\n\n`), sentence terminators (`. `, `! `, `? `), or word boundaries.
- **Determinism**: For identical source inputs, chunk IDs (`f"{doc_id}_chk_{index:04d}"`), offsets, and content hashes are stable and reproducible without LLM dependencies.

---

## 4. Local Embedding Provider & Index

### Embedding Provider
- **Interface**: `EmbeddingProvider` (`brain/knowledge/embeddings/interface.py`).
- **Default Implementation**: `DeterministicLocalEmbeddingProvider` (`brain/knowledge/embeddings/local.py`).
- **Vector Space**: 256-dimensional normalized dense float vectors generated using token and subword character n-gram feature hashing with sign projections.
- **Offline Guarantee**: 100% offline, zero cloud API requests, deterministic cosine similarity space. Extensible to local ONNX / GGUF models via `EmbeddingProviderFactory`.

### Persistent Local Index
- **Implementation**: `LocalKnowledgeIndex` (`brain/knowledge/index/local.py`).
- **Backend**: SQLite database stored at `<app_data>/knowledge/index.db`.
- **Schema**:
  - `documents`: Document ID, source path, title, MIME type, size, SHA-256 hash, timestamps, classification, owner, allowed identities.
  - `chunks`: Chunk ID, document ID, chunk index, page number, section, text offsets, SHA-256 chunk hash, full text, embedding vector JSON.

---

## 5. Hybrid Retrieval & Reranking

Retrieval combines dense semantic search and lexical keyword matching into a single ranked result set:

$$S_{\text{hybrid}} = \alpha \cdot S_{\text{vector}} + (1 - \alpha) \cdot S_{\text{lexical}}$$

- **Default $\alpha$**: `0.7` (70% semantic vector weight, 30% lexical token match weight).
- **Reranker**: `DeterministicLocalReranker` boosts exact query phrase matches (+0.15), section/heading title matches (+0.10), and token density without invoking generative LLMs.

---

## 6. Access Control & Permission Enforcement

Access control is enforced **before returning document content**:
- **Classifications**: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`.
- **Identity Evaluation**: `KnowledgePermissionPolicy.is_access_allowed()` verifies the querying identity's clearance level, role, owner status, or explicit allowed identity lists.
- **Unauthorized Content**: Chunks from unauthorized documents are filtered out during retrieval with zero content leakage.

---

## 7. Provenance & Citations

Every retrieved chunk includes structured provenance metadata:
```text
[Source: turbine_maintenance_manual.pdf, p. 37, sec: Lubrication]
```
The agent receives:
- `chunk_id`
- `document_id`
- `source_path`
- `display_name`
- `page_number`
- `section`
- `score` & `rank`
- `citation` string

---

## 8. Document Lifecycle & Change Detection

`KnowledgeLifecycleManager` provides automatic synchronization:
1. **Deduplication**: Ingesting a document with an identical SHA-256 content hash reuses the existing index.
2. **Modification Detection**: If a file's content hash changes on disk, previous chunks are purged and the document is re-indexed.
3. **Safe Deletion**: Deleting a document removes its metadata and all associated chunks atomically from SQLite.

---

## 9. Tool Runtime Integration

Registered tool: `knowledge.search`
- **Tool Kind**: `ToolKind.KNOWLEDGE`
- **Risk Level**: `ToolRiskLevel.SAFE` (Read-only, offline capable)
- **Input Parameters**:
  ```json
  {
    "query": { "type": "string", "description": "Search query text" },
    "top_k": { "type": "integer", "description": "Maximum results to return (default: 5)" },
    "minimum_score": { "type": "number", "description": "Minimum similarity score threshold" },
    "paths": { "type": "array", "items": { "type": "string" }, "description": "Optional file paths filter" }
  }
  ```
- **Aliases**: `knowledge_search`, `rag.search`, `document_search`.

---

## 10. Air-Gapped Operation & Sovereign SIH26117 Compliance

- All document parsing, hashing, vectorization, indexing, hybrid scoring, and reranking execute locally in-process.
- No network sockets or cloud endpoints are contacted.
- Compliant with air-gapped industrial deployment constraints.
