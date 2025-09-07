# OpenAI Graph Example

Shows DAG-style control flow with `@sisu-ai/mw-control-flow`.

Concept
- `graph(nodes, edges, start)`: define nodes with `id` and `run(ctx, next)`, plus conditional edges to traverse.
- Great for multi-phase flows (classify → handle → polish) that rejoin before the final output.

Usage
- Quick start: `npm run ex:openai:graph`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-graph -- --trace --trace-style=light -- "Give me a short travel tip for Helsinki."`

Config Flags (CLI overrides env)
- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `OPENAI_API_KEY` or `API_KEY`
- `OPENAI_BASE_URL` or `BASE_URL`
- `OPENAI_MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`

Related middleware
- `@sisu-ai/mw-control-flow`: `graph`
