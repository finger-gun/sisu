# @sisu-ai/adapter-ollama

Connect Sisu to local Ollama models with native tool support and streaming.

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

---

## Documentation

**Core** — [Package docs](packages/core/README.md) · [Error types](packages/core/ERROR_TYPES.md)

**Adapters** — [OpenAI](packages/adapters/openai/README.md) · [Anthropic](packages/adapters/anthropic/README.md) · [Ollama](packages/adapters/ollama/README.md)

<details>
<summary>All middleware packages</summary>

- [@sisu-ai/mw-agent-run-api](packages/middleware/agent-run-api/README.md)
- [@sisu-ai/mw-context-compressor](packages/middleware/context-compressor/README.md)
- [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md)
- [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md)
- [@sisu-ai/mw-cors](packages/middleware/cors/README.md)
- [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md)
- [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md)
- [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md)
- [@sisu-ai/mw-orchestration](packages/middleware/orchestration/README.md)
- [@sisu-ai/mw-rag](packages/middleware/rag/README.md)
- [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md)
- [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md)
- [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md)
- [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md)
- [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md)
</details>

<details>
<summary>All tool packages</summary>

- [@sisu-ai/tool-aws-s3](packages/tools/aws-s3/README.md)
- [@sisu-ai/tool-azure-blob](packages/tools/azure-blob/README.md)
- [@sisu-ai/tool-extract-urls](packages/tools/extract-urls/README.md)
- [@sisu-ai/tool-github-projects](packages/tools/github-projects/README.md)
- [@sisu-ai/tool-rag](packages/tools/rag/README.md)
- [@sisu-ai/tool-summarize-text](packages/tools/summarize-text/README.md)
- [@sisu-ai/tool-terminal](packages/tools/terminal/README.md)
- [@sisu-ai/tool-web-fetch](packages/tools/web-fetch/README.md)
- [@sisu-ai/tool-web-search-duckduckgo](packages/tools/web-search-duckduckgo/README.md)
- [@sisu-ai/tool-web-search-google](packages/tools/web-search-google/README.md)
- [@sisu-ai/tool-web-search-openai](packages/tools/web-search-openai/README.md)
- [@sisu-ai/tool-wikipedia](packages/tools/wikipedia/README.md)
</details>

<details>
<summary>All RAG packages</summary>

- [@sisu-ai/rag-core](packages/rag/core/README.md)
</details>

<details>
<summary>All vector packages</summary>

- [@sisu-ai/vector-core](packages/vector/core/README.md)
- [@sisu-ai/vector-chroma](packages/vector/chroma/README.md)
</details>

<details>
<summary>All examples</summary>

**Anthropic** — [hello](examples/anthropic-hello/README.md) · [control-flow](examples/anthropic-control-flow/README.md) · [stream](examples/anthropic-stream/README.md) · [weather](examples/anthropic-weather/README.md)

**Ollama** — [hello](examples/ollama-hello/README.md) · [stream](examples/ollama-stream/README.md) · [vision](examples/ollama-vision/README.md) · [weather](examples/ollama-weather/README.md) · [web-search](examples/ollama-web-search/README.md)

**OpenAI** — [hello](examples/openai-hello/README.md) · [weather](examples/openai-weather/README.md) · [stream](examples/openai-stream/README.md) · [vision](examples/openai-vision/README.md) · [reasoning](examples/openai-reasoning/README.md) · [react](examples/openai-react/README.md) · [control-flow](examples/openai-control-flow/README.md) · [branch](examples/openai-branch/README.md) · [parallel](examples/openai-parallel/README.md) · [graph](examples/openai-graph/README.md) · [orchestration](examples/openai-orchestration/README.md) · [orchestration-adaptive](examples/openai-orchestration-adaptive/README.md) · [guardrails](examples/openai-guardrails/README.md) · [error-handling](examples/openai-error-handling/README.md) · [rag-chroma](examples/openai-rag-chroma/README.md) · [web-search](examples/openai-web-search/README.md) · [web-fetch](examples/openai-web-fetch/README.md) · [wikipedia](examples/openai-wikipedia/README.md) · [terminal](examples/openai-terminal/README.md) · [github-projects](examples/openai-github-projects/README.md) · [server](examples/openai-server/README.md) · [aws-s3](examples/openai-aws-s3/README.md) · [azure-blob](examples/openai-azure-blob/README.md)
</details>

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
