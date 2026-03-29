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
- `API_KEY`
- `BASE_URL`
- `MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
