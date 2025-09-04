# OpenAI Control Flow Example

Demonstrates routing and iteration with `@sisu-ai/mw-control-flow`.

Concepts
- `sequence`: group small steps into a named phase.
- `switchCase`: route by intent (e.g., 'tooling' vs 'chat').
- `loopUntil`: repeat a tool-calling phase while the last message was a tool result (with a safety max).

Usage
- Quick start: `npm run ex:openai:control`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-control-flow -- --trace --trace-style=light -- "Weather in Malmö and suggest a fika plan."`

Config Flags (CLI overrides env)
- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model`
- Tracing: `--trace` and `--trace-style=light|dark|modern`

Env Vars (alternatives)
- `OPENAI_API_KEY` or `API_KEY`
- `OPENAI_BASE_URL` or `BASE_URL`
- `OPENAI_MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`

Related middleware
- `@sisu-ai/mw-control-flow`: `sequence`, `switchCase`, `loopUntil`, and more
- `@sisu-ai/mw-tool-calling`: handles native function-tool calls from the model
