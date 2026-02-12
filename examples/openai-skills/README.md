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
- Loads skills from `.sisu/skills`
- Uses `@sisu-ai/skill-deploy` and `@sisu-ai/skill-code-review`
- Generates HTML trace files (`trace-*.html`)
