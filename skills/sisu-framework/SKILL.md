---
name: sisu-framework
description: Build AI agents using the Sisu TypeScript framework. Use when creating agents, implementing middleware, defining tools with Zod schemas, setting up LLM adapters (OpenAI, Anthropic, Ollama), or working with agent control flow, tracing, and observability.
---

# Sisu Framework

Build reliable AI agents in TypeScript with full transparency and control.

## When to use this skill

- Creating new AI agents or agent pipelines
- Implementing tool calling with LLM models
- Setting up middleware for control flow, error handling, or tracing
- Working with multiple LLM providers (OpenAI, Anthropic, Ollama)
- Debugging agent behavior with trace viewers
- Building RAG (Retrieval Augmented Generation) systems

## Quick start

### Installation

```bash
pnpm add @sisu-ai/core @sisu-ai/adapter-openai \
         @sisu-ai/mw-register-tools @sisu-ai/mw-tool-calling \
         @sisu-ai/mw-conversation-buffer @sisu-ai/mw-trace-viewer \
         @sisu-ai/mw-error-boundary zod dotenv
```

### Basic agent template

```typescript
import "dotenv/config";
import { Agent, createCtx, type Tool } from "@sisu-ai/core";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { inputToMessage, conversationBuffer } from "@sisu-ai/mw-conversation-buffer";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { z } from "zod";

// Create context
const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  input: "User input here",
  systemPrompt: "You are a helpful assistant.",
});

// Build pipeline
const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerTools([...]))  // Add tools here
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);

// Run
await app.handler()(ctx);
```

## Core concepts

### Context (Ctx)

Everything flows through a single typed context object. Never create hidden state.

**Key properties:**

- `input` - User input string
- `messages` - Conversation history
- `model` - LLM adapter
- `tools` - Tool registry
- `memory` - Key-value storage
- `state` - Middleware state
- `signal` - AbortSignal for cancellation
- `log` - Logger

### Middleware pattern

Middleware signature: `(ctx, next) => Promise<void>`

**Critical rules:**

- Always `await next()` unless short-circuiting
- Don't mutate unrelated ctx properties
- Propagate `ctx.signal` to all async operations

```typescript
const myMiddleware = async (ctx, next) => {
  // Before logic
  ctx.log.info("Starting");

  await next(); // MUST call this

  // After logic
  ctx.log.info("Finished");
};
```

### Tools with Zod validation

```typescript
import { z } from "zod";
import type { Tool } from "@sisu-ai/core";

const myTool: Tool<{ city: string }> = {
  name: "toolName",
  description: "Clear description for the LLM",
  schema: z.object({
    city: z.string().min(1),
  }),
  handler: async ({ city }, ctx) => {
    // ctx is sandboxed - has memory, signal, log, model, deps
    // Cannot access: tools, messages, state, input, stream
    return { result: "data" };
  },
};
```

## Common patterns

### Simple chat agent

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

### Tool-calling agent

```typescript
const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerTools([tool1, tool2]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);
```

### Agent with control flow

See [CONTROL_FLOW.md](CONTROL_FLOW.md) for branching, looping, and parallel execution.

### RAG agent

See [RAG.md](RAG.md) for retrieval augmented generation patterns.

## LLM adapters

### OpenAI

```typescript
import { openAIAdapter } from "@sisu-ai/adapter-openai";

// Standard OpenAI
const model = openAIAdapter({ model: "gpt-4o-mini" });

// Compatible APIs (LM Studio, vLLM, OpenRouter)
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

## Essential middleware

### Control flow

```typescript
import { sequence, branch, switchCase, loopUntil } from '@sisu-ai/mw-control-flow';

// Sequential steps
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
  { 'search': searchFlow, 'chat': chatFlow }
))
```

### Safety and validation

```typescript
import { guardrails } from '@sisu-ai/mw-guardrails';
import { invariants } from '@sisu-ai/mw-invariants';

.use(errorBoundary())  // Always first
.use(guardrails({
  maxTokens: 2000,
  timeout: 30000
}))
.use(invariants())  // Development mode validation
```

### Observability

```typescript
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';

.use(traceViewer())   // Generates HTML traces
.use(usageTracker())  // Tracks costs
```

## Error handling

```typescript
import {
  isSisuError,
  getErrorDetails,
  ToolExecutionError,
  ValidationError,
} from "@sisu-ai/core";

try {
  await app.handler()(ctx);
} catch (err) {
  if (isSisuError(err)) {
    console.error("Code:", err.code);
    console.error("Context:", err.context);
  } else {
    console.error(getErrorDetails(err));
  }
}
```

Use errorBoundary middleware:

```typescript
.use(errorBoundary(async (err, ctx) => {
  ctx.log.error('Error:', getErrorDetails(err));
  ctx.messages.push({
    role: 'assistant',
    content: 'I encountered an error.'
  });
}))
```

## Environment variables

```bash
# Required for examples
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
LOG_LEVEL=info           # debug|info|warn|error
TRACE_HTML=1            # Generate HTML traces
TRACE_STYLE=dark        # light|dark
```

## Best practices

1. **Always use errorBoundary** as first middleware
2. **Enable traceViewer** during development (second middleware)
3. **Validate tool inputs** with Zod schemas
4. **Use conversationBuffer** to prevent context overflow
5. **Propagate ctx.signal** to all async operations
6. **Keep middleware small** - one responsibility each
7. **Use control flow combinators** over complex conditionals
8. **Never log secrets** - use createRedactingLogger
9. **Set guardrails** in production (maxTokens, timeout)
10. **Test with AbortSignal** for cancellation

## Common mistakes

### ❌ Not calling next()

```typescript
// WRONG
const bad = async (ctx, next) => {
  ctx.state.value = 1;
  // Missing await next()!
};
```

### ❌ Not propagating signal

```typescript
// WRONG
const res = await ctx.model.generate(ctx.messages, {});

// CORRECT
const res = await ctx.model.generate(ctx.messages, {
  signal: ctx.signal,
});
```

### ❌ Mutating other middleware state

```typescript
// WRONG - don't touch other middleware state
ctx.state.otherMiddlewareData = modified;

// CORRECT - namespace your state
ctx.state.myFeature = { myData: value };
```

### ❌ Using console.log

```typescript
// WRONG
console.log("debug info");

// CORRECT
ctx.log.info("debug info");
```

## Reference documentation

For detailed documentation, see:

- [CONTROL_FLOW.md](CONTROL_FLOW.md) - Branching, loops, parallel, graphs
- [RAG.md](RAG.md) - Retrieval augmented generation
- [TOOLS.md](TOOLS.md) - Built-in tools (web, cloud, dev)
- [STREAMING.md](STREAMING.md) - Token streaming patterns
- [SISU_SKILLS.md](SISU_SKILLS.md) - Filesystem-based skills support
- [EXAMPLES.md](EXAMPLES.md) - 25+ working examples from the repo

## External resources

- **Main repo**: [github.com/finger-gun/sisu](https://github.com/finger-gun/sisu)
- **Core docs**: [packages/core](https://github.com/finger-gun/sisu/tree/main/packages/core)
- **Examples**: [examples/](https://github.com/finger-gun/sisu/tree/main/examples)
- **Middleware list**: [packages/middleware](https://github.com/finger-gun/sisu/tree/main/packages/middleware)
- **Tools list**: [packages/tools](https://github.com/finger-gun/sisu/tree/main/packages/tools)
