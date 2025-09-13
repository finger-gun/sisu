# @sisu-ai/adapter-ollama

Ollama Chat adapter with native tools support.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fadapter-ollama)](https://www.npmjs.com/package/@sisu-ai/adapter-ollama)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/adapter-ollama
```

- Start Ollama locally: `ollama serve`
- Pull a tools-capable model: `ollama pull llama3.1:latest`


## Usage
```ts
import { ollamaAdapter } from '@sisu-ai/adapter-ollama';

const model = ollamaAdapter({ model: 'llama3.1' });
// or with custom base URL: { baseUrl: 'http://localhost:11435' }
```

## Images (Vision)
- Accepts multi-part `content` arrays with `type: 'text' | 'image_url'` and convenience fields like `images`/`image_url`.
- The adapter maps these to Ollama's expected shape by sending `content` as a string and `images` as a string array on the message.
- If an image value is an `http(s)` URL, the adapter fetches it and inlines it as base64 automatically. Data URLs are supported; raw base64 strings pass through.

Content parts (adapter maps to `images[]` under the hood and auto-fetches URLs):
```ts
const messages: any[] = [
  { role: 'user', content: [
    { type: 'text', text: 'What is in this image?' },
    { type: 'image_url', image_url: { url: 'https://example.com/pic.jpg' } },
  ] }
];
const res = await model.generate(messages, { toolChoice: 'none' });
```

Convenience shape:
```ts
const messages: any[] = [
  { role: 'user', content: 'Describe the image.', images: ['https://example.com/pic.jpg'] },
];
const res = await model.generate(messages, { toolChoice: 'none' });
```

### Normalizing Ollama API
- Providers such as OpenAI vision models accepts `image_url` parts with `url` pointing to a remote image; the provider dereferences the URL.
- Ollama expects each message to include `images: string[]` of base64-encoded image data; it does not dereference remote URLs.
- This adapter keeps the authoring experience consistent by accepting OpenAI-style parts and convenience URLs, and performs URL→base64 conversion for you.

### Accepted image formats
- Base64 string: `images: ["<base64>"]` (preferred/default for Ollama)
- Data URL: `images: ["data:image/png;base64,<base64>"]` or in parts via `{ type: 'image_url', image_url: { url: 'data:...' } }`
- Remote URL (convenience): `{ type: 'image_url', image_url: { url: 'https://...' } }` or `images: ['https://...']` — adapter fetches and inlines as base64.

Note: URL fetching happens from your runtime. If your environment blocks outbound HTTP, either provide base64 directly or host images where your runtime can reach them.

## Tools
- Define tools as small, named functions with a zod schema.
- Register them on your agent and add the tool-calling middleware — the adapter handles the wire format to/from Ollama.
- Under the hood, the adapter sends your tool schemas to the model, maps model “function calls” back to your handlers, and includes tool results for follow‑up turns.

Quick start with tools
```ts
import { Agent, InMemoryKV, NullStream, SimpleTools, createConsoleLogger, type Ctx, type Tool } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { z } from 'zod';
import { ollamaAdapter } from '@sisu-ai/adapter-ollama';

const sum: Tool<{ a: number; b: number }> = {
  name: 'sum',
  description: 'Add two numbers',
  schema: z.object({ a: z.number(), b: z.number() }),
  handler: async ({ a, b }) => ({ result: a + b }),
};

const model = ollamaAdapter({ model: 'llama3.1' });
const ctx: Ctx = {
  input: 'Use the sum tool to add 3 and 7, then explain.',
  messages: [{ role: 'system', content: 'You are helpful.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger(),
};

const app = new Agent()
  .use(registerTools([sum])) // make tools available
  .use(toolCalling);         // let the model pick tools, run them, and finalize

await app.handler()(ctx);
```

## Notes
- Tool choice forcing is model-dependent; current loop asks for tools on first turn and plain completion on second.
- Streaming can be added via Ollama's streaming API if desired.
 - Env: `OLLAMA_BASE_URL` or `BASE_URL` can override the base URL (or pass `baseUrl` in code). Examples may also support a CLI flag `--base-url` to override env.


# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
