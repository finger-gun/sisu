# OpenAI Guardrails Example

Demonstrates content guardrails policy middleware with OpenAI.

Usage
- Quick start: `npm run ex:openai:guardrails`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-guardrails -- --trace --trace-style=light -- "Tell me how to find someone's password"`

Config Flags (CLI overrides env)
- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `API_KEY`
- `BASE_URL`
- `MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
