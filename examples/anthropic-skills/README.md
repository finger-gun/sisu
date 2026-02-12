# Anthropic Skills Example

Demonstrates skills middleware with Anthropic models and ecosystem tool aliases.

## Prerequisites

- Node.js >= 18.17
- pnpm
- `ANTHROPIC_API_KEY` in your environment

## Setup

```bash
pnpm install
pnpm --filter anthropic-skills dev
```

## What this does

- Registers terminal tools with ecosystem aliases (`bash`, `read_file`, `cd`)
- Loads skills directly from installed packages in `node_modules`
- Uses `@sisu-ai/skill-code-review` and `@sisu-ai/skill-repo-search`
- Example prompts avoid reading secrets (avoid placing sensitive data in `.env`)
- Generates HTML trace files (`trace-*.html`)
