# Fluffy Assistant — Phase 2H: Local Artifact Generation Subsystem

## 1. Overview & SIH26117 Mission

Fluffy Assistant's **Local Artifact Generation Subsystem** (Phase 2H) provides sovereign, deterministic, permission-aware deliverable generation designed for confidential industrial workplaces (**SIH26117 — Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work**).

The subsystem allows Fluffy to transform Agent findings, RAG knowledge searches, Sandbox computational outputs, and OCR extractions into production-grade deliverables across 8 core formats:
- **DOCX**: Rich Word reports with executive summaries, hierarchical headings, bullet points, structured tables, and citations.
- **XLSX**: Multi-sheet Excel workbooks with formatted headers, auto-calculated column widths, formulas (`SUM`, `AVERAGE`), and numerical formatting.
- **PPTX**: PowerPoint presentation decks with title slides, structured content slides, bullet points, comparison tables, and speaker notes.
- **TXT**: Clean plaintext logs and memos.
- **Markdown**: Formatted technical documentation with embedded tables, code blocks, and citations.
- **JSON**: Validated, indented structured records and machine-readable exports.
- **CSV**: RFC 4180-compliant tabular spreadsheets and parameter dumps.
- **Code**: Clean source files (`.py`, `.rs`, `.js`, `.ts`, `.cpp`, `.c`, `.java`, `.html`, `.css`) with syntax pre-validation.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Agent / Orchestration Pipeline                     │
│               (Knowledge Retrieval / Sandbox / Multimodal OCR)          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │      UnifiedToolRuntime         │
                    │   (ToolRequest: artifact.generate)│
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │      ArtifactToolAdapter        │
                    │  (bridges request to subsystem) │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │       ArtifactRuntime           │
                    │  • Safe Path Validation         │
                    │  • Classification Inheritance   │
                    │  • Generator & Validator Match  │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │   AtomicWriteTransaction        │
                    │  1. Generate to Staging Temp    │
                    │  2. Independent Reopen & Validate
                    │  3. Atomic Rename to Target Path│
                    │  4. SHA-256 Checksum Calculation│
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │   ArtifactManifestManager       │
                    │  (SQLite Audit Log & Provenance)│
                    └─────────────────────────────────┘
```

---

## 2. Core Architectural Principles

1. **Transactional Atomic Writes**: Artifacts are staged in temporary files, structurally validated by independent re-opening and parsing, and only atomically moved (`os.replace`) to the final target upon complete validation success. On failure, staging files are cleaned up and original targets remain pristine.
2. **Zero Cloud Dependencies & Network-Zero**: 100% offline-first execution with zero cloud calls, zero remote telemetry, and zero runtime package installations.
3. **Office Format Engineering**:
   - **XLSX**: Built using `xlsxwriter` with real multi-sheet support, styling, and formulas.
   - **PPTX**: Built using `python-pptx` with standard presentation layout shapes, tables, and notes.
   - **DOCX**: Built with standards-compliant Office Open XML zip packaging (`word/document.xml`, `word/styles.xml`, `[Content_Types].xml`, `_rels/.rels`), guaranteed parseable by Microsoft Word, LibreOffice, and Google Docs without requiring external native dependencies.
4. **Security Classification Inheritance**: Artifacts inherit the highest security classification (`PUBLIC` < `INTERNAL` < `CONFIDENTIAL` < `RESTRICTED`) of their source materials without silent downgrades.
5. **Phase 2E Sandbox Boundary Isolation**: Deliverables containing computed or simulated code data must calculate values inside the Phase 2E Secure Sandbox before feeding structured data into `artifact.generate`. Code generators only statically analyze syntax (e.g. Python AST) and never execute code during generation.
6. **Path Traversal & Device Escape Defenses**: Reuses canonical security primitives from `DocumentDiscovery`, blocking directory traversal (`..`), UNC paths (`\\host\share`), Windows reserved device names (`CON`, `NUL`, `PRN`, `AUX`, `COM1-9`, `LPT1-9`), and protected system paths (`C:\Windows`, `/etc`, `/root`).

---

## 3. Tool Registration & Agent Integration

The subsystem is registered in the canonical `UnifiedToolRuntime` under `artifact.generate` with risk level `SAFE`:

```python
from brain.tools.runtime import UnifiedToolRuntime, ToolRequest

runtime = UnifiedToolRuntime()

req = ToolRequest(
    tool_id="artifact.generate",
    parameters={
        "artifact_type": "docx",
        "name": "Quarterly_Turbine_Report.docx",
        "content": [
            {
                "heading": "1. Executive Summary",
                "text": "Turbine performance remained within operational limits.",
                "bullet_points": ["Max Temp: 620°C", "Vibration: 1.2 mm/s"],
            }
        ],
        "sources": ["scanned_inspection_log.pdf (p. 4)"],
        "classification": "confidential",
    }
)

result = runtime.execute(req)
print(result.output["file_path"])
print(result.output["content_hash"])
```

### Overwrite Policies
- `VERSION` (default): If `Report.docx` exists, generates `Report (1).docx`, `Report (2).docx`, etc.
- `REPLACE`: Atomically replaces existing file after validating staging file.
- `DENY`: Rejects generation with `FileExistsError` if the destination path already exists.

---

## 4. Verification Matrix

| Component | Status | Verification Detail |
|---|---|---|
| **DOCX Generator & Validator** | **REAL** | Generated real Office Open XML packages, independently unzipped, verified XML structure and styles. |
| **XLSX Generator & Validator** | **REAL** | Generated real workbooks with `xlsxwriter`, verified sheets and formulas. |
| **PPTX Generator & Validator** | **REAL** | Generated real presentations with `python-pptx`, verified slide counts and tables. |
| **JSON, CSV, Markdown, TXT** | **REAL** | Round-trip parsed and validated syntax, UTF-8 integrity, and RFC 4180 conformance. |
| **Code Generator & AST Validator** | **REAL** | Generated Python files, validated syntax via `ast.parse`. |
| **Atomic Commitment & Rollback** | **REAL** | Validated transactional isolation, rollback on corrupted generation, zero target alteration. |
| **Security & Path Defense** | **REAL** | Blocked directory traversal, UNC escapes, reserved device names, and classification downgrade. |
| **SQLite Audit Manifest** | **REAL** | Persisted artifact metadata, SHA-256 hashes, creation timestamps, and source citations. |
| **Sandbox & Knowledge Pipelines** | **REAL** | Executed real Sandbox computation $\rightarrow$ XLSX deliverable, and RAG $\rightarrow$ DOCX deliverable. |
