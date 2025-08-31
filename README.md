![sisu](sisu-logo.jpg)
> Grit‑powered agents. Quiet, determined, relentlessly useful.

**Sisu** is a lightweight TypeScript framework for turning intent into action. Inspired by the Finnish idea of sisu—calm resolve under pressure—Sisu favors explicit tools, predictable plans, and built‑in guardrails. No ceremony, no mystery: compose, decide, do.

## Why Sisu?
- Everything is middleware: compose planning, tools, routing, safety like you compose Express/Koa apps.
- One ctx, zero magic: a single typed context flows through; what you see is what runs.
- Typed tools, explicit loops: tool calls and control flow are first‑class and deterministic.
- Provider‑agnostic, adapter‑friendly: OpenAI, Ollama (local), or your own HTTP client.
- Built‑in observability: structured logs, redaction, and an HTML trace viewer per run.

## 90‑Second Example
Turn intent into action with a clear, inspectable pipeline.

**Install the packages used below:**
```bash
npm i \
  @sisu-ai/core @sisu-ai/adapter-openai \
  @sisu-ai/mw-register-tools @sisu-ai/mw-conversation-buffer \
  @sisu-ai/mw-tool-calling @sisu-ai/mw-control-flow \
  @sisu-ai/mw-trace-viewer @sisu-ai/mw-error-boundary \
  zod dotenv
```

**Write something awesome with code:**

```ts
import 'dotenv/config';
import { Agent, type Ctx, createConsoleLogger, InMemoryKV, NullStream, SimpleTools } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { switchCase, sequence, loopUntil } from '@sisu-ai/mw-control-flow';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { z } from 'zod';

const weather = {
  name: 'getWeather',
  description: 'Get weather for a city',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => ({ city, tempC: 21, summary: 'Sunny (stub)' }),
};

const model = openAIAdapter({ model: 'gpt-4o-mini' });
const ctx: Ctx = {
  input: 'Weather in Stockholm and plan a fika.',
  messages: [{ role: 'system', content: 'Use tools when needed.' }],
  model, tools: new SimpleTools(), memory: new InMemoryKV(),
  stream: new NullStream(), state: {}, signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' }),
};

const intent = async (c: Ctx, next: () => Promise<void>) => {
  c.state.intent = /weather|forecast/i.test(c.input ?? '') ? 'tooling' : 'chat';
  await next();
};
const decideMore = async (c: Ctx, next: () => Promise<void>) => {
  const wasTool = c.messages.at(-1)?.role === 'tool';
  c.state.moreTools = Boolean(wasTool && (c.state.turns ?? 0) < 1);
  c.state.turns = (c.state.turns ?? 0) + 1;
  await next();
};

const toolingBody = sequence([ toolCalling, decideMore ]);
const toolingLoop = loopUntil(c => !c.state.moreTools, toolingBody, { max: 6 });
const chatBody = sequence([ async (c) => {
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
}]);

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer({ style: 'dark' }))
  .use(registerTools([weather as any]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }))
  .use(intent)
  .use(switchCase((c) => String(c.state.intent), { tooling: toolingLoop, chat: chatBody }, chatBody));

await app.handler()(ctx);
console.log(ctx.messages.filter(m => m.role === 'assistant').pop()?.content);
```

## Core Ideas
- Koa‑style middleware: `(ctx, next) => { …; await next(); … }` gives “onion” control—before/after work is explicit and composable.
- Single ctx: no hidden globals. Everything lives on `ctx` so it’s easy to reason about and test.
- Typed tools: tool schemas inform tool loops and protect your handlers.
- Control flow is code: `sequence`, `branch`, `switchCase`, `loopUntil`, `parallel`, `graph`—you read the plan in the code.
- Deterministic modes: timeouts, bounded loops, retries are explicit—in your hands.
- Observability by default: leveled logs, redaction, and a trace viewer that writes `traces/run-*.html`.

## Run your first Mile
- OpenAI hello:
  - `cp examples/openai-hello/.env.example examples/openai-hello/.env`
  - `npm run ex:openai:hello`
  - Open `examples/openai-hello/traces/trace.html`
- Ollama hello (local):
  - `ollama serve && ollama pull llama3.1:latest`
  - `npm run ex:ollama:hello`
  - Open `examples/ollama-hello/traces/trace.html`

## Find your inner strength
- [packages/core](packages/core/README.md)
- Adapters: [OpenAI](packages/adapters/openai/README.md), [Ollama](packages/adapters/ollama/README.md)
- Middlewares:
  - [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md)
  - [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md)
  - [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md)
  - [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md)
  - [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md)
  - [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md)
  - [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md)
  - [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md)
  - [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md)
  - [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md)

## Adapters

### OpenAI
- Env
  - `OPENAI_API_KEY`: API key (required)
  - `OPENAI_BASE_URL` or `BASE_URL`: override base URL (or pass `baseUrl` in code)
  - Optional: `DEBUG_LLM=1` to log redacted request/response summaries on errors
- Tools
  - Supports `tools` + `tool_choice`, returns `message.tool_calls`
  - Assistant tool_calls messages use `content: null` when no text
  - Follow‑up completion disables tools by default
- Usage
  ```ts
  import { openAIAdapter } from '@sisu-ai/adapter-openai';
  const model = openAIAdapter({ model: 'gpt-4o-mini' });
  // ctx.model = model
  ```
 - Images
   - Send multi-part content arrays with `type: 'text' | 'image_url'`
   - Example user message: `[{ type: 'text', text: 'What is in this image?' }, { type: 'image_url', image_url: { url: 'https://…jpg' } }]`
   - See `examples/openai-vision`

