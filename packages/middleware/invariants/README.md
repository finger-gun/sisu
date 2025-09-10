# @sisu-ai/mw-invariants

Safety checks for common protocol invariants.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-invariants)](https://www.npmjs.com/package/@sisu-ai/mw-invariants)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-invariants
```

## Exports
- `toolCallInvariant({ strict?: boolean })`
  - `strict: false` (default) logs a warning and continues.
  - `strict: true` throws an error to fail fast.


## What It Does
- Validates the tool-calling protocol in your transcript after a step completes.
- Specifically: for each assistant message that includes `tool_calls`, ensures a matching `tool` message exists later for every call.
- Reports violations via warning logs or by throwing (strict mode).

## How It Works
`toolCallInvariant({ strict })` runs after `await next()` and inspects `ctx.messages`:
- Scans assistant messages with `tool_calls`.
- For each call, looks forward for a `tool` message that matches by `tool_call_id` (preferred) or `name` (fallback for providers without IDs).
- If any are missing, either logs a warning with details or throws when `strict: true`.

This is a development-time safety net to catch mis-ordered or missing tool replies in your loop.

## Example
```ts
import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { toolCallInvariant } from '@sisu-ai/mw-invariants';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

// Example tool
const echo = {
  name: 'echo',
  description: 'Echo back a message',
  schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  handler: async ({ text }: { text: string }) => ({ text })
};

const ctx: Ctx = {
  input: 'Call the echo tool with text "hello" then answer briefly.',
  messages: [{ role: 'system', content: 'Be concise.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: 'info' })
};

const app = new Agent()
  .use(inputToMessage)
  .use(registerTools([echo as any]))
  .use(toolCalling) // or iterativeToolCalling
  // After tool loop completes, assert that every tool_call got a tool reply
  .use(toolCallInvariant({ strict: true }));

await app.handler()(ctx);
```

## Placement & Ordering
- Place after your tool-calling middleware so it can verify the result of a turn.
- Use `strict: true` in development and CI to catch regressions early; relax to warnings in production if you prefer resilience over hard failures.

## When To Use
- During development/CI to ensure your tool loop respects the provider protocol.
- In staging/production as a warning-only monitor to surface unexpected provider behavior.

## When Not To Use
- If your app never uses tools.
- If you handle protocol validation elsewhere (e.g., custom loop with its own assertions).

## Notes & Gotchas
- Matching strategy: prefers `tool_call_id`. Falls back to `name` when the provider omits ids.
- Parallel calls: works with multiple tool calls; each must have a corresponding `tool` message.
- Cross-turn behavior: invariant checks within a single turn. If you intentionally defer tool responses to a later request, adjust placement or disable strict mode.
- Streaming: this runs post-`next()`. For streaming loops that push an `assistant_message` event, ensure that the final message is added to `ctx.messages` before this check or defer the check to the end of the run.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
