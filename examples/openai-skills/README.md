# OpenAI Skills Example

Demonstrates skills middleware with OpenAI models and ecosystem tool aliases.

## Prerequisites

- Node.js >= 18.17
- pnpm
- `OPENAI_API_KEY` in your environment

## Setup

```bash
pnpm install
pnpm --filter openai-skills dev
```

## What this does

- Registers terminal tools with ecosystem aliases (`bash`, `read_file`, `cd`)
- Loads skills directly from installed packages in `node_modules`
- Uses `@sisu-ai/skill-repo-search` and `@sisu-ai/skill-code-review`
- Example prompts avoid reading secrets (avoid placing sensitive data in `.env`)
- Generates HTML trace files (`trace-*.html`)
