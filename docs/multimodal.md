# Fluffy Assistant — Phase 2G: Local Multimodal & OCR Architecture

## 1. Overview & SIH26117 Mission

Fluffy Assistant's **Multimodal & OCR Subsystem** (Phase 2G) provides sovereign, on-premise visual and scanned document ingestion capabilities designed for confidential industrial environments (**SIH26117 — Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work**).

The subsystem allows Fluffy to ingest and understand:
- Scanned raster PDFs (blueprints, manuals, service orders)
- Photographs and inspection captures (.jpg, .jpeg, .png, .webp, .bmp, .tiff)
- Handwritten field notes and verification sign-offs
- Engineering diagrams, schematics, and tabular equipment reports

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Confidential Industrial Asset                      │
│        (Scanned PDF / Inspection Photo / Blueprint / Handwritten Note)   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │     Safe Path Validation &      │
                    │      Document Discovery         │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │    Local Multimodal Pipeline    │
                    │   (Pillow Preprocessing / OCR)  │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │    Phase 2F ParsedDocument      │
                    │ (Sections, Tables, Coordinates) │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │   Canonical Knowledge Index     │
                    │  (SQLite Vector + BM25 Hybrid)  │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  Unified Tool: knowledge.search │
                    │      (Agent / Orchestration)    │
                    └─────────────────────────────────┘
```

---

## 2. Core Architectural Principles

1. **Ingestion Capability Feeding Canonical Knowledge**: Multimodal processing is strictly an ingestion pipeline that outputs Phase 2F `ParsedDocument` entities. There is no second vector store or secondary RAG pipeline.
2. **100% Offline & Air-Gap Compliant**: Zero network requests, zero remote telemetry, zero cloud API fallbacks, zero automatic model downloads.
3. **Strict Truth in Diagnostics**: If no local OCR binary (e.g., Tesseract) or local vision-language model is present on the host workstation, the runtime explicitly reports `OCR_UNAVAILABLE` or `VISION_UNAVAILABLE`. It never fakes results or falls back to cloud APIs.
4. **Provenance Preservation**: Every chunk extracted from an image or scanned page retains its source filename, page number, and bounding box coordinates (e.g., `[Source: scanned_manual.pdf, p. 17]`).
5. **Defense-in-Depth Security**: Traversal attacks (`..`, UNC prefixes, reserved device names) and access to protected OS directories (`C:\Windows`, `/etc`, `/root`) are blocked at the ingestion boundary before any image decoding occurs.

---

## 3. Package Structure

```text
brain/multimodal/
├── __init__.py                # Top-level exports and capability facades
├── definitions.py             # Enums: MultimodalMediaType, ExtractionMethod, ExtractionQuality, RegionType
├── models.py                  # Dataclasses: BoundingBox, TextRegion, TableRegion, DrawingRegion, MultimodalPage, MultimodalDocument
├── config.py                  # Resource limits: max dimensions, max pages, timeouts
├── health.py                  # Telemetry: MultimodalHealthStatus, diagnostics
├── interface.py               # Protocols: OCRProvider, VisionProvider, ImagePreprocessor
├── runtime.py                 # MultimodalRuntime facade & singleton
│
├── ocr/
│   ├── __init__.py
│   ├── interface.py           # OCRProvider protocol
│   ├── preprocessing.py       # Pillow pipeline: orientation, resize, grayscale, contrast
│   ├── local.py               # LocalOCRProvider (Tesseract discovery) & DeterministicTestOCRProvider
│   └── provider.py            # OCRProviderRegistry
│
├── vision/
│   ├── __init__.py
│   ├── interface.py           # VisionProvider protocol
│   ├── local.py               # LocalVisionProvider (AI Runtime VLM bridge)
│   └── provider.py            # VisionProviderRegistry
│
├── documents/
│   ├── __init__.py
│   ├── page.py                # PDFPageExtractor (raster image stream extraction)
│   ├── image.py               # ImageDocumentParser (standalone image loader)
│   └── layout.py              # LayoutAssembler (Markdown & reading order builder)
│
└── adapters/
    ├── __init__.py
    └── knowledge.py           # MultimodalKnowledgeAdapter & MultimodalImageDocumentParser
