# Fluffy Assistant: Comprehensive LLM System Guide 🤖

This document serves as the complete reference for the Large Language Model (LLM) integration in Fluffy Assistant. It covers setup, multi-provider support, API endpoints, and configuration.

---

## 🚀 Setup & Configuration

Fluffy Assistant uses a multi-provider LLM system (OpenAI, Anthropic, Groq, Ollama) orchestrated through **OpenRouter** or direct API connections.

### Prerequisites

1. **OpenRouter API Key**: Get your key from [OpenRouter](https://openrouter.ai/keys).
2. **Python Dependencies**: `pip install requests python-dotenv sseclient-py`.
3. **Environment**: Copy `.env.example` to `.env` and add your `OPENROUTER_API_KEY`.

### Quick Configuration (`.env`)

```env
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_MODEL=moonshotai/kimi-k2:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:5123
OPENROUTER_APP_NAME=Fluffy Assistant
```

---

## 💎 LLM Provider Options

### 1. OpenRouter (Recommended)

Access multiple models via a single API.

- **Default (Free)**: `moonshotai/kimi-k2:free` (60 RPM, 500K tokens/day).
- **Premium**: `openai/gpt-4o`, `anthropic/claude-3-opus`.

### 2. Groq (Ultra-Fast & Free)

Ideal for low-latency voice interactions.

- **Models**: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`.
- **Limits**: ~30 RPM (Free Tier).

### 3. Local Ollama (Private)

Run models 100% locally on your hardware.

- **Setup**: Download from [ollama.com](https://ollama.com).
- **Models**: `llama3.2` (3B), `phi3` (3.8B), `gemma2` (2B).
- **Env**: `OLLAMA_BASE_URL=http://localhost:11434`.

---

## 📡 API Reference

The Brain service (port 5123) exposes several endpoints for LLM interaction:

### Chat Endpoints

- **`POST /chat/message`**: Process a message (Command or LLM query). Returns structured JSON.
- **`POST /chat/stream`**: Server-Sent Events (SSE) stream for real-time typing effect in UI.

### Settings Endpoints

- **`GET /llm/config`**: Retrieve current configuration (masked API key).
- **`POST /llm/config`**: Update API key or model dynamically.
- **`GET /llm/models`**: List available models with descriptions and cost indicators.

---

## 🧠 Intelligence Logic

### 1. Intent Classification

The system uses the `IntentClassifier` to determine if a user input is a:

- **Local Command**: (e.g., "open notepad") -> Executed directly via `command_executor.py`.
- **General Query**: (e.g., "what is the capital of France?") -> Sent to the LLM.

### 2. Context Awareness

The system maintains the last 10 exchanges for conversational continuity, injected as context in the system prompt.

### 3. Self-Healing Extensions

When a command is missing, the AI can generate a new Python extension, validate its syntax, and hot-load it into the `brain/extensions/` folder.

---

## 🛠️ Troubleshooting

- **401 Unauthorized**: Invalid API key in `.env`.
- **429 Rate Limit**: Switch to a different model or provider.
- **ModuleNotFoundError**: Ensure `pip install -r brain/requirements.txt` was run.

---

_Last Updated: March 2026 | Fluffy Assistant Documentation Project_
