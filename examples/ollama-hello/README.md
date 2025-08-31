# Ollama Hello Example

Minimal Ollama adapter example that prints a short assistant reply.

Usage
- Quick start: `npm run ex:ollama:hello`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/ollama-hello -- --trace --trace-style=modern -- "Say hello in one sentence."`

Config Flags (CLI overrides env)
- `--ollama-base-url`, `--base-url`
- Tracing: `--trace` and `--trace-style=light|dark|modern`

Env Vars (alternatives)
- `OLLAMA_BASE_URL` or `BASE_URL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
