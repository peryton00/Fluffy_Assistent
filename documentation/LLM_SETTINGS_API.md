# LLM Settings API Documentation

This document describes the new LLM settings API endpoints that allow users to configure the LLM from Fluffy's settings UI.

## New Endpoints

### GET /llm/config
Get current LLM configuration

**Headers:**
- `X-Fluffy-Token`: fluffy_dev_token

**Response:**
```json
{
  "ok": true,
  "config": {
    "api_key": "sk-or-v1...",
    "api_key_configured": true,
    "model": "moonshotai/kimi-k2:free",
    "base_url": "https://openrouter.ai/api/v1",
    "site_url": "http://localhost:5123",
    "app_name": "Fluffy Assistant"
  }
}
```

### POST /llm/config
Update LLM configuration (API key and/or model)

**Headers:**
- `X-Fluffy-Token`: fluffy_dev_token
- `Content-Type`: application/json

**Request Body:**
```json
{
  "api_key": "sk-or-v1-your-new-key",
  "model": "moonshotai/kimi-k2:free"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Configuration updated successfully",
  "config": {
    "api_key": "sk-or-v1...",
    "api_key_configured": true,
    "model": "moonshotai/kimi-k2:free",
    "base_url": "https://openrouter.ai/api/v1",
    "site_url": "http://localhost:5123",
    "app_name": "Fluffy Assistant"
  }
}
```

### GET /llm/models
Get list of available LLM models

**Headers:**
- `X-Fluffy-Token`: fluffy_dev_token

**Response:**
```json
{
  "ok": true,
  "models": [
    {
      "id": "moonshotai/kimi-k2:free",
      "name": "Kimi K2 (Free)",
      "description": "Free tier model with 60 RPM, 500K tokens/day",
      "cost": "Free",
      "recommended": true
    },
    {
      "id": "openai/gpt-3.5-turbo",
      "name": "GPT-3.5 Turbo",
      "description": "Fast and affordable OpenAI model",
      "cost": "Paid"
    }
  ]
}
```

## Default Model: Kimi K2 Free

The default model has been changed to **moonshotai/kimi-k2:free** which offers:
- **Rate Limits**: 60 requests per minute
- **Token Limit**: 500K tokens per day
- **Cost**: Completely free (no cost for input/output)
- **Format**: OpenAI-compatible API

## Usage Example

### From JavaScript (Tauri UI)

```javascript
// Get current configuration
const response = await fetch('http://localhost:5123/llm/config', {
  headers: {
    'X-Fluffy-Token': 'fluffy_dev_token'
  }
});
const data = await response.json();
console.log('Current model:', data.config.model);

// Update API key
await fetch('http://localhost:5123/llm/config', {
  method: 'POST',
  headers: {
    'X-Fluffy-Token': 'fluffy_dev_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    api_key: 'sk-or-v1-your-new-key'
  })
});

// Change model
await fetch('http://localhost:5123/llm/config', {
  method: 'POST',
  headers: {
    'X-Fluffy-Token': 'fluffy_dev_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'openai/gpt-4'
  })
});

// Get available models
const modelsResponse = await fetch('http://localhost:5123/llm/models', {
  headers: {
    'X-Fluffy-Token': 'fluffy_dev_token'
  }
});
const modelsData = await modelsResponse.json();
console.log('Available models:', modelsData.models);
```

## Settings UI Integration

To integrate this into Fluffy's settings UI:

1. **Settings Page**: Add an "AI Settings" section
2. **API Key Input**: Text input (password type) for API key
3. **Model Selector**: Dropdown populated from `/llm/models` endpoint
4. **Save Button**: Calls `/llm/config` POST endpoint
5. **Status Indicator**: Shows if API key is configured

### Example UI Flow

```
┌─────────────────────────────────────┐
│ AI Settings                         │
├─────────────────────────────────────┤
│ API Key: [••••••••••••]  [Change]  │
│ Status: ✓ Configured                │
│                                     │
│ Model: [Kimi K2 (Free) ▼]          │
│                                     │
│ Available Models:                   │
│ • Kimi K2 (Free) - Recommended     │
│ • GPT-3.5 Turbo                    │
│ • GPT-4                            │
│ • Claude 3 Haiku                   │
│                                     │
│ [Save Settings]                     │
└─────────────────────────────────────┘
```

## Configuration Persistence

- Configuration is saved to `.env` file
- Changes persist across restarts
- API key is masked in responses (shows only first 8 characters)
- `.env` file is excluded from git via `.gitignore`

## Security Notes

- All endpoints require authentication token
- API key is never fully exposed in responses
- Configuration changes are logged
- Only accessible from localhost
