# OpenAI Reasoning Models Example

Demonstrates reasoning model support (o1, o3, ChatGPT 5.1) with preserved reasoning context across conversation turns.

## Features

- Reasoning model integration (o1, o3, ChatGPT 5.1 via OpenRouter)
- Multi-turn conversations with preserved reasoning context
- Automatic reasoning_details handling
- Usage tracking for reasoning models
- Trace visualization of reasoning flow

## Usage

- Quick start (from project root): `npm run ex:openai:reasoning`

## Config Flags (CLI overrides env)

- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model` (e.g., `gpt-4o`, `o1-preview`, `openai/gpt-5.1`)
- Tracing: `--trace` and `--trace-style=light|dark`

## Environment Variables

- `OPENAI_API_KEY` or `API_KEY` (required)
- `OPENAI_BASE_URL` or `BASE_URL` (optional, defaults to OpenAI)
- `OPENAI_MODEL` (default: `gpt-4o`)
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`

## Model Configuration Examples

### Regular OpenAI (Recommended for testing)
```bash
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o  # Has reasoning capabilities
# OPENAI_BASE_URL is not needed (uses default)
```

### OpenAI o1/o3 Series (Advanced reasoning)
```bash
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=o1-preview  # or o1-mini, o3-mini
# OPENAI_BASE_URL is not needed (uses default)
```

### OpenRouter (ChatGPT 5.1)
```bash
export OPENAI_BASE_URL=https://openrouter.ai/api/v1
export OPENAI_API_KEY=sk-or-v1-xxx
export OPENAI_MODEL=openai/gpt-5.1
```

## What This Example Shows

1. **Initial reasoning request** with complex problem requiring deep thought
2. **Reasoning context preservation** in multi-turn conversation  
3. **Automatic reasoning_details handling** by the adapter
4. **Usage tracking** with reasoning model costs
5. **Trace visualization** showing reasoning flow and context preservation

## Note About Reasoning Parameter

- **With reasoning models** (o1, o3, ChatGPT 5.1): The `reasoning: true` parameter enables extended thinking and returns `reasoning_details`
- **With regular models** (gpt-4o, gpt-4o-mini): The reasoning parameter is ignored, but the conversation still works normally
- The example demonstrates both scenarios and shows how reasoning context is preserved when available

## Troubleshooting

### Error: Missing API Key
```
❌ Error: OPENAI_API_KEY or API_KEY environment variable required
```
**Solution**: Set `OPENAI_API_KEY` in your `.env` file or export it before running.

### Error: 405/400 Model Not Supported
```
⚠️  Model may not support the reasoning parameter
```
**Solution**: Verify you're using a reasoning-capable model:
- o1-preview, o1-mini, o3-preview (OpenAI)
- gpt-5.1 (via OpenRouter with correct `OPENAI_BASE_URL`)

### No Reasoning Details Captured
```
⚠️  No reasoning_details in response
```
**Normal behavior** for standard models (gpt-4o, gpt-3.5). Use o1/o3 models for extended reasoning.

### High Costs
Reasoning models use more tokens. To optimize:
- Use o1-mini instead of o1-preview for most tasks
- Enable reasoning only when needed
- Monitor usage with the built-in tracker

## Output Example

When run successfully, you'll see:

```
🚀 OpenAI Reasoning Model Example
══════════════════════════════════════════════════
Model: o1-preview
Base URL: default OpenAI
API Key: sk-proj-...
══════════════════════════════════════════════════

📍 TURN 1: Initial Reasoning Request
Question: How many times does the letter "r" appear...

💭 Assistant Response:
There are 3 'r's in "strawberry"

🧠 Reasoning Details:
──────────────────────────────────────────────────
📝 Summary (234 chars):
I need to count the letter 'r' in 'strawberry'...
🔒 Encrypted contexts: 2 preserved for next turn
──────────────────────────────────────────────────
✅ Reasoning context captured and will be preserved

📍 TURN 2: Follow-up Question
...
```

## Learn More

- [OpenAI Adapter Reasoning Documentation](../../packages/adapters/openai/README.md#reasoning-models-support)
- [Story 001: Reasoning Implementation](../../docs/stories/story-001-reasoning-model-support.md)
- [Story 002: Production Validation](../../docs/stories/story-002-reasoning-production-validation.md)