# OpenAI Hello Example

Minimal OpenAI adapter example that prints a short assistant reply.

Usage
- Quick start: `npm run ex:openai:hello`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-hello -- --trace --trace-style=dark -- "Say hello in one short sentence."`

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
