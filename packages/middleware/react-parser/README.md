# @sisu-ai/mw-react-parser

Lightweight ReAct-style tool loop. The model proposes an action in plain text, you parse it, execute a tool, then the model reflects and answers.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-react-parser)](https://www.npmjs.com/package/@sisu-ai/mw-react-parser)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-react-parser
```

## Exports
- `reactToolLoop()` — returns middleware that performs one ReAct cycle as described.

## What It Does
- Think → Act → Observe → Reflect loop without provider‑specific function calling.
- Parses `Action: <tool>` and `Action Input: <json or text>` from the assistant’s message.
- Invokes a registered tool, feeds the observation back, and asks the model for a final answer.

## How It Works
- Calls `model.generate(..., { toolChoice: 'none' })` to get an initial assistant message.
- Extracts `tool` and `args` via regex; attempts `JSON.parse` on the input, falls back to raw text.
- Executes the tool and appends a user message like `Observation (tool): <result>`.
- Calls `model.generate` again (tools still disabled) and pushes the final assistant message.

This keeps the loop adapter‑agnostic and easy to reason about at the cost of relying on formatting.

## Usage
```ts
import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { reactToolLoop } from '@sisu-ai/mw-react-parser';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

// Example tool
const webSearch = {
  name: 'webSearch',
  description: 'Search the web for a query',
  schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  handler: async ({ q }: { q: string }) => ({ top: [`Result for ${q}`] })
};

const ctx: Ctx = {
  input: 'Find the npm page for @sisu-ai/core then summarize.',
  messages: [{ role: 'system', content: 'When helpful, decide an action using:\nAction: <tool>\nAction Input: <JSON>. Then reflect with the observation.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' })
};

const app = new Agent()
  .use(registerTools([webSearch as any]))
  .use(inputToMessage)
  .use(reactToolLoop());
```

### Prompting Tips
- Seed the system prompt with the required format, e.g.:
  - `Use tools when helpful. Reply with:\nAction: <tool>\nAction Input: <JSON>`
- Keep tool schemas strict and arguments small to make parsing robust.

## When To Use
- You want a provider‑agnostic tool loop that works with any chat model.
- You need a simple ReAct cycle without native function calling.

## When Not To Use
- You rely on provider‑native tools/function‑calling — prefer `@sisu-ai/mw-tool-calling` instead.
- You need multi‑step or iterative planning — use `iterativeToolCalling` or a planner middleware.

## Notes & Gotchas
- Formatting sensitivity: parsing uses regex; poor formatting may fail to extract the action.
- Security: validate tool inputs (zod) and guard tools with allow‑lists/capabilities.
- Streaming: this middleware uses non‑streaming `generate` calls; pair with a streaming middleware if you need live tokens.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
