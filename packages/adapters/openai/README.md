# @sisu-ai/adapter-openai

Connect Sisu to OpenAI and OpenAI-compatible APIs with tools and streaming support.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fadapter-openai)](https://www.npmjs.com/package/@sisu-ai/adapter-openai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/adapter-openai
```

- Env: `API_KEY`.
- Optional: `DEBUG_LLM=1` to log redacted request/response summaries on errors.
 - Base URL: `BASE_URL` (or pass `baseUrl` in code).
 - Examples may support CLI flags to override env at runtime, e.g. `--openai-api-key`, `--openai-base-url`, `--openai-model`.

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Tools
- Sends `tools` and `tool_choice` (or `function_call` compatibility when needed).
- Maps `message.tool_calls` to simplified `{ id, name, arguments }` for the middleware loop.
- Assistant messages that carry only `tool_calls` use `content: null`.

## Usage
```ts
import { createEmbeddingsClient } from '@sisu-ai/core';
import { openAIAdapter, openAIEmbeddings } from '@sisu-ai/adapter-openai';

const model = openAIAdapter({ model: 'gpt-4o-mini' });
// or with a gateway
const model = openAIAdapter({ model: 'gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/' });

const embeddings = openAIEmbeddings({ model: 'text-embedding-3-small' });
const vectors = await embeddings.embed(['first text', 'second text']);

const genericEmbeddings = createEmbeddingsClient({
  apiKey: process.env.API_KEY,
  baseUrl: process.env.BASE_URL || 'https://api.openai.com',
  model: 'text-embedding-3-small',
});
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

## Reasoning Models Support

The OpenAI adapter supports reasoning/thinking models (o1-preview, o1-mini, o3, ChatGPT 5.1) that provide extended chain-of-thought capabilities through internal reasoning that can be preserved across conversation turns.

### Quick Start

Enable reasoning with a simple boolean flag:

```typescript
import { openAIAdapter } from '@sisu-ai/adapter-openai';

const llm = openAIAdapter({ model: 'o1-preview' });

const response = await llm.generate(
  [{ role: 'user', content: 'How many "r"s are in "strawberry"?' }],
  { reasoning: true }
);

console.log(response.message.content); // "There are 3 'r's in 'strawberry'"
console.log(response.message.reasoning_details); // Contains reasoning context
```

### Reasoning Parameter Formats

The adapter accepts two formats for the `reasoning` parameter:

```typescript
// Boolean (recommended) - automatically normalized to { enabled: true }
{ reasoning: true }

// Object format (OpenAI native) - passed through as-is
{ reasoning: { enabled: true } }
```

### Understanding reasoning_details

When reasoning is enabled, the API returns a `reasoning_details` field in the assistant message. This field is **opaque** (provider-specific) and typically contains:

```typescript
// Example structure (actual format may vary by provider)
{
  reasoning_details: [
    {
      type: 'reasoning.summary',
      summary: '...human-readable reasoning process...'
    },
    {
      type: 'reasoning.encrypted',
      data: '...encrypted internal state...'
    }
  ]
}
```

**Important characteristics:**

- **Summary**: Contains a human-readable explanation of the model's thinking process (when available)
- **Encrypted contexts**: Preserve internal model state for improved multi-turn coherence
- **Opaque format**: Treat as a black box; do not modify or parse
- **Preservation required**: Must be included in subsequent turns for optimal performance

### Multi-Turn Conversations

For multi-turn conversations with reasoning, you **must** preserve the entire assistant message including `reasoning_details`:

```typescript
const llm = openAIAdapter({ model: 'o1-preview' });

// First turn
const response1 = await llm.generate(
  [{ role: 'user', content: 'Solve this complex math problem...' }],
  { reasoning: true }
);

// Build conversation history - CRITICAL: include full message with reasoning_details
const messages = [
  { role: 'user', content: 'Solve this complex math problem...' },
  response1.message, // Complete message with reasoning_details
  { role: 'user', content: 'Now explain your reasoning step-by-step' }
];

// Second turn - reasoning context is automatically preserved
const response2 = await llm.generate(messages, { reasoning: true });
```

**Why preservation matters:**
- Improves response accuracy on follow-up questions
- Maintains reasoning coherence across turns
- Enables the model to reference its previous thinking
- Required by some models for optimal performance

### Supported Models

| Model | Provider | Reasoning Support | Notes |
|-------|----------|-------------------|-------|
| o1-preview | OpenAI | ✅ Full | Extended reasoning, higher cost |
| o1-mini | OpenAI | ✅ Full | Faster reasoning, lower cost |
| o3-preview | OpenAI | ✅ Full | Next-gen reasoning (limited access) |
| gpt-5.1 | OpenRouter | ✅ Full | Via OpenRouter with `baseUrl` |
| gpt-4o | OpenAI | ⚠️ Partial | Accepts parameter but limited reasoning |
| gpt-4o-mini | OpenAI | ⚠️ Partial | Accepts parameter but limited reasoning |

**Usage with OpenRouter:**
```typescript
const llm = openAIAdapter({
  model: 'gpt-5.1',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY
});
```

### Cost Considerations

Reasoning models typically have higher costs due to extended thinking time:

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Notes |
|-------|----------------------|------------------------|-------|
| o1-preview | ~$15-20 | ~$60-80 | Premium reasoning |
| o1-mini | ~$3-5 | ~$12-15 | Cost-effective reasoning |
| gpt-5.1 | Varies | Varies | Check OpenRouter pricing |

**Tips for cost optimization:**
- Use `o1-mini` for most reasoning tasks
- Reserve `o1-preview` for complex problems requiring deep analysis
- Enable reasoning only when needed (not for simple queries)
- Use `temperature: 0.1` or lower for deterministic output

### Streaming Support

Reasoning is fully supported in streaming mode:

```typescript
const stream = await llm.generate(
  [{ role: 'user', content: 'Complex question...' }],
  { reasoning: true, stream: true }
);

for await (const event of stream) {
  if (event.type === 'token') {
    process.stdout.write(event.token);
  } else if (event.type === 'assistant_message') {
    // reasoning_details available in final message
    console.log('\nReasoning captured:', event.message.reasoning_details);
  }
}
```

### Troubleshooting

**Error: 400/405 when enabling reasoning**

Some models don't support the reasoning parameter. Try:
- Verify you're using a reasoning-capable model (o1-preview, o1-mini, etc.)
- Check that your API key has access to reasoning models
- Ensure `baseUrl` is correct (especially for OpenRouter)

```typescript
try {
  const res = await llm.generate(messages, { reasoning: true });
} catch (error) {
  if (error.message.includes('405') || error.message.includes('400')) {
    console.error('Model may not support reasoning parameter');
    console.error('Try: o1-preview, o1-mini, or gpt-5.1 via OpenRouter');
  }
  throw error;
}
```

**No reasoning_details in response**

This is normal for non-reasoning models:
- Standard GPT-4/GPT-3.5 models accept the parameter but don't return reasoning details
- The adapter handles this gracefully - no error, just no `reasoning_details` field

**Multi-turn context lost**

Ensure you're preserving the complete message:
```typescript
// ✅ Correct - preserves reasoning_details
messages.push(response.message);

// ❌ Wrong - loses reasoning_details
messages.push({ role: 'assistant', content: response.message.content });
```

**High costs**

Reasoning models use more tokens:
- Monitor usage with `@sisu-ai/mw-usage-tracker`
- Use `o1-mini` instead of `o1-preview` when possible
- Enable reasoning only for complex tasks

### Complete Example

See the [openai-reasoning example](../../../examples/openai-reasoning/) for a full working demonstration including:
- Basic reasoning usage
- Multi-turn conversations with preserved context
- Error handling
- Usage tracking
- Trace visualization

## Debugging
- `DEBUG_LLM=1` prints sanitized payloads and error bodies.
- Combine with `LOG_LEVEL=debug` to see middleware events.


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
