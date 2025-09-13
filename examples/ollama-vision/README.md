# Ollama Vision Example

Demonstrates image inputs using Ollama multi-part content (text + image_url). The adapter fetches http(s) image URLs and inlines them as base64 automatically under the hood.

Usage
- Quick start: `npm run ex:ollama:vision`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/ollama-vision -- --trace --trace-style=dark`

Notes
- Requires a vision-capable Ollama model (e.g. `llava:latest` or a Qwen VL model). Make sure it’s pulled locally: `ollama pull llava:latest`.
- You can pass your own image URL as the first CLI arg. The adapter will download it and inline as base64 automatically.

Config Flags (CLI overrides env)
- `--ollama-base-url`, `--base-url`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `OLLAMA_BASE_URL` or `BASE_URL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
