# Ollama Weather Example

Shows tools and control flow by fetching weather and summarizing with Ollama.

Usage
- Quick start: `npm run ex:ollama:weather`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/ollama-weather -- --trace --trace-style=dark -- "Weather in Malmö and plan a fika."`

Config Flags (CLI overrides env)
- `--ollama-base-url`, `--base-url`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `BASE_URL`
- `MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
