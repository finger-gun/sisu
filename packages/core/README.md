# @sisu-ai/core

Build reliable TypeScript agents with explicit context, composable middleware, and typed tools.

Lightweight core contracts and utilities that give you full control over your AI agent pipelines. No magic, no hidden state—just composable middleware and typed tools that you can understand, test, and debug.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fcore)](https://www.npmjs.com/package/@sisu-ai/core)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

---

## Why @sisu-ai/core?

**Minimal & Focused** - Just the essentials. No bloat, no opinions.  
**Fully Typed** - TypeScript-first with strict mode support.  
**Composable** - Build complex agents from simple, testable pieces.  
**Transparent** - Everything flows through one typed context—what you see is what runs.  
**Production-Ready** - Built-in error handling, logging, and secret redaction.

---

## Quick Start

### Install
```bash
npm i @sisu-ai/core
```

### 60-Second Example
```ts
import 'dotenv/config';
import {
  Agent,
  createCtx,
  execute,
  getExecutionResult,
  inputToMessage,
} from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';

// 1. Create your context
const ctx = createCtx({
  model: openAIAdapter({ model: 'gpt-5.4' }),
  input: 'Say hello in one short sentence.',
  systemPrompt: 'You are a helpful assistant.',
  logLevel: 'info'
});

// 2. Build your pipeline (middleware style)
const app = new Agent().use(inputToMessage).use(execute);

// 3. Run it!
await app.handler()(ctx);
const result = getExecutionResult(ctx);
console.log('Result:', result?.text);
```

**Want more?** Check out the [examples](https://github.com/finger-gun/sisu/tree/main/examples) or the [full documentation](https://github.com/finger-gun/sisu).

---

## What's Inside

### Core Types & Contracts
Build on solid TypeScript foundations:

- **`Ctx`** - The single context object flowing through your pipeline
- **`ToolContext`** - Sandboxed context for safe tool execution
- **`Middleware<Ctx>`** - Koa-style `(ctx, next) => {}` functions
- **`LLM`** - Model adapter interface with `generate(messages, opts)`
- **`Message`** - Chat message shape (system/user/assistant/tool)
- **`Tool<TArgs, TResult>`** - Tool handler with schema validation

### Composition Utilities
Compose complex behavior from simple pieces:

- **`compose(middlewares)`** - Function composition for pipelines
- **`Agent`** - Convenient class with `.use(mw).handler()`

### Context & Helpers
Everything you need to get started:

- **`createCtx(options)`** - Factory with sensible defaults (**Recommended**)
- **`execute`** / **`executeWith(opts)`** - Non-streaming execution middleware
- **`executeStream`** - Streaming execution middleware (`.use(executeStream)` or `.use(executeStream(opts))`)
- **`getExecutionResult(ctx)`** / **`getExecutionEvents(ctx)`** - Read typed execution outputs from context state
- **`createConsoleLogger({ level, timestamps })`** - Leveled logging
- **`createTracingLogger(base?)`** - Captures events for trace viewers
- **`createRedactingLogger(base, opts)`** - Auto-redacts secrets
- **`InMemoryKV`** - Basic key-value store with toy retrieval
- **`NullStream`** / **`stdoutStream`** - Token stream implementations
- **`SimpleTools`** - In-memory tool registry

### Error Handling
Structured errors for better debugging:

- **`SisuError`** - Base error with codes and context
- **`MiddlewareError`** / **`ToolExecutionError`** / **`AdapterError`**
- **`ValidationError`** / **`TimeoutError`** / **`CancellationError`**
- **`isSisuError(error)`** - Type guard for error handling
- **`getErrorDetails(error)`** - Extract structured error info

---

## Creating a Context

### Using createCtx (Recommended)
Reduce boilerplate with sensible defaults:

```ts
import { createCtx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';

const ctx = createCtx({
  model: openAIAdapter({ model: 'gpt-5.4' }),  // Required
  input: 'Say hello in one short sentence.',       // Optional
  systemPrompt: 'You are a helpful assistant.',    // Optional
  logLevel: 'info'                                  // Optional
});
```

**All `createCtx` options:**

| Option | Type | Description |
|--------|------|-------------|
| `model` | `LLM` | **Required** - LLM adapter instance |
| `input` | `string` | User input message |
| `systemPrompt` | `string` | System message for conversation |
| `logLevel` | `Level` | `'debug'` \| `'info'` \| `'warn'` \| `'error'` |
| `timestamps` | `boolean` | Enable/disable log timestamps |
| `signal` | `AbortSignal` | For operation cancellation |
| `tools` | `Tool[]` \| `ToolRegistry` | Tool array or registry |
| `memory` | `Memory` | Defaults to `InMemoryKV` |
| `stream` | `TokenStream` | Defaults to `NullStream` |
| `state` | `object` | Initial middleware state |

### Manual Creation
For full control, create `Ctx` manually:

```ts
import { 
  createConsoleLogger, 
  InMemoryKV, 
  NullStream, 
  SimpleTools, 
  type Ctx 
} from '@sisu-ai/core';

const ctx: Ctx = {
  input: 'Say hello in one short sentence.',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model: openAIAdapter({ model: 'gpt-5.4' }),
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' }),
};
```

---

## LLM Adapters

Use any provider by implementing `LLM.generate(messages, opts)`:

**Official adapters:**
- [`@sisu-ai/adapter-openai`](https://github.com/finger-gun/sisu/tree/main/packages/adapters/openai) - OpenAI & compatible APIs
- [`@sisu-ai/adapter-ollama`](https://github.com/finger-gun/sisu/tree/main/packages/adapters/ollama) - Local inference
- [`@sisu-ai/adapter-anthropic`](https://github.com/finger-gun/sisu/tree/main/packages/adapters/anthropic) - Claude models

**Return types:**
- `Promise<ModelResponse>` for non-streaming calls
- `AsyncIterable<ModelEvent>` for token streaming

---

## Execution APIs (Recommended)

Use core execution APIs as the primary runtime path.

### Non-streaming

```ts
import {
  Agent,
  createCtx,
  execute,
  getExecutionResult,
  inputToMessage,
} from '@sisu-ai/core';

const ctx = createCtx({ model, input: 'What is the weather in Malmö?' });
const app = new Agent().use(inputToMessage).use(execute);

await app.handler()(ctx);
const result = getExecutionResult(ctx);

console.log(result?.text);
console.log(result?.toolExecutions.length ?? 0);
```

### Streaming

```ts
import {
  Agent,
  createCtx,
  executeStream,
  getExecutionResult,
  inputToMessage,
  teeStream,
  stdoutStream,
  bufferStream,
} from '@sisu-ai/core';

const buf = bufferStream();
const ctx = createCtx({
  model,
  input: 'Explain stars simply.',
});
const app = new Agent()
  .use(inputToMessage)
  .use(executeStream({ sink: teeStream(stdoutStream, buf.stream) }));

await app.handler()(ctx);
console.log('\nFinal:', getExecutionResult(ctx)?.text);
```

`executeStream` can be used either as `.use(executeStream)` (uses `ctx.stream`, defaulting to `NullStream`) or as `.use(executeStream({ sink }))` for a fixed sink.

### Migration from legacy `mw-tool-calling`

```ts
// Before
app.use(registerTools([weather])).use(inputToMessage).use(toolCalling);
await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();

// After
import { execute, getExecutionResult } from '@sisu-ai/core';
app.use(registerTools([weather])).use(inputToMessage).use(execute);
await app.handler()(ctx);
console.log(getExecutionResult(ctx)?.text);
```

---

## Logging & Tracing

### Basic Logging
```ts
import { createConsoleLogger } from '@sisu-ai/core';

const logger = createConsoleLogger({ 
  level: 'info',      // debug|info|warn|error
  timestamps: true 
});

logger.info('Processing request');
logger.error('Something failed', { error });
```

### Tracing Logger
Capture events for debugging and visualization:

```ts
import { createTracingLogger, createConsoleLogger } from '@sisu-ai/core';

const { logger, getTrace, reset } = createTracingLogger(
  createConsoleLogger()
);

// Use logger normally
logger.info('Step 1');
logger.debug('Step 2');

// Get captured events
const events = getTrace();
console.log(events); // Array of { level, ts, args }
```

### Redacting Secrets
**Never log sensitive data accidentally.**

The redacting logger auto-detects and masks:
- API keys (OpenAI `sk-...`, Google `AIza...`, AWS `AKIA...`)
- Auth tokens (JWT, GitHub PAT, OAuth)
- Common secret key names (`apiKey`, `password`, `token`, etc.)

```ts
import { createRedactingLogger, createConsoleLogger } from '@sisu-ai/core';

// Use defaults
const logger = createRedactingLogger(createConsoleLogger());

logger.info({ apiKey: 'sk-1234567890abcdef...' });
// Output: { apiKey: '***REDACTED***' }

// Customize
const customLogger = createRedactingLogger(createConsoleLogger(), {
  keys: ['customSecret'],         // Additional key names
  patterns: [/custom-\d{4}/],     // Custom regex patterns
  mask: '[HIDDEN]'                // Change redaction text
});
```

**Default protected patterns:**
- OpenAI keys (`sk-...`)
- JWT tokens
- GitHub tokens (PAT, OAuth, fine-grained)
- GitLab Personal Access Tokens
- Google API keys & OAuth
- AWS Access Key IDs
- Slack tokens

---

## Tools & Memory

### SimpleTools Registry
Basic in-memory tool storage (perfect for demos and tests):

```ts
import { SimpleTools } from '@sisu-ai/core';

const tools = new SimpleTools();
tools.register(myTool);

const tool = tools.get('myTool');
const allTools = tools.list();
```

### InMemoryKV Store
Minimal key-value storage with toy retrieval:

```ts
import { InMemoryKV } from '@sisu-ai/core';

const memory = new InMemoryKV();

// Basic KV operations
await memory.set('key', { data: 'value' });
const data = await memory.get('key');

// Toy retrieval (replace with real vector DB in production)
const retrieval = memory.retrieval('docs-index');
const results = await retrieval.search('query', 4);
```

### Tool Context Sandboxing
Tools receive **restricted context** for safety and clarity:

**Available in ToolContext:**
- `memory` - Persistent storage access
- `signal` - AbortSignal for cancellation
- `log` - Logger for debugging
- `model` - LLM interface (for meta-tools)
- `deps` - Optional dependency injection

**Not available (sandboxed):**
- `tools` - Prevents recursive tool calls
- `messages` - Prevents conversation manipulation
- `state` - Prevents middleware state access
- `input` / `stream` - Prevents I/O interference

**Example:**
```ts
import type { Tool, ToolContext } from '@sisu-ai/core';
import { z } from 'zod';

export const myTool: Tool<{ input: string }> = {
  name: 'myTool',
  description: 'Example with restricted context',
  schema: z.object({ input: z.string() }),
  handler: async ({ input }, ctx: ToolContext) => {
    // Can use: memory, signal, log, model, deps
    ctx.log.info('Processing', { input });
    
    // Access storage
    const cached = await ctx.memory.get('cache-key');
    
    // Use injected dependencies (for testing)
    const client = ctx.deps?.apiClient;
    
    return { result: `Processed: ${input}` };
  }
};
```

**Dependency injection for testing:**
```ts
// Inject dependencies via ctx.state.toolDeps
ctx.state = {
  toolDeps: {
    apiClient: mockClient,
    config: { timeout: 5000 }
  }
};

// Tools receive these via ctx.deps
```

---

## Error Handling

Sisu provides **structured errors** with codes, context, and stack traces.

### Error Types

All errors extend `SisuError` with:
- `code` - Machine-readable (e.g., `'TOOL_EXECUTION_ERROR'`)
- `message` - Human-readable description
- `context` - Structured error data
- `toJSON()` - Serialization support

**Available classes:**

```ts
import {
  SisuError,           // Base error class
  MiddlewareError,     // Middleware failures
  ToolExecutionError,  // Tool failures
  AdapterError,        // LLM adapter errors
  ValidationError,     // Schema validation
  TimeoutError,        // Operation timeouts
  CancellationError,   // Cancelled operations
  ConfigurationError,  // Invalid configuration
} from '@sisu-ai/core';
```

### Throwing Errors

```ts
import { ToolExecutionError, ValidationError, ConfigurationError } from '@sisu-ai/core';

// Configuration errors
if (!apiKey) {
  throw new ConfigurationError(
    'API key is required',
    { provided: config },
    'apiKey must be a non-empty string'
  );
}

// Validation errors
const result = schema.safeParse(input);
if (!result.success) {
  throw new ValidationError(
    'Invalid tool arguments',
    result.error.errors,
    input
  );
}

// Tool execution errors
try {
  const data = await fetchData();
} catch (err) {
  throw new ToolExecutionError(
    'Failed to fetch data',
    'fetchData',
    { url: args.url },
    err as Error
  );
}
```

### Catching Errors

```ts
import { isSisuError, getErrorDetails } from '@sisu-ai/core';

try {
  await app.handler()(ctx);
} catch (err) {
  if (isSisuError(err)) {
    // Structured Sisu error
    console.error('Error:', err.code, err.context);
  } else {
    // Generic error
    const details = getErrorDetails(err);
    console.error('Error:', details);
  }
}
```

### Error Boundary Middleware

Use [`@sisu-ai/mw-error-boundary`](https://github.com/finger-gun/sisu/tree/main/packages/middleware/error-boundary) to catch and handle errors:

```ts
import { errorBoundary } from '@sisu-ai/mw-error-boundary';

agent.use(errorBoundary(async (err, ctx) => {
  ctx.log.error('Error caught:', getErrorDetails(err));
  
  ctx.messages.push({
    role: 'assistant',
    content: 'I encountered an error. Please try again.'
  });
}));
```

### Trace Viewer Integration

The trace viewer automatically displays structured error info:

```ts
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

agent.use(traceViewer());
```

**Error traces include:**
- Error name and code (e.g., `ToolExecutionError [TOOL_EXECUTION_ERROR]`)
- Error message
- Structured context (tool name, arguments, etc.)
- Full stack trace (collapsible)

---

## Philosophy

**Small. Explicit. Composable.**

Sisu's core stays intentionally minimal. Everything else—tools, control flow, guardrails, cost tracking, tracing—lives in opt-in middlewares and adapters.

**No magic.** What you write is what runs. Everything flows through a single typed context you can inspect, test, and debug.

---

## Learn More

- [**Main Documentation**](https://github.com/finger-gun/sisu) - Full framework guide
- [**Examples**](https://github.com/finger-gun/sisu/tree/main/examples) - Working examples for every use case
- [**Adapters**](https://github.com/finger-gun/sisu/tree/main/packages/adapters) - OpenAI, Anthropic, Ollama
- [**Middleware**](https://github.com/finger-gun/sisu/tree/main/packages/middleware) - Control flow, tools, tracing, and more
- [**Tools**](https://github.com/finger-gun/sisu/tree/main/packages/tools) - Ready-to-use tools for common tasks

---

## Community & Support

- [**Contributing Guide**](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md) - Start here
- [**Code of Conduct**](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [**Report a Bug**](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [**Request a Feature**](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
- [**License (Apache 2.0)**](https://github.com/finger-gun/sisu/blob/main/LICENSE)

---

<div align="center">

**Built with care and sisu.**

*Quiet, determined, relentlessly useful.*

[Star on GitHub](https://github.com/finger-gun/sisu) • [View on npm](https://www.npmjs.com/package/@sisu-ai/core)

</div>

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
- [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md) *(legacy compatibility)*
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
