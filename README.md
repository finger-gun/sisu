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
- [packages/core](packages/core/README.md) — minimal contracts (`Ctx`, `Middleware`, `compose`, `Agent`, tools, memory, stream, logger)
- [packages/adapters/openai](packages/adapters/openai/README.md) — OpenAI‑compatible Chat adapter (tools support, DEBUG_LLM)
- [packages/adapters/ollama](packages/adapters/ollama/README.md) — Ollama (local/offline) Chat adapter
- packages/middleware/* — optional middlewares:
  - [@sisu/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md) — input→message + windowed truncation
  - [@sisu/mw-control-flow](packages/middleware/control-flow/README.md) — `sequence`, `branch`, `switchCase`, `loopWhile/loopUntil`, `parallel`, `graph`
  - [@sisu/mw-error-boundary](packages/middleware/error-boundary/README.md) — try/catch with fallback
  - [@sisu/mw-react-parser](packages/middleware/react-parser/README.md) — ReAct fallback loop
  - [@sisu/mw-register-tools](packages/middleware/register-tools/README.md) — bulk tool registration
  - [@sisu/mw-tool-calling](packages/middleware/tool-calling/README.md) — tools API loop with id‑anchored replies
  - [@sisu/mw-usage-tracker](packages/middleware/usage-tracker/README.md) — token usage + cost estimation
  - [@sisu/mw-trace-viewer](packages/middleware/trace-viewer/README.md) — JSON + HTML trace export (themes, templating)
  - [@sisu/mw-invariants](packages/middleware/invariants/README.md) — protocol checks (tool_calls ↔ tool replies)
  - [@sisu/mw-guardrails](packages/middleware/guardrails/README.md) — policy guard
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
-## Adapter — Ollama (local)
- Works with a local Ollama server (default `http://localhost:11434`).
- Native tools support — pass `GenerateOptions.tools` via the tool-calling middleware.
- Usage:
  ```ts
  import { ollamaAdapter } from '@sisu/adapter-ollama';
  const model = ollamaAdapter({ model: 'llama3.1' });
  // then set ctx.model = model in your app
  ```
