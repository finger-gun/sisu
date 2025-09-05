# OpenAI ReAct Example

Demonstrates the ReAct pattern using `@sisu-ai/mw-react-parser`.

Concept
- Think → Act → Observe → Reflect.
- The model first proposes an action in text, we parse it, run the tool, then ask the model to produce the final answer.
- Expected format from the assistant:
  - `Action: <tool>`
  - `Action Input: <JSON or text>`

Usage
- Quick start: `npm run ex:openai:react`
- Alternate (full command): `TRACE_HTML=1 npm run dev -w examples/openai-react -- --trace --trace-style=dark -- "Use Action: echo with Action Input: {\"text\":\"hello from ReAct\"}"`

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
- `@sisu-ai/mw-react-parser`: parses the `Action:` and `Action Input:` lines and executes the named tool.
