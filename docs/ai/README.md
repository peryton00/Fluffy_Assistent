# AI & LLM Architecture Documentation

This directory contains specifications, provider configurations, and integration guidelines for the Fluffy Assistant AI & Agent system.

---

## Subsystem Guides

- [**Local AI Runtime Specification**](./LOCAL_AI_RUNTIME.md): Architecture for offline local LLM inference engines (Llama.cpp, Ollama, ONNX Runtime), hardware acceleration, and model memory management.
- [**Model Router & Multi-Provider Architecture**](./MODEL_ROUTER.md): Intent routing, latency optimization, provider fallbacks (Groq, OpenRouter, OpenAI, Anthropic, Ollama), and Server-Sent Events (SSE) token streaming.

---

## Core Capabilities

1. **Multi-Provider LLM Orchestration**: Supports cloud providers (Groq for low-latency voice responses, OpenRouter, OpenAI, Anthropic) and private local instances (Ollama).
2. **Two-Stage Intent Parsing**:
   - **Stage 1 (Classification)**: Fast categorization into `chat`, `command`, `confirmation`, or `new_feature`.
   - **Stage 2 (Extraction)**: Structured argument extraction matching tool/intent schemas.
3. **Conversational Context & Memory**: Multi-turn history with active session persistence and long-term user preference memory.
4. **Self-Healing Extension Generation**: Generates custom Python plugins, runs AST validation, tests execution, and repairs errors via a 3-retry feedback loop.
