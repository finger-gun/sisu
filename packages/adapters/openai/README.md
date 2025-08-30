# @sisu/adapter-openai

OpenAI‑compatible Chat adapter with tools support.

## Setup
- Env: `OPENAI_API_KEY` required.
- Optional: `DEBUG_LLM=1` to log redacted request/response summaries on errors.

## Tools
- Sends `tools` and `tool_choice` (or `function_call` compatibility when needed).
- Maps `message.tool_calls` to simplified `{ id, name, arguments }` for the middleware loop.
- Assistant messages that carry only `tool_calls` use `content: null`.

## Usage
```ts
import { openAIAdapter } from '@sisu/adapter-openai';

const model = openAIAdapter({ model: 'gpt-4o-mini' });
// or with a gateway
const model = openAIAdapter({ model: 'gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/' });
```

## Debugging
- `DEBUG_LLM=1` prints sanitized payloads and error bodies.
- Combine with `LOG_LEVEL=debug` to see middleware events.