```

---

## 4. OCR Engine Discovery & Provider Model

`LocalOCRProvider` automatically discovers on-premise OCR engines without hardcoding system-specific paths:

1. **PATH lookup**: `shutil.which("tesseract")`
2. **Standard Windows Paths**: `C:\Program Files\Tesseract-OCR\tesseract.exe`, `C:\Program Files (x86)\Tesseract-OCR\tesseract.exe`
3. **Standard Unix/macOS Paths**: `/usr/bin/tesseract`, `/usr/local/bin/tesseract`, `/opt/homebrew/bin/tesseract`
4. **Configured Override**: `MultimodalConfig.tesseract_cmd`

When Tesseract is present, `LocalOCRProvider` executes TSV output generation to extract word coordinates, paragraph boundaries, and confidence metrics.
When Tesseract is absent, `LocalOCRProvider` returns `is_available = False` and outputs `ExtractionQuality.UNAVAILABLE`.

> [!NOTE]
> `DeterministicTestOCRProvider` is strictly a test-only provider injected during automated test fixtures and is never registered as a production fallback.

---

## 5. Vision Engine Integration

`LocalVisionProvider` interfaces directly with Fluffy's on-premise **AI Runtime** (Phase 2A) and **Model Router** (Phase 2B) when an open-weight vision-language model (e.g. Qwen-2.5-VL, LLaVA-NeXT) is loaded locally.
When no local vision model is loaded, the provider reports `MultimodalHealthStatus.UNAVAILABLE` and refuses to make external requests.

---

## 6. Supported File Formats

| Format | Extension | Extractor Pipeline | Provenance Granularity |
| :--- | :--- | :--- | :--- |
| Text PDF | `.pdf` | Pure-Python stream decompression (`BT ... ET`) | Page number & text offset |
| Scanned PDF | `.pdf` | Raster stream extraction $\rightarrow$ Local OCR | Page number & bounding box |
| PNG Image | `.png` | Pillow $\rightarrow$ Local OCR / Vision | Document & region bounding box |
| JPEG Image | `.jpg`, `.jpeg` | Pillow $\rightarrow$ Local OCR / Vision | Document & region bounding box |
| WebP Image | `.webp` | Pillow $\rightarrow$ Local OCR / Vision | Document & region bounding box |
| BMP Image | `.bmp` | Pillow $\rightarrow$ Local OCR / Vision | Document & region bounding box |
| TIFF Image | `.tiff` | Pillow $\rightarrow$ Local OCR / Vision | Document & region bounding box |

---

## 7. Resource & Safety Limits

To prevent denial-of-service from malformed or massive industrial scans, the subsystem enforces:

- `max_image_dimension`: 4096 px (downscales oversized images preserving aspect ratio)
- `max_pages`: 100 pages per document
- `max_file_size_bytes`: 50 MB
- `ocr_timeout_seconds`: 30.0 seconds per page/document
- `vision_timeout_seconds`: 30.0 seconds per query

---

## 8. Real vs Mock vs Structural Matrix

| Subsystem Component | Host Reality State | Verification Evidence |
| :--- | :--- | :--- |
| Image Preprocessing Pipeline | **REAL** | `tests/multimodal/test_ocr_unit.py` (Pillow-based transforms) |
| Layout Assembler & Tables | **REAL** | `tests/multimodal/test_ocr_unit.py` (Markdown table and block ordering) |
| OCR Provider Protocol & Registry | **REAL** | `tests/multimodal/test_ocr_unit.py` |
| Local OCR Engine (Tesseract CLI) | **STRUCTURAL / UNAVAILABLE** | Returns `UNAVAILABLE` when host lacks binary; no fake fallback |
| Scanned PDF Pipeline | **REAL** | `tests/multimodal/test_multimodal_corpus.py` (Stream extraction + OCR) |
| Vision Provider Protocol | **REAL** | `tests/multimodal/test_ocr_unit.py` |
| Local Vision Model | **UNAVAILABLE** | Reports `UNAVAILABLE` until local open-weight VLM is loaded |
| Multimodal Knowledge Adapter | **REAL** | `tests/multimodal/test_multimodal_integration.py` |
| SQLite Index & RAG Retrieval | **REAL** | `tests/multimodal/test_multimodal_integration.py` (Vector dot-product search) |
| UnifiedToolRuntime Integration | **REAL** | `tests/multimodal/test_multimodal_integration.py` (`knowledge.search`) |
| Air-Gap / Offline Enforcement | **REAL** | `tests/multimodal/test_multimodal_security.py` (Socket connect assertion) |

---

## 9. Provenance & Citations

Multimodal document retrieval provides citation provenance linking extracted findings directly to the original industrial source document:

```text
[Source: turbine_spec.png, p. 1]
[Source: maintenance_scan.pdf, p. 17, sec: Page 17]
```

This guarantees complete traceability for industrial audits, ISO compliance, and safety inspections.
