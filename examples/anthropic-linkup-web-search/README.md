# Anthropic + LinkUp Web Search Example

Runs an agent with the Anthropic adapter and the LinkUp-backed `webSearch` tool.

Usage
- Quick start: `npm run ex:anthropic:linkup-web-search`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/anthropic-linkup-web-search -- --trace --trace-style=dark -- "Latest major AI regulation updates"`

Config Flags (CLI overrides env)
- `--anthropic-api-key`, `--api-key`
- `--model`
- `--linkup-api-key`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `ANTHROPIC_API_KEY` (or `API_KEY`)
- `MODEL`
- `LINKUP_API_KEY`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
