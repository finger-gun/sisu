# OpenAI Wikipedia Example

Runs an agent with the OpenAI adapter and a Wikipedia lookup tool using the REST API.

Usage
- Quick start: `npm run ex:openai:wikipedia`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-wikipedia -- --trace --trace-style=modern -- "Tell me about the Hubble Space Telescope using Wikipedia."`

Config Flags (CLI overrides env)
- OpenAI: `--openai-api-key`, `--api-key`, `--openai-base-url`, `--base-url`, `--openai-model`
- Wikipedia: `--wikipedia-lang`, `--wiki-lang`, `--wikipedia-base-url`, `--wiki-base-url`
- Tracing: `--trace` and `--trace-style=light|dark|modern`

Env Vars (alternatives)
- `OPENAI_API_KEY` or `API_KEY`
- `OPENAI_BASE_URL` or `BASE_URL`
- `OPENAI_MODEL`
- `WIKIPEDIA_LANG` or `WIKI_LANG`
- `WIKIPEDIA_BASE_URL` or `WIKI_BASE_URL`
- Tracing: `TRACE_JSON=1`, `TRACE_HTML=1`, `TRACE_STYLE=...`

Notes
- The tool supports `format: 'summary'|'html'|'related'`. The example prompt guides the model to use `related` when needed, then fetch a `summary`.
