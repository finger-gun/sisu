# @sisu/core

Core contracts and tiny utilities that everything else builds on.

## What it provides
- Types and contracts
  - `Ctx` — the single context object that flows through your pipeline
  - `Middleware<Ctx>` — Koa-style `(ctx, next) => {}` functions
  - `LLM` — model adapter interface with `generate(messages, opts)`
  - `Message` — chat message shape (system/user/assistant/tool)
  - `ModelResponse` — `{ message, usage? }` for non-streaming paths
- Composition
  - `compose(middlewares)` — function composer
  - `Agent` — tiny class with `.use(mw).handler()` convenience
- Utilities
  - `createConsoleLogger({ level, timestamps })` — leveled logger
  - `createTracingLogger(base?)` — wraps a logger and records events
  - `createRedactingLogger(base, { keys?, mask? })` — redacts secrets in logs
  - `InMemoryKV` — basic key-value store with a toy retrieval facade
  - `NullStream` — no-op token sink
  - `SimpleTools` — in-memory tool registry (name → handler)

## Minimal example
```ts
import 'dotenv/config';
import { Agent, type Ctx, createConsoleLogger, InMemoryKV, NullStream, SimpleTools } from '@sisu/core';
import { openAIAdapter } from '@sisu/adapter-openai';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const ctx: Ctx = {
  input: 'Say hello in one sentence.',
  messages: [{ role: 'system', content: 'Be concise.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' })
};

const inputToMessage = async (c: Ctx, next: () => Promise<void>) => { if (c.input) c.messages.push({ role: 'user', content: c.input }); await next(); };
const generateOnce   = async (c: Ctx) => { const r: any = await c.model.generate(c.messages); if (r?.message) c.messages.push(r.message); };

const app = new Agent().use(inputToMessage).use(generateOnce);
await app.handler()(ctx);
console.log(ctx.messages.filter(m => m.role === 'assistant').pop()?.content);
```

## LLM adapters
Use any provider by implementing `LLM.generate(messages, opts)`, or use a ready adapter like `@sisu/adapter-openai` or `@sisu/adapter-ollama`. Adapters can return:
- `Promise<ModelResponse>` for simple, non-streaming calls
- `AsyncIterable<ModelEvent>` for token streaming (wire to `ctx.stream`)

## Logging & tracing
- Use `createConsoleLogger` for leveled logs (debug/info/warn/error)
- Wrap with `createTracingLogger` to capture events for trace viewers
- Wrap with `createRedactingLogger` to mask secrets before printing

## Tools and memory
- `SimpleTools` provides a basic in-memory tool registry (good for demos/tests)
- `InMemoryKV` is a minimal KV store; the `retrieval(index)` method is a toy that you can replace with a real vector DB behind a middleware

## Philosophy
Small, explicit, composable. Sisu’s core stays tiny; everything else — tools, control flow, guardrails, usage/cost, tracing — lives in opt-in middlewares and adapters.
