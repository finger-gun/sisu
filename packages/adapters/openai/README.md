# @sisu-ai/adapter-openai
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fadapter-openai)](https://www.npmjs.com/package/@sisu-ai/adapter-openai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

OpenAI‑compatible Chat adapter with tools support.

## Setup
```bash
npm i @sisu-ai/adapter-openai
```

- Env: `OPENAI_API_KEY` (preferred) or `API_KEY` required.
- Optional: `DEBUG_LLM=1` to log redacted request/response summaries on errors.
 - Base URL: `OPENAI_BASE_URL` or `BASE_URL` can override the base URL (or pass `baseUrl` in code).
 - Examples may support CLI flags to override env at runtime, e.g. `--openai-api-key`, `--openai-base-url`, `--openai-model`.

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Tools
- Sends `tools` and `tool_choice` (or `function_call` compatibility when needed).
- Maps `message.tool_calls` to simplified `{ id, name, arguments }` for the middleware loop.
- Assistant messages that carry only `tool_calls` use `content: null`.

## Usage
```ts
import { openAIAdapter } from '@sisu-ai/adapter-openai';

const model = openAIAdapter({ model: 'gpt-4o-mini' });
// or with a gateway
const model = openAIAdapter({ model: 'gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/' });
```

## Images (Vision)
- Supports OpenAI multi-part content arrays with `type: 'text' | 'image_url'`.
- You can pass OpenAI-style `content` parts directly, or use convenience fields like `images`/`image_url`.

OpenAI-style content parts:
```ts
const messages: any[] = [
  { role: 'system', content: 'You are concise.' },
  {
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/pic.jpg' } },
    ],
  },
];
const res = await model.generate(messages, { toolChoice: 'none' });
```

Convenience shape (adapter builds parts under the hood):
```ts
const messages: any[] = [
  { role: 'system', content: 'You are concise.' },
  { role: 'user', content: 'Describe the image.', images: ['https://example.com/pic.jpg'] },
];
const res = await model.generate(messages, { toolChoice: 'none' });
```

**Cost estimation:** With `@sisu-ai/mw-usage-tracker`, configure pricing per 1M tokens.   

**Examples:**
- gpt-4o-mini: inputPer1M ≈ 0.15, outputPer1M ≈ 0.60
- Images: Prefer `imagePer1K` (e.g., ≈0.217 per 1K images). Alternatively, use `imageInputPer1K` + `imageTokenPerImage`.

 

## Debugging
- `DEBUG_LLM=1` prints sanitized payloads and error bodies.
- Combine with `LOG_LEVEL=debug` to see middleware events.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
