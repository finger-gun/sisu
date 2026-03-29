# Anthropic Vision Example

Demonstrates image inputs using Anthropic multi-part content (text + image_url). The adapter accepts image URLs, data URLs, and base64 image input.

Usage
- Quick start: `npm run ex:anthropic:vision`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/anthropic-vision -- --trace --trace-style=dark`

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
