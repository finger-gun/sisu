# Ollama Web Search Example

Runs an agent with the Ollama adapter and a web search tool (DuckDuckGo) for retrieval.

Usage
- Quick start: `npm run ex:ollama:web-search`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/ollama-web-search -- --trace --trace-style=modern -- "Tallest mountain in Europe?"`

Config Flags (CLI overrides env)
- `--ollama-base-url`, `--base-url`
- Tracing: `--trace` and `--trace-style=light|dark|modern`

Env Vars (alternatives)
- `OLLAMA_BASE_URL` or `BASE_URL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
