# Ollama + LinkUp Web Search Example

Runs an agent with the Ollama adapter and the LinkUp-backed `webSearch` tool.

Usage
- Quick start: `npm run ex:ollama:linkup-web-search`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/ollama-linkup-web-search -- --trace --trace-style=dark -- "Latest AI policy news in Europe?"`

Config Flags (CLI overrides env)
- `--ollama-base-url`, `--base-url`
- `--linkup-api-key`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `BASE_URL`
- `MODEL`
- `LINKUP_API_KEY`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
