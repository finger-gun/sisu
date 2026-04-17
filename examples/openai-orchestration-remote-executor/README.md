# OpenAI Orchestration (Remote-style ChildExecutor)

Demonstrates a remote-style `ChildExecutor` boundary for `@sisu-ai/mw-orchestration`, while still using core execution middleware (`.use(execute)`).

## What this example shows

- `childExecutor` shaped like a transport boundary (serialize request, hand off, execute, return result)
- How to keep orchestration policy/scoping in one place while execution can move to a worker/service
- Final output read through `getExecutionResult(ctx)`

## Notes

- This example simulates transport with a mock delay and request serialization.
- It is intended as a blueprint for queue/HTTP-backed child execution.

## Run

- Quick start: `pnpm ex:openai:orchestration-remote`
- Alternate:
  - `TRACE_HTML=1 pnpm --filter=openai-orchestration-remote-executor dev -- --trace -- "Plan Malmö afternoon with fallback"`

## Environment

- `API_KEY` (required)
- `MODEL` (optional, default `gpt-5.4`)
- `BASE_URL` (optional, for OpenAI-compatible endpoints)
- `TRACE_HTML=1` and/or `TRACE_JSON=1` for trace output
