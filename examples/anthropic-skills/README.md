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
- Loads skills from `.sisu/skills`
- Uses `@sisu-ai/skill-code-review` and `@sisu-ai/skill-debug`
- Generates HTML trace files (`trace-*.html`)
