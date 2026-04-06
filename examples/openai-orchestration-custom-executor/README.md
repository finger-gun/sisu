# OpenAI Orchestration (Custom ChildExecutor)

Demonstrates `@sisu-ai/mw-orchestration` with an explicit custom `childExecutor` while using core execution middleware (`.use(execute)`).

## What this example shows

- Passing `childExecutor` to `orchestration(...)` as the extension seam
- Delegation scoping (tool allow-list + model policy) still enforced by orchestration
- Final output read via `getExecutionResult(ctx)`

## Run

- Quick start: `pnpm ex:openai:orchestration-custom`
- Alternate:
  - `TRACE_HTML=1 pnpm --filter=openai-orchestration-custom-executor dev -- --trace -- "Plan a Malmö day with fallback"`

## Environment

- `API_KEY` (required)
- `MODEL` (optional, default `gpt-5.4`)
- `BASE_URL` (optional, for OpenAI-compatible endpoints)
- `TRACE_HTML=1` and/or `TRACE_JSON=1` for trace output
