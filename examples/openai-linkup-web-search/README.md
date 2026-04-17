# OpenAI + LinkUp Web Search Example

Runs an agent with the OpenAI adapter and the LinkUp-backed `webSearch` tool.

Usage
- Quick start: `npm run ex:openai:linkup-web-search`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-linkup-web-search -- --trace --trace-style=dark -- "Latest updates about NASA Artemis missions?"`

Config Flags (CLI overrides env)
- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model`
- `--linkup-api-key`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `API_KEY`
- `BASE_URL`
- `MODEL`
- `OPENAI_MODEL`
- `LINKUP_API_KEY`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
