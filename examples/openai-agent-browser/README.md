# OpenAI Agent Browser Skill Example

Demonstrates using the agent-browser skill from the skills.sh ecosystem with SISU.

## Prerequisites

- Node.js >= 18.17
- pnpm
- `OPENAI_API_KEY` in your environment
- agent-browser CLI installed

## Install agent-browser

```bash
npm install -g agent-browser
agent-browser install
```

## Add the agent-browser skill

```bash
npx skills add https://github.com/vercel-labs/agent-browser --skill agent-browser
```

This creates `.agents/skills/agent-browser/SKILL.md` in the repo root by default.
If your installer targets a different directory, update `skillDirs` in `src/index.ts`.

## Run the example

```bash
pnpm install
pnpm --filter openai-agent-browser dev
```

## What this does

- Registers terminal tools with ecosystem aliases (`bash`, `read_file`, `cd`).
- Loads the agent-browser skill from `.claude/skills`.
- Uses `agent-browser` via the terminal tool to open a page and capture a screenshot.
- Generates HTML trace files (`trace-*.html`).

## Notes

- If you installed skills to a different directory, update `skillDirs` in `src/index.ts`.
- The agent-browser CLI supports `--json` output for structured results.
