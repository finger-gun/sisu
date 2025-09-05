# Anthropic Hello Example

Minimal Anthropic adapter example that prints a short assistant reply.

Usage
- Quick start: `npm run ex:anthropic:hello`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/anthropic-hello -- --trace --trace-style=dark -- "Say hello in one short sentence."`

Config Flags (CLI overrides env)
- `--anthropic-api-key`, `--api-key`
- `--anthropic-base-url`, `--base-url`
- `--anthropic-model`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `ANTHROPIC_API_KEY` or `API_KEY`
- `ANTHROPIC_BASE_URL` or `BASE_URL`
- `ANTHROPIC_MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
