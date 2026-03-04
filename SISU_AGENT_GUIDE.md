# Sisu Framework - Agent Quick Start Guide

> **A TypeScript framework for building reliable AI agents with full transparency and control.**  
> This guide provides the essential information for agents to quickly understand and use Sisu.

## What is Sisu?

Sisu is a middleware-based framework for building AI agents that prioritizes:

- **No surprises** - Explicit middleware, typed tools, deterministic control flow
- **Full control** - Compose planning, routing, and safety like Express apps
- **Total visibility** - Built-in tracing, logging, and debugging
- **Provider-agnostic** - Works with OpenAI, Anthropic, Ollama, or custom adapters

**Philosophy:** Small, explicit, composable. Everything flows through a single typed context—no magic, no hidden state.

## Installation

```bash
# Basic setup
pnpm add @sisu-ai/core @sisu-ai/adapter-openai \
         @sisu-ai/mw-register-tools @sisu-ai/mw-tool-calling \
         @sisu-ai/mw-conversation-buffer @sisu-ai/mw-trace-viewer \
         @sisu-ai/mw-error-boundary zod dotenv
```

## Core Concepts

### 1. Context (Ctx)

Everything flows through a single typed context object:

```typescript
import { createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }), // Required
  input: "What is the weather in Stockholm?", // Optional
  systemPrompt: "You are a helpful assistant.", // Optional
  logLevel: "info", // Optional
});
```

**Context contains:**

- `input` - User input string
- `messages` - Conversation history array
- `model` - LLM adapter instance
- `tools` - Tool registry
- `memory` - Key-value storage
- `state` - Middleware state object
- `signal` - AbortSignal for cancellation
- `log` - Logger instance
- `stream` - Token stream for real-time output

### 2. Middleware Pattern

Compose agent pipelines like Express apps. Middleware signature: `(ctx, next) => Promise<void>`

```typescript
import { Agent } from '@sisu-ai/core';

const app = new Agent()
  .use(errorBoundary())      // Error handling
  .use(traceViewer())        // Debug tracing
  .use(registerTools([...]))  // Register tools
  .use(inputToMessage)       // Convert input to message
  .use(conversationBuffer()) // Manage conversation history
  .use(toolCalling);         // Handle tool calls

await app.handler()(ctx);
```

**Key rules:**

- Always call `await next()` unless intentionally short-circuiting
- Don't mutate unrelated parts of ctx
- Propagate cancellation via `ctx.signal`

### 3. Tools

Define tools with Zod schemas for automatic validation:

```typescript
import { z } from "zod";
import type { Tool } from "@sisu-ai/core";

const weather: Tool<{ city: string }> = {
  name: "getWeather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }) => ({
    city,
    tempC: 21,
    summary: "Sunny",
  }),
};
```

**Tool context is sandboxed** - tools receive restricted context with access to:

- `memory` - Storage access
- `signal` - Cancellation
- `log` - Logging
- `model` - LLM interface
- `deps` - Optional dependency injection

Tools **cannot** access: `tools`, `messages`, `state`, `input`, `stream`

## Minimal Working Example

```typescript
import "dotenv/config";
import { Agent, createCtx, type Tool } from "@sisu-ai/core";
import { registerTools } from "@sisu-ai/mw-register-tools";
import {
  inputToMessage,
  conversationBuffer,
} from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { z } from "zod";

// Define a tool
const weather: Tool<{ city: string }> = {
  name: "getWeather",
  description: "Get weather for a city",
  schema: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, tempC: 21, summary: "Sunny" }),
};

// Create context
const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  input: "What is the weather in Stockholm?",
  systemPrompt: "You are a helpful assistant.",
});

// Build pipeline
const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerTools([weather]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);

// Run
await app.handler()(ctx);
// Open traces/viewer.html to see what happened
```

## LLM Adapters

### OpenAI (and compatible APIs)

```typescript
import { openAIAdapter } from "@sisu-ai/adapter-openai";

// Standard OpenAI
const model = openAIAdapter({ model: "gpt-4o-mini" });

// Compatible API (LM Studio, vLLM, OpenRouter)
const model = openAIAdapter({
  model: "gpt-4o-mini",
  baseUrl: "http://localhost:1234/v1",
});
```

### Anthropic

```typescript
import { anthropicAdapter } from "@sisu-ai/adapter-anthropic";

const model = anthropicAdapter({ model: "claude-sonnet-4" });
```

