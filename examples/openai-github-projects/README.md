# OpenAI + GitHub Projects Example

Demonstrates using Sisu with the OpenAI adapter and the GitHub Projects tools to list issues, show details, list columns, and optionally move an issue to a target column.

## Setup

1. Copy `.env.example` to `.env` and fill:
   - `OPENAI_API_KEY`
   - `GITHUB_PROJECT_ID`
   - `GITHUB_ACCESS_TOKEN`
   - Optional: `GITHUB_GRAPHQL_URL` or `GITHUB_ENTERPRISE_HOSTNAME`

2. Run the example:

```bash
npm run dev -w examples/openai-github-projects -- -- "List issues and move the first to In Progress."
```

The example registers tools from `@sisu-ai/tool-github-projects` and uses the iterative tool-calling middleware (`@sisu-ai/mw-tool-calling`) so the model can call tools multiple times in a row if needed.
