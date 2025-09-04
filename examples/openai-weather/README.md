# OpenAI Weather Example

Shows tools and control flow by fetching weather and summarizing.

Usage
- Quick start: `npm run ex:openai:weather`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-weather -- --trace --trace-style=dark -- "Weather in Malmö and plan a fika."`

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
