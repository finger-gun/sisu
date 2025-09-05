# @sisu-ai/adapter-anthropic

Anthropic Messages API adapter with tool calling and streaming.

## Setup
```bash
npm i @sisu-ai/adapter-anthropic
```

- Env: `ANTHROPIC_API_KEY` (preferred) or `API_KEY` required
- Optional base URL: `ANTHROPIC_BASE_URL` (or `BASE_URL`)
- Optional debug: `DEBUG_LLM=1` to log redacted request/response summaries on errors

## Usage
```ts
import { anthropicAdapter } from '@sisu-ai/adapter-anthropic';

const model = anthropicAdapter({ model: 'claude-3-5-sonnet-20240620' });
// with a self-hosted proxy
const model = anthropicAdapter({ model: 'claude-3-opus-20240229', baseUrl: 'https://api.anthropic.com' });
```

## Tools
- Sends `tools` in Anthropic format (`name`, `description`, `input_schema`).
- Sends `tool_choice` only when `tools` exist (Anthropic rejects `tool_choice` without tools).
- Maps assistant tool calls to `{ id, name, arguments }` for the middleware loop.
- Maps tool results into Anthropic `tool_result` blocks and back.

## Streaming
- Supports server‑sent events from the Messages API.
- Emits `{ type: 'token', token }` events for content deltas and a final `{ type: 'assistant_message', message }`.

## Options
```ts
anthropicAdapter({
  model: 'claude-3-5-sonnet-20240620',
  apiKey?: string,            // default: ANTHROPIC_API_KEY or API_KEY
  baseUrl?: string,           // default: https://api.anthropic.com (or ANTHROPIC_BASE_URL / BASE_URL)
  anthropicVersion?: string,  // default: 2023-06-01
  timeout?: number,           // default: 60000 ms
  maxRetries?: number,        // default: 3 (with backoff; 4xx except 429 are not retried)
});
```

## Message mapping
- System messages → `system` string (joined if multiple system messages appear)
- User messages → `{ role: 'user', content: [{ type: 'text', text }] }`
- Assistant messages with tool calls → `tool_use` blocks with `{ id, name, input }`
- Tool messages → user `tool_result` blocks with `{ tool_use_id | name, content }`

## Usage reporting
The adapter maps `usage.input_tokens` and `usage.output_tokens` to `{ promptTokens, completionTokens, totalTokens }`.

## Debugging
- `DEBUG_LLM=1` prints sanitized payloads and error bodies.
- Combine with your app logger’s `LOG_LEVEL=debug` to see middleware events.

