# OpenAI Web Fetch Example

Fetches a web page via the `webFetch` tool, then asks OpenAI to summarize it.

Usage
- Quick start: `npm run ex:openai:web-fetch`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-web-fetch -- --trace --trace-style=dark -- "https://en.wikipedia.org/wiki/Hubble_Space_Telescope"`

Config Flags (CLI overrides env)
- OpenAI: `--openai-api-key`, `--api-key`, `--openai-base-url`, `--base-url`, `--openai-model`
- Web fetch: `--web-fetch-user-agent`, `--web-fetch-max-bytes`
- Tracing: `--trace` and `--trace-style=light|dark`

Env Vars (alternatives)
- `OPENAI_API_KEY` or `API_KEY`
- `OPENAI_BASE_URL` or `BASE_URL`
- `OPENAI_MODEL`
- `WEB_FETCH_USER_AGENT`, `WEB_FETCH_MAX_BYTES`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`

Notes
- The prompt instructs the model to call `webFetch` with `format: "text"` for a sensible summary input.
