```
      _           
  ___(_)___ _   _ 
 / __| / __| | | |
 \__ \ \__ \ |_| |
 |___/_|___/\__,_|         
```
> Grit-powered agents. Quiet, determined, and relentlessly useful.

# Sisu

Sisu is a lightweight TypeScript framework for turning intent into action. Inspired by the Finnish idea of sisu—calm resolve under pressure—Sisu favors explicit tools, predictable plans, and built‑in guardrails. No ceremony, no mystery: compose, decide, do.

Everything is middleware. A tiny, composable TypeScript framework for LLM + tools agents.

## Features
- Minimal core, maximal clarity — small surface, strong primitives
- Typed tools — explicit contracts for inputs/outputs (safe by default)
- Planner‑agnostic — swap ReAct, tree/graph search, rules, or your own
- Deterministic modes — reproducible runs (timeouts, retries, budgets)
- Observability — structured traces you can stream to your stack

## Monorepo Layout
- `packages/core` — minimal contracts (`Ctx`, `Middleware`, `compose`, `Agent`, tools, memory, stream, logger)
- `packages/adapters/openai` — OpenAI‑compatible Chat adapter (tools support, DEBUG_LLM)
- `packages/adapters/ollama` — Ollama (local/offline) Chat adapter
- `packages/middleware/*` — optional middlewares:
  - `@sisu/mw-conversation-buffer` — input→message + windowed truncation
  - `@sisu/mw-control-flow` — `sequence`, `branch`, `switchCase`, `loopWhile/loopUntil`, `parallel`, `graph`
  - `@sisu/mw-error-boundary` — try/catch with fallback
  - `@sisu/mw-react-parser` — ReAct fallback loop
  - `@sisu/mw-register-tools` — bulk tool registration
  - `@sisu/mw-tool-calling` — tools API loop with id‑anchored replies
  - `@sisu/mw-usage-tracker` — token usage + cost estimation
  - `@sisu/mw-trace-viewer` — JSON + HTML trace export (themes, templating)
  - `@sisu/mw-invariants` — protocol checks (tool_calls ↔ tool replies)
- `examples/hello-agent` — base‑minimum hello example
- `examples/weather-tool` — tool‑calling demo with branching + loop

## Quick Start
```bash
npm i
npm run build -ws

# Hello (minimal)
cp examples/hello-agent/.env.example examples/hello-agent/.env
# put your OPENAI_API_KEY into .env
npm run dev -w examples/hello-agent -- "Say hello in one sentence." --trace --trace-style=modern

# Weather tool (tools + control flow)
cp examples/weather-tool/.env.example examples/weather-tool/.env
npm run dev -w examples/weather-tool -- "Weather in Stockholm and plan a fika." --trace --trace-style=dark
```

## Adapter — OpenAI (tools ready)
- Env: `OPENAI_API_KEY` required; optional `DEBUG_LLM=1` to log redacted request/response summaries.
- Tools: sends `tools` + `tool_choice` and parses `message.tool_calls`.
- Subtleties handled:
  - Assistant tool_calls messages use `content: null` when no text.
  - Follow‑up call after tools disables further tools by default.

## Middleware Highlights
- `@sisu/mw-tool-calling`
  - First turn: `toolChoice: 'auto'` with your registered tools.
  - Executes each unique `(name,args)` once but responds to every `tool_call_id` (required by providers).
  - Second turn: forces a pure completion (`toolChoice: 'none'`).
- `@sisu/mw-usage-tracker`
  - `.use(usageTracker({ 'openai:gpt-4o-mini': { inputPer1K: 0.15, outputPer1K: 0.6 }, '*': { inputPer1K: 0.15, outputPer1K: 0.6 } }, { logPerCall: true }))`
  - Aggregates `promptTokens`, `completionTokens`, `totalTokens`; estimates `costUSD` if a price table is provided.
- `@sisu/mw-trace-viewer`
  - `.use(traceViewer({ style: 'dark' }))` or pass a custom `template(doc, style)` to render HTML your way.
  - CLI/env: `--trace`, `--trace=run.json|run.html`, `--trace-style=light|dark|modern`, `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=dark`.
- `@sisu/mw-invariants`
  - `.use(toolCallInvariant({ strict: false }))` logs any missing tool responses; with `strict:true` throws to fail fast.

## Debugging Tips
- Set `LOG_LEVEL=debug` to see control‑flow, tool loop, and invariant logs.
- Set `DEBUG_LLM=1` to log redacted HTTP payloads from the OpenAI adapter when a call fails (status + body snippet).
- The trace viewer writes `run.json` and `run.html` for quick scanning of messages and events.

## Control‑Flow Combinators
- `@sisu/mw-control-flow`: `sequence`, `branch`, `switchCase`, `loopWhile/loopUntil`, `parallel`, `graph`

## Design Notes
- Core stays small and stable; everything else is opt‑in middleware.
- Protocol correctness is enforced by the tool‑calling loop and `@sisu/mw-invariants`.
- The logging stack supports levels, redaction, and tracing without external services.
## Adapter — Ollama (local)
- Works with a local Ollama server (default `http://localhost:11434`).
- No tools/function calling (capabilities.functionCall=false) — use for plain chat or custom pipelines.
- Usage:
  ```ts
  import { ollamaAdapter } from '@sisu/adapter-ollama';
  const model = ollamaAdapter({ model: 'llama3.1' });
  // then set ctx.model = model in your app
  ```
