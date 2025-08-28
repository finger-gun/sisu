```
      _           
  ___(_)___ _   _ 
 / __| / __| | | |
 \__ \ \__ \ |_| |
 |___/_|___/\__,_|         
```
> Grit-powered agents. Quiet, determined, and relentlessly useful.

[![npm](https://img.shields.io/npm/v/@finger-gun/sisu.svg)](https://www.npmjs.com/package/@finger-gun/sisu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Sisu is a lightweight TypeScript framework for turning **intent into action**. Inspired by the Finnish idea of *sisu*—calm resolve under pressure—Sisu favors **explicit tools**, **predictable plans**, and **built-in guardrails**. No ceremony, no mystery: compose, decide, do.

---

## Features

* **Minimal core, maximal clarity** — small surface, strong primitives
* **Typed tools** — explicit contracts for inputs/outputs (safe by default)
* **Planner-agnostic** — swap ReAct, tree/graph search, rules, or your own
* **Deterministic modes** — reproducible runs (timeouts, retries, budgets)
* **Observability** — structured traces you can stream to your stack


---

## For the Public — Install & Get Started

### Install (Node 18+)

```bash
npm i @finger-gun/sisu
# or: pnpm add @finger-gun/sisu
# or: yarn add @finger-gun/sisu
```

### Quick Start

```ts
import { sisu } from '@finger-gun/sisu';

const client = sisu({ model: 'openai/gpt-4o-mini', system: 'You are concise.' });
const res = await client.request('Say hi');
// res is the provider JSON by default; extract text as needed.
```

### Optional CLI

CLI:

```bash
npx @finger-gun/sisu --chat="What is sisu?"

# read prompt from stdin
echo "Explain sisu in one line" | npx @finger-gun/sisu --stdin

# print raw JSON response
npx @finger-gun/sisu --chat="Hi" --json

# pass a system prompt and disable auto-injection
npx @finger-gun/sisu --chat="Hi" --system="Be terse" --no-inject-system
```

> Need help? Open a GitHub Discussion or Issue with your scenario.

---

## For Developers — Contribute & Join

We’re building Sisu in the open. If “calm, typed, predictable agent runtime” resonates, come help.

### Quick Dev Setup

```bash
# 1) Fork + clone
# 2) Install deps
npm ci
# 3) Run checks
npm run lint && npm test
# 4) Build
npm run build
# 5) Create a changeset for versioning
npm run changeset
```

### Environment

Provider-agnostic env vars (with sensible defaults):

```bash
# API key for your selected provider/gateway
echo "AI_API_KEY=..." >> .env

# Optional: override base URL (defaults to an OpenAI-compatible gateway)
# echo "AI_BASE_URL=https://api.openai.com/v1" >> .env

# Optional: request timeout in ms (default 30000)
# echo "AI_TIMEOUT_MS=30000" >> .env

# Optional: chat endpoint path (default '/chat/completions')
# echo "AI_CHAT_PATH=/chat/completions" >> .env
```


### How to Join the Project

* **Say hi:** open an issue titled `Join: <your-name>` with what you want to work on
* **Org access:** request membership in the **finger-gun** org (we’ll invite if there’s a fit)

---

## License

[MIT](LICENSE)

---

### A note on the name

*Sisu* is about quiet resolve: start, persist, finish. The framework follows suit—small, sturdy pieces that do what they say on the tin.
