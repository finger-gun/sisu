# OpenAI Parallel Example

Demonstrates parallel actions with OpenAI.

Usage
- Quick start: `npm run ex:openai:parallel`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-parallel -- --trace --trace-style=dark -- "Explain sisu in two sentences and provide 5 concise hashtags."`

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
