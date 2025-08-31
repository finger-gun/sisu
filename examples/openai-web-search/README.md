# OpenAI Web Search Example

Runs an agent with the OpenAI adapter and a web search tool using OpenAI's Responses API.

Usage
- Quick start: `npm run ex:openai:web-search`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-web-search -- --trace --trace-style=modern -- "Latest news about NASA missions?"`

Config Flags (CLI overrides env)
- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model`
- Responses tool: `--openai-responses-base-url`, `--openai-responses-model`
- Tracing: `--trace` and `--trace-style=light|dark|modern`

Env Vars (alternatives)
- `OPENAI_API_KEY` or `API_KEY`
- `OPENAI_BASE_URL` or `BASE_URL`
- `OPENAI_MODEL`
- Responses tool: `OPENAI_RESPONSES_BASE_URL`, `OPENAI_RESPONSES_MODEL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`