### Ollama (local)
- Env
  - `OLLAMA_BASE_URL` or `BASE_URL`: override base URL (or pass `baseUrl` in code). Default `http://localhost:11434`.
- Tools
  - Native tools support via `tools` field; adapter maps `GenerateOptions.tools`
  - Returns `message.tool_calls`; adapter preserves tool interactions in history
- Usage
  ```ts
  import { ollamaAdapter } from '@sisu-ai/adapter-ollama';
  const model = ollamaAdapter({ model: 'llama3.1' });
  // ctx.model = model
  ```

## Configuration (Env & Flags)
- Env vars (adapters)
  - `OPENAI_API_KEY`: API key for OpenAI/gateway
  - `OPENAI_BASE_URL` or `BASE_URL`: override base URL for OpenAI adapter
  - `OLLAMA_BASE_URL` or `BASE_URL`: override base URL for Ollama adapter
- Env vars (runtime)
  - `LOG_LEVEL`: `debug|info|warn|error` (default `info`)
  - `DEBUG_LLM`: `1|true` to log adapter request/response summaries on errors
- Trace viewer flags
  - CLI: `--trace` (optional `--trace=run.json|run.html`), `--trace-style=light|dark|modern`
  - Env: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=light|dark|modern`
- Notes
  - Adapters accept `baseUrl` in code; env overrides are convenient for examples and scripts.
  - Examples accept a trailing prompt string; use quotes to preserve spaces.

## Debugging Tips
- Set `LOG_LEVEL=debug` to see control‑flow, tool loop, and invariant logs.
- Set `DEBUG_LLM=1` to log redacted HTTP payloads from the OpenAI adapter when a call fails (status + body snippet).
- The trace viewer writes `run.json` and `run.html` for quick scanning of messages and events.

## Design Notes
- Core stays small and stable; everything else is opt‑in middleware.
- Protocol correctness is enforced by the tool‑calling loop and `@sisu-ai/mw-invariants`.
- The logging stack supports levels, redaction, and tracing without external services.


# Developers
You are free to help out. Built an awesome middleware? Found a bug? Lets go!

- [packages/core](packages/core/README.md) — minimal contracts (`Ctx`, `Middleware`, `compose`, `Agent`, tools, memory, stream, logger)
- [packages/adapters/openai](packages/adapters/openai/README.md) — OpenAI‑compatible Chat adapter (tools support, DEBUG_LLM)
- [packages/adapters/ollama](packages/adapters/ollama/README.md) — Ollama (local/offline) Chat adapter
- packages/middleware/* — optional middlewares:
  - [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md) — input→message + windowed truncation
  - [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md) — `sequence`, `branch`, `switchCase`, `loopWhile/loopUntil`, `parallel`, `graph`
  - [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md) — try/catch with fallback
  - [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md) — ReAct fallback loop
  - [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md) — bulk tool registration
  - [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md) — tools API loop with id‑anchored replies
  - [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md) — token usage + cost estimation
  - [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md) — JSON + HTML trace export (themes, templating)
  - [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md) — protocol checks (tool_calls ↔ tool replies)
  - [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md) — policy guard
- `examples/openai-hello` — base‑minimum hello example (OpenAI)
- `examples/openai-weather` — tool‑calling demo with branching + loop (OpenAI)
- `examples/openai-react` — ReAct-style tool use with OpenAI
- `examples/openai-guardrails` — guardrails + single turn
- `examples/openai-control-flow` — intent router between chat and tooling
- `examples/openai-branch` — route between playful vs practical response
- `examples/openai-parallel` — fork two sub-tasks then merge
- `examples/openai-graph` — small DAG: classify → (draft|chat) → polish
- `examples/ollama-hello` — hello using Ollama locally
- `examples/ollama-weather` — tool-calling with Ollama

## Quick Start
```bash
npm i
npm run build -ws

# Hello (minimal)
cp examples/openai-hello/.env.example examples/openai-hello/.env
# put your OPENAI_API_KEY into .env
npm run dev -w examples/openai-hello -- "Say hello in one sentence." --trace --trace-style=modern

# Weather tool (tools + control flow)
cp examples/openai-weather/.env.example examples/openai-weather/.env
npm run dev -w examples/openai-weather -- "Weather in Stockholm and plan a fika." --trace --trace-style=dark

# Vision (image input)
cp examples/openai-vision/.env.example examples/openai-vision/.env
npm run dev -w examples/openai-vision -- --trace --trace-style=modern
# Tip: configure @sisu-ai/mw-usage-tracker with image pricing (e.g. imageInputPer1K)
```

## Publishing
We use Changesets to manage versioning and releases for each package.

Prereqs
- Ensure you are logged in to npm: `npm whoami` (or `npm login`)
- Have publish rights for the `@sisu-ai/*` scopes and 2FA if required

Flow
1) Create a changeset for your changes
```bash
npm run changeset
# pick packages, write a summary
git add . && git commit -m "chore: changeset"
```
2) Version the packages (applies the changesets)
```bash
npm run version-packages
git add . && git commit -m "chore: version packages"
git push
```
3) Publish to npm
```bash
npm run release
# If 2FA enabled, enter OTP when prompted
```

Notes
- Packages are configured with `publishConfig.access = public` and ship `dist/` only.
- `.changeset/config.json` ignores `examples/*` when computing releases.
- CI can run `npm run release` on the `main` branch if desired; Changesets supports automated publishing.
