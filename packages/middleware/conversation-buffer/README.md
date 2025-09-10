# @sisu-ai/mw-conversation-buffer

Helpers for shaping basic conversation state. Keep recent messages small and relevant without implementing your own trimming logic.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-conversation-buffer)](https://www.npmjs.com/package/@sisu-ai/mw-conversation-buffer)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-conversation-buffer
```

## Exports
- `inputToMessage` — appends `{ role:'user', content: ctx.input }` when present.
- `conversationBuffer({ window=12 })` — keeps the first message and the last `window` messages.


## What It Does
- Converts `ctx.input` into a user chat message.
- Prunes older messages with a simple, fast sliding window.

This pair is intentionally tiny and deterministic. It never summarizes or alters message contents — it only appends and trims.

## How It Works
- `inputToMessage`: If `ctx.input` is set, appends `{ role: 'user', content: ctx.input }` to `ctx.messages`, then calls `next()`.
- `conversationBuffer({ window = 12 })`: If `ctx.messages.length > window`, it keeps the first message (commonly a system prompt) plus the last `window` messages, mutating `ctx.messages` in place.

Why keep “first + last N”? The first message is usually your system instruction; the tail is the most recent conversational state. This rule is robust for many apps.

## Usage
```ts
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';

const app = new Agent()
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }));
```

Recommended ordering:
- Place `inputToMessage` early so downstream middleware sees a full message list.
- Apply `conversationBuffer` after appending new messages (user/tool) and before generation to cap context size.

## When To Use
- Chat apps/CLIs where conversation grows and you need bounded context.
- Prototypes and demos that benefit from predictable behavior.
- As a guardrail before providers with strict token limits.

## When Not To Use
- Single‑turn flows that don’t keep history.
- Workflows that manage context elsewhere (RAG pipelines or custom budgeting).
- Cases requiring semantic compression/summarization (use a compressor middleware instead).

## Notes & Gotchas
- Role‑agnostic trim: trimming is positional, not role‑aware. If you must always keep specific roles/messages, compose your own policy.
- System prompt stability: the first message is preserved; ensure it’s the one you want to keep.
- Message vs token: `window` is in messages, not tokens. For strict token budgets, pair with usage tracking or a tokenizer‑aware compressor.
- In‑place mutation: `conversationBuffer` mutates `ctx.messages`. Create references after trimming if you pass them elsewhere.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
