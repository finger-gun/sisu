# Anthropic Weather Example

Shows tools and control flow by fetching weather and summarizing with Anthropic.

Usage
- Quick start: `npm run ex:anthropic:weather`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/anthropic-weather -- --trace --trace-style=dark -- "Weather in Malmö and plan a fika."`

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
