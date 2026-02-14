# LLM Integration Setup Guide

This guide will help you set up the LLM integration with OpenRouter API.

## Prerequisites

1. **OpenRouter API Key**: Get your free API key from [OpenRouter](https://openrouter.ai/keys)
2. **Python Dependencies**: Install required packages

## Step 1: Install Dependencies

```bash
cd c:\Users\sudip\OneDrive\Desktop\webProjects\FluffyAssistent
pip install -r requirements.txt
```

This will install:
- `flask` - Web API framework
- `requests` - HTTP client
- `python-dotenv` - Environment variable management
- `sseclient-py` - Server-sent events client

## Step 2: Configure API Key

1. Copy the example environment file:
   ```bash
   copy .env.example .env
   ```

2. Open `.env` in a text editor and add your OpenRouter API key:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-actual-api-key-here
   OPENROUTER_MODEL=openai/gpt-3.5-turbo
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   OPENROUTER_SITE_URL=http://localhost:5123
   OPENROUTER_APP_NAME=Fluffy Assistant
   ```

3. **Important**: Never commit the `.env` file to git! It's already in `.gitignore`.

## Step 3: Choose Your Model

OpenRouter supports many models. Here are some popular options:

### Fast & Affordable
- `openai/gpt-3.5-turbo` - OpenAI's GPT-3.5 (recommended for testing)
- `meta-llama/llama-3.1-8b-instruct` - Meta's Llama 3.1

### Balanced
- `anthropic/claude-3-haiku` - Anthropic's Claude 3 Haiku
- `google/gemini-pro` - Google's Gemini Pro

### Premium
- `openai/gpt-4` - OpenAI's GPT-4
- `anthropic/claude-3-opus` - Anthropic's Claude 3 Opus

Update the `OPENROUTER_MODEL` in your `.env` file to use a different model.

## Step 4: Test the Integration

### Test 1: Configuration
```bash
cd ai\src
python llm_config.py
```

Expected output:
```
Configuration: LLMConfig(model=openai/gpt-3.5-turbo, api_key=sk-or-v1..., ...)
Is Configured: True
✓ Configuration loaded successfully!
```

### Test 2: LLM Client
```bash
python llm_client.py
```

Expected output: A streaming response to "What is the capital of France?"

### Test 3: Intent Classifier
```bash
python intent_classifier.py
```

Expected output: Test results showing command vs prompt classification accuracy

### Test 4: Full Service
```bash
python llm_service.py
```

Expected output: Mixed commands and LLM queries being processed correctly

## Step 5: Run Fluffy with LLM

Start all three components:

**Terminal 1 - Core (Rust)**
```bash
cd core
cargo run
```

**Terminal 2 - Brain (Python)**
```bash
cd brain
python listener.py
```

**Terminal 3 - UI (Tauri)**
```bash
cd ui\tauri
npm run tauri dev
```

## Usage Examples

### In the Fluffy UI Chat:

**Local Commands** (executed immediately, no LLM):
- "open notepad"
- "create file test.txt in desktop"
- "close chrome"

**LLM Prompts** (sent to OpenRouter):
- "what is the weather like today?"
- "explain how AI works"
- "tell me a joke"

**Ambiguous Cases** (handled intelligently):
- "how do I open an application?" → LLM (asking for help)
- "what does chrome do?" → LLM (asking for information)

## API Endpoints

The following endpoints are now available:

### POST /chat/message
Process a message (command or LLM query)

```json
{
  "message": "what is AI?",
  "session_id": "optional-session-id",
  "use_voice": false
}
```

Response:
```json
{
  "ok": true,
  "type": "llm",
  "message": "AI stands for Artificial Intelligence..."
}
```

### POST /chat/stream
Stream LLM responses with Server-Sent Events

```json
{
  "message": "explain quantum computing",
  "use_voice": true
}
```

Returns: SSE stream with chunks as they arrive

## Troubleshooting

### "API key not configured"
- Make sure you created the `.env` file
- Check that `OPENROUTER_API_KEY` is set correctly
- Restart the Brain service after changing `.env`

### "API Error (401)"
- Your API key is invalid
- Get a new key from https://openrouter.ai/keys

### "API Error (429)"
- You've hit the rate limit
- Wait a few minutes or upgrade your OpenRouter plan

### "Module not found"
- Run `pip install -r requirements.txt`
- Make sure you're in the correct directory

### "Connection Error"
- Check your internet connection
- Verify the OpenRouter API is accessible

## Cost Management

OpenRouter charges per token. To manage costs:

1. **Use cheaper models**: `gpt-3.5-turbo` is much cheaper than `gpt-4`
2. **Monitor usage**: Check your usage at https://openrouter.ai/activity
3. **Set limits**: Configure spending limits in your OpenRouter account
4. **Clear history**: Use `llm_service.clear_history()` to reduce context size

## Security Notes

- ✅ API key is stored in `.env` (not in code)
- ✅ `.env` is in `.gitignore` (won't be committed)
- ✅ API endpoints require authentication token
- ✅ API only accessible from localhost

**Never share your `.env` file or commit it to version control!**

## Next Steps

- Integrate with the Tauri UI for a chat interface
- Add conversation history persistence
- Implement multi-turn conversations with context
- Add support for function calling / tool use
- Create custom system prompts for different tasks

Enjoy your AI-powered Fluffy Assistant! 🐰✨
