# @sisu-ai/core

Core contracts and tiny utilities that everything else builds on.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fcore)](https://www.npmjs.com/package/@sisu-ai/core)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/core
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

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
  - `stdoutStream` — writes tokens to stdout (CLI streaming)
  - `SimpleTools` — in-memory tool registry (name → handler)

## Minimal example
```ts
import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });

const ctx: Ctx = {
  input: 'Say hello in one short sentence.',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const inputToMessage = async (c: Ctx, next: () => Promise<void>) => { if (c.input) c.messages.push({ role: 'user', content: c.input }); await next(); };
const generateOnce = async (c: Ctx) => { const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal }); if (res?.message) c.messages.push(res.message); };

const app = new Agent()
  .use(async (c, next) => { try { await next(); } catch (e) { c.log.error(e); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); } })
  .use(traceViewer())
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }, { logPerCall: true }))
  .use(inputToMessage)
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
```

## LLM adapters
Use any provider by implementing `LLM.generate(messages, opts)`, or use a ready adapter like `@sisu-ai/adapter-openai` or `@sisu-ai/adapter-ollama`. Adapters can return:
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

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
