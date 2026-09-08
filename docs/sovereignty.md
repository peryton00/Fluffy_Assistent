# Fluffy Assistant — Phase 2I: Air-Gap & Sovereignty Proof

## 1. Overview & SIH26117 Mission

Fluffy Assistant's **Air-Gap & Sovereignty Subsystem** (Phase 2I) provides formal static auditing, runtime network interception, and negative test verification to ensure complete sovereign compliance for confidential industrial environments (**SIH26117 — Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work**).

The subsystem proves that Fluffy operates strictly on-premise without requiring external network services, cloud APIs, telemetry, or runtime package/model downloads.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Sovereign Industrial Workstation                   │
│                       (Physically Disconnected / Air-Gap)               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │      Sovereignty Policy         │
                    │  • Approved Localhost IPC (9002)│
                    │  • Prohibited External Egress   │
                    │  • Prohibited Remote Transports │
                    └────────────────┬────────────────┘
                                     │
            ┌────────────────────────┴────────────────────────┐
            ▼                                                 ▼
┌───────────────────────────────┐                 ┌───────────────────────────────┐
│   Static Sovereignty Auditor  │                 │    Runtime Network Monitor    │
│  • AST-level module inspection│                 │  • Socket connect hook        │
│  • Banned cloud SDK detection │                 │  • DNS getaddrinfo hook       │
│  • Download command analysis  │                 │  • External egress blocking   │
└───────────────────────────────┘                 └───────────────────────────────┘
```

---

## 2. Core Sovereignty Invariants

1. **Zero Cloud Dependencies**: The production runtime requires 0 external calls to OpenAI, Anthropic, Gemini, cloud OCR, cloud embeddings, cloud vector databases, or remote telemetry.
2. **Missing Local Capabilities Return `UNAVAILABLE`**: No silent fallback to remote services. If local weights, OCR binaries (e.g. Tesseract), or VLM backends are absent, the system explicitly returns `UNAVAILABLE` / `OCR_REQUIRED`.
3. **Zero Runtime Downloads**: No dynamic `pip install`, `npm install`, `cargo install`, `hf_hub_download`, `git clone`, `curl`, `wget`, or `Invoke-WebRequest` during startup or execution.
4. **Localhost IPC Exemption**: Intentional localhost IPC (ports 9000, 9001, 9002, 9003, 5123) is recognized and classified as `LOCALHOST`, distinct from `EXTERNAL` Internet egress.
5. **Local stdio MCP Boundary**: MCP server transports reject remote URLs (`http://`, `https://`, `sse://`, `ws://`) and operate strictly via local subprocess `stdio`.
6. **Isolated Sandbox Network Policy**: Phase 2E Sandbox modes enforce explicit network rules: `SECURE` (network denied), `RESTRICTED` (network denied unless configured), `HOST` (host policy).
7. **Complete Offline RAG & Artifact Pipelines**: Knowledge ingestion, embedding, indexing, retrieval, and document generation (DOCX, XLSX, PPTX, etc.) execute 100% locally with zero external dependencies.

---

## 3. Subsystem Architecture & Classification

### 3.1 Network Destination Categories
- **`LOCALHOST`**: Loopback IP addresses (`127.0.0.1`, `::1`, `localhost`, `0.0.0.0`) and internal IPC ports (`5123`, `9000..9003`, `11434`, `1234`).
- **`PRIVATE_LAN`**: RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- **`EXTERNAL`**: Public Internet egress (prohibited in air-gap mode).
- **`UNKNOWN`**: Unresolvable or unrecognized address.

### 3.2 Code Call Site Classifications
- **`LOCAL IPC`**: Socket connections to 127.0.0.1 for Rust Core daemon (TCP 9002), Tauri IPC, or internal monitors.
- **`LOCALHOST SERVICE`**: Localhost HTTP server for Tauri UI (Port 5123) or local inference server (Ollama/LM Studio).
- **`LOCAL NETWORK CAPABILITY`**: Subnet management tools (e.g. wifi scan, bluetooth).
- **`EXTERNAL NETWORK`**: Outbound internet calls or cloud APIs.

---

## 4. Verification Matrix

| Capability | Status | Evidence |
| :--- | :--- | :--- |
| **Local AI Inference** | **REAL / UNAVAILABLE** | Resolves local weights on host; returns deterministic `UNAVAILABLE` without downloading when absent. |
| **Model Downloads** | **BLOCKED** | Zero runtime downloads (`hf_hub_download` absent from production path; tested in `test_model_download_prevention.py`). |
| **Cloud APIs** | **BLOCKED / ABSENT** | Zero cloud SDK imports in production default path; runtime monitor blocks any egress attempts. |
| **Local MCP** | **REAL** | Local subprocess execution over `stdio` transport. |
| **Remote MCP** | **BLOCKED** | Remote schemes (`http://`, `https://`, `sse://`, `ws://`) rejected at config initialization. |
| **Knowledge / RAG** | **REAL** | 100% offline document parsing, chunking, local embeddings, SQLite vector indexing, and retrieval. |
| **Multimodal / OCR** | **REAL / UNAVAILABLE** | Uses local Pillow preprocessing and local Tesseract CLI; returns `UNAVAILABLE` if binary absent; 0 network calls. |
| **Sandbox Isolation** | **REAL / LIMITED** | `SECURE` mode denies network; capability accurately reports `RUNTIME_CONTAINED` level without false container claims. |
| **Artifact Generation** | **REAL** | DOCX, XLSX, PPTX, JSON, CSV, Markdown, Code deliverables generated 100% on-premise with zero cloud assets. |
| **External DNS** | **0** | Verified 0 external DNS queries during end-to-end execution (`test_dns_offline.py`, `test_airgap_acceptance.py`). |
| **External TCP/UDP** | **0** | Outbound sockets to external IPs intercepted and blocked with `AirGapViolationError`. |
| **External HTTP/HTTPS** | **0** | Zero outbound HTTP/HTTPS requests during air-gapped lifecycle. |
| **Runtime Downloads** | **0** | Verified zero runtime package managers (`pip`, `npm`, `cargo`) invoked dynamically. |
| **External Telemetry** | **0** | Telemetry restricted to local disk and localhost IPC; zero external tracking. |
