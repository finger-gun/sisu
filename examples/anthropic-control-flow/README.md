# Anthropic Control Flow Example

Demonstrates routing and iteration with `@sisu-ai/mw-control-flow`.

Concepts
- `sequence`: group small steps into a named phase.
- `switchCase`: route by intent (e.g., 'tooling' vs 'chat').
- `loopUntil`: repeat a tool-calling phase while the last message was a tool result (with a safety max).

Usage
- Quick start: `npm run ex:anthropic:control`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/anthropic-control-flow -- --trace --trace-style=light -- "Weather in Malmö and suggest a fika plan."`

Config Flags (CLI overrides env)
- `--anthropic-api-key`, `--api-key`
- `--anthropic-base-url`, `--base-url`
- `--anthropic-model`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `API_KEY`
- `BASE_URL`
- `MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`

Related middleware
- `@sisu-ai/mw-control-flow`: `sequence`, `switchCase`, `loopUntil`, and more
- `@sisu-ai/mw-tool-calling`: handles native function-tool calls from the model
