# OpenAI Branch Example

Shows if/else routing with `@sisu-ai/mw-control-flow`.

Concept
- `branch(predicate, onTrue, onFalse)`: if input matches a pattern, run one pipeline; otherwise, run another.
- This example picks a witty vs pragmatic system prompt based on the user's input.

Usage
- Quick start: `npm run ex:openai:branch`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-branch -- --trace --trace-style=light -- "Tell me a joke about cats."`

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

Related middleware
- `@sisu-ai/mw-control-flow`: `branch`, `sequence`