### Ollama (local)

```typescript
import { ollamaAdapter } from "@sisu-ai/adapter-ollama";

const model = ollamaAdapter({ model: "llama3.1" });
```

## Essential Middleware

### Control Flow

[Documentation](https://github.com/finger-gun/sisu/tree/main/packages/middleware/control-flow)

```typescript
import { sequence, branch, switchCase, loopUntil, parallel, graph } from '@sisu-ai/mw-control-flow';

// Run middlewares in order
.use(sequence([step1, step2, step3]))

// Conditional branching
.use(branch(
  ctx => /weather/.test(ctx.input ?? ''),
  toolPipeline,
  chatPipeline
))

// Route by intent
.use(switchCase(
  ctx => ctx.state.intent,
  {
    'search': searchPipeline,
    'chat': conversationPipeline
  },
  defaultPipeline
))

// Loop until condition
.use(loopUntil(
  ctx => ctx.messages.at(-1)?.role !== 'tool',
  toolCallingBody,
  { max: 6 }
))
```

### Tool Management

```typescript
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';

.use(registerTools([tool1, tool2, tool3]))
.use(toolCalling)  // Automatically handles tool call loops
```

### Conversation Management

```typescript
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { contextCompressor } from '@sisu-ai/mw-context-compressor';

.use(inputToMessage)  // Convert ctx.input to message
.use(conversationBuffer({ window: 8 }))  // Keep last 8 messages
.use(contextCompressor({ maxTokens: 4000 }))  // Compress old messages
```

### Safety & Validation

```typescript
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { guardrails } from '@sisu-ai/mw-guardrails';
import { invariants } from '@sisu-ai/mw-invariants';

.use(errorBoundary())  // Catch and handle errors
.use(guardrails({      // Safety constraints
  maxTokens: 1000,
  timeout: 30000,
  contentFilter: async (text) => !text.includes('forbidden')
}))
.use(invariants())  // Development-mode validation
```

### Observability

```typescript
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';

.use(traceViewer())     // Auto-generate HTML traces
.use(usageTracker())    // Track token usage and costs
```

### Advanced Patterns

```typescript
import { rag } from '@sisu-ai/mw-rag';
import { reactParser } from '@sisu-ai/mw-react-parser';

.use(rag({              // Retrieval augmented generation
  retrieval: vectorDB,
  topK: 3
}))
.use(reactParser())     // ReAct pattern support
```

## Built-in Tools

### Web Tools

```typescript
import { webFetch } from '@sisu-ai/tool-web-fetch';
import { webSearchGoogle } from '@sisu-ai/tool-web-search-google';
import { webSearchDuckDuckGo } from '@sisu-ai/tool-web-search-duckduckgo';
import { wikipedia } from '@sisu-ai/tool-wikipedia';

.use(registerTools([
  webFetch,
  webSearchGoogle,
  wikipedia
]))
```

### Cloud Storage

```typescript
import { awsS3Tool } from '@sisu-ai/tool-aws-s3';
import { azureBlobTool } from '@sisu-ai/tool-azure-blob';

.use(registerTools([awsS3Tool, azureBlobTool]))
```

### Development Tools

```typescript
import { terminal } from '@sisu-ai/tool-terminal';
import { githubProjects } from '@sisu-ai/tool-github-projects';

.use(registerTools([terminal, githubProjects]))
```

### Data Tools

```typescript
import { vectorChroma } from '@sisu-ai/tool-vec-chroma';
import { extractUrls } from '@sisu-ai/tool-extract-urls';
import { summarizeText } from '@sisu-ai/tool-summarize-text';

.use(registerTools([vectorChroma, extractUrls, summarizeText]))
```

## Error Handling

All errors extend `SisuError` with structured information:

```typescript
import {
  isSisuError,
  getErrorDetails,
  SisuError,
  ToolExecutionError,
  ValidationError,
  AdapterError,
  TimeoutError,
  CancellationError,
  ConfigurationError,
} from "@sisu-ai/core";

try {
  await app.handler()(ctx);
} catch (err) {
  if (isSisuError(err)) {
    console.error("Sisu Error:", err.code, err.context);
  } else {
    const details = getErrorDetails(err);
    console.error("Error:", details);
  }
}
```

**Use errorBoundary middleware** to handle errors gracefully:

```typescript
import { errorBoundary } from '@sisu-ai/mw-error-boundary';

.use(errorBoundary(async (err, ctx) => {
  ctx.log.error('Error:', getErrorDetails(err));
  ctx.messages.push({
    role: 'assistant',
    content: 'I encountered an error. Please try again.'
  });
}))
```

## Logging & Tracing

### Basic Logging

```typescript
import { createConsoleLogger, createRedactingLogger } from "@sisu-ai/core";

// Console logger
const logger = createConsoleLogger({
  level: "info", // debug|info|warn|error
  timestamps: true,
});

// Auto-redact secrets (API keys, tokens, passwords)
const safeLogger = createRedactingLogger(logger);
```

### Trace Viewer

Every run auto-generates an interactive HTML trace showing:

- Token usage and costs
- Tool calls with timing
- Full conversation history
- Error details

```typescript
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

.use(traceViewer())

// Open traces/viewer.html after running
```

## Environment Variables

```bash
# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434

# Logging
LOG_LEVEL=info        # debug | info | warn | error
DEBUG_LLM=1           # log adapter requests on errors

# Tracing
TRACE_HTML=1          # auto-generate HTML traces
TRACE_JSON=1          # auto-generate JSON traces
TRACE_STYLE=dark      # light | dark
```

## Common Patterns

### Simple Chat Agent

```typescript
const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(async (ctx) => {
    const res = await ctx.model.generate(ctx.messages, {
      toolChoice: "none",
      signal: ctx.signal,
    });
    if (res?.message) ctx.messages.push(res.message);
  });
```

### Tool-Calling Agent

```typescript
const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerTools([weather, search, calculator]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);
```

### Multi-Step Agent with Control Flow

```typescript
import { sequence, branch, loopUntil } from "@sisu-ai/mw-control-flow";

const classify = async (ctx, next) => {
  ctx.state.needsTools = /weather|search/.test(ctx.input ?? "");
  await next();
};

const toolFlow = sequence([registerTools([weather, search]), toolCalling]);

const chatFlow = sequence([
  async (ctx) => {
    const res = await ctx.model.generate(ctx.messages, { toolChoice: "none" });
    if (res?.message) ctx.messages.push(res.message);
  },
]);

const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(classify)
  .use(branch((ctx) => ctx.state.needsTools, toolFlow, chatFlow));
```

### RAG Agent

```typescript
import { rag } from "@sisu-ai/mw-rag";
import { vectorChroma } from "@sisu-ai/tool-vec-chroma";

const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(
    rag({
      retrieval: (ctx) => ctx.memory.retrieval("docs-index"),
      topK: 3,
      injectMode: "system", // or 'user'
    }),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(async (ctx) => {
    const res = await ctx.model.generate(ctx.messages);
    if (res?.message) ctx.messages.push(res.message);
  });
```

### Streaming Responses

```typescript
import { stdoutStream } from "@sisu-ai/core";

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  input: "Write a short poem",
  stream: stdoutStream(), // Stream to stdout
});

const app = new Agent().use(inputToMessage).use(async (ctx) => {
  const stream = await ctx.model.generate(ctx.messages, { stream: true });
  let fullContent = "";

  for await (const event of stream) {
    if (event.type === "token" && event.delta) {
      fullContent += event.delta;
      await ctx.stream.write(event.delta);
    }
  }

  ctx.messages.push({ role: "assistant", content: fullContent });
});
```

## Testing

Sisu is built for testability. Example test pattern:

```typescript
import { describe, it, expect } from "vitest";
import { createCtx, Agent } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";

describe("Weather Agent", () => {
  it("should fetch weather for a city", async () => {
    const ctx = createCtx({
      model: openAIAdapter({ model: "gpt-4o-mini" }),
      input: "What is the weather in Stockholm?",
    });

    const app = new Agent()
      .use(registerTools([mockWeatherTool]))
      .use(inputToMessage)
      .use(toolCalling);

    await app.handler()(ctx);

    const lastMessage = ctx.messages.at(-1);
    expect(lastMessage?.role).toBe("assistant");
    expect(lastMessage?.content).toContain("Stockholm");
  });

  it("should handle errors gracefully", async () => {
    const ctx = createCtx({
      model: openAIAdapter({ model: "gpt-4o-mini" }),
      input: "Invalid request",
    });

    const app = new Agent().use(errorBoundary()).use(failingMiddleware);

    await expect(app.handler()(ctx)).resolves.not.toThrow();

    const lastMessage = ctx.messages.at(-1);
    expect(lastMessage?.content).toContain("error");
  });
});
```

## Development Workflow

```bash
# Setup (monorepo)
pnpm install
pnpm build

# Run examples
pnpm ex:openai:hello
pnpm ex:openai:weather
pnpm ex:openai:stream
pnpm ex:openai:control-flow

# Testing
pnpm test
pnpm test:coverage  # target ≥80%
pnpm test:watch

# Linting & Type Checking
pnpm lint
pnpm lint:fix
pnpm typecheck
```

## Best Practices

### 1. Always Use Error Boundary

```typescript
.use(errorBoundary())  // First middleware
```

### 2. Enable Tracing During Development

```typescript
.use(traceViewer())  // Second middleware
```

### 3. Validate Tool Inputs with Zod

```typescript
schema: z.object({
  city: z.string().min(1),
  units: z.enum(["C", "F"]).optional(),
});
```

### 4. Use Conversation Buffer to Prevent Context Overflow

```typescript
.use(conversationBuffer({ window: 8 }))
```

### 5. Propagate Cancellation Signals

```typescript
const res = await ctx.model.generate(ctx.messages, {
  signal: ctx.signal, // Always pass signal
});
```

### 6. Keep Middleware Small and Focused

Each middleware should do one thing well and be independently testable.

### 7. Use Control Flow Combinators

Prefer `sequence`, `branch`, `switchCase` over complex conditional logic.

### 8. Never Log Secrets

Use `createRedactingLogger` to auto-redact sensitive data.

### 9. Set Guardrails in Production

```typescript
.use(guardrails({
  maxTokens: 2000,
  timeout: 30000,
  maxCost: 0.50
}))
```

### 10. Test with AbortSignal

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  signal: controller.signal,
});
```

## Quick Reference Links

- **Main Repository**: [github.com/finger-gun/sisu](https://github.com/finger-gun/sisu)
- **Core Package**: [packages/core](https://github.com/finger-gun/sisu/tree/main/packages/core)
- **Examples**: [examples/](https://github.com/finger-gun/sisu/tree/main/examples)
- **Contributing**: [CONTRIBUTING.md](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- **Report Issues**: [New Issue](https://github.com/finger-gun/sisu/issues/new)

### Adapter Documentation

- [OpenAI Adapter](https://github.com/finger-gun/sisu/tree/main/packages/adapters/openai)
- [Anthropic Adapter](https://github.com/finger-gun/sisu/tree/main/packages/adapters/anthropic)
- [Ollama Adapter](https://github.com/finger-gun/sisu/tree/main/packages/adapters/ollama)

### Middleware Documentation

- [Control Flow](https://github.com/finger-gun/sisu/tree/main/packages/middleware/control-flow)
- [Tool Calling](https://github.com/finger-gun/sisu/tree/main/packages/middleware/tool-calling)
- [Conversation Buffer](https://github.com/finger-gun/sisu/tree/main/packages/middleware/conversation-buffer)
- [Error Boundary](https://github.com/finger-gun/sisu/tree/main/packages/middleware/error-boundary)
- [Trace Viewer](https://github.com/finger-gun/sisu/tree/main/packages/middleware/trace-viewer)
- [Guardrails](https://github.com/finger-gun/sisu/tree/main/packages/middleware/guardrails)
- [RAG](https://github.com/finger-gun/sisu/tree/main/packages/middleware/rag)

### Tool Documentation

- [Web Fetch](https://github.com/finger-gun/sisu/tree/main/packages/tools/web-fetch)
- [Web Search (Google)](https://github.com/finger-gun/sisu/tree/main/packages/tools/web-search-google)
- [Terminal](https://github.com/finger-gun/sisu/tree/main/packages/tools/terminal)
- [GitHub Projects](https://github.com/finger-gun/sisu/tree/main/packages/tools/github-projects)
- [Wikipedia](https://github.com/finger-gun/sisu/tree/main/packages/tools/wikipedia)

## Key Takeaways

1. **Context flows through everything** - One typed object, no hidden state
2. **Middleware composes behavior** - Small, testable pieces
3. **Tools are sandboxed** - Restricted context for safety
4. **Errors are structured** - Rich error types with context
5. **Tracing is built-in** - Every run generates debugging traces
6. **Provider-agnostic** - Swap LLMs with one line
7. **Control flow is explicit** - Readable, testable routing
8. **Security by default** - Auto-redacting logger, sandboxed tools

---

_Quiet, determined, relentlessly useful._
