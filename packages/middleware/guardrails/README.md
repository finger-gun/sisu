# @sisu-ai/mw-guardrails

Policy guardrails to short-circuit unsafe input.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-guardrails)](https://www.npmjs.com/package/@sisu-ai/mw-guardrails)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-guardrails
```

## Exports
- `withGuardrails(policy: (text: string) => Promise<string | null>)`
  - Called early in your stack; reads `ctx.input` only.
  - If violation: pushes `{ role: 'assistant', content: <string> }` and short-circuits.

## What It Does
- Runs a fast, user-defined policy over `ctx.input` before calling the model.
- If the policy flags a violation, it pushes a friendly assistant message and stops the pipeline.
- Keeps your app responsive and predictable without depending on provider moderation.

## How It Works
`withGuardrails(policy)` returns middleware that evaluates your policy.

The `policy` function should return:
- `null` when the input is allowed,
- a string with the assistant message to send when blocked (e.g., guidance or a refusal).

## Usage
```ts
import { withGuardrails } from '@sisu-ai/mw-guardrails';

const policy = async (text: string) =>
  /password|apikey|access\s*token/i.test(text)
    ? "I can’t help with that. Please remove secrets from your request."
    : null;

const app = new Agent()
  .use(withGuardrails(policy)) // place before inputToMessage
  // .use(inputToMessage)
  // ... other middleware
```

### Placement & Ordering
- Put guardrails before `inputToMessage` (or any message-appenders) so it evaluates the raw `ctx.input`.
- Combine with an error boundary for robustness; guardrails are for policy, not exception handling.

## When To Use
- You want deterministic, low-latency checks on user input (e.g., secrets, PII, profanity, prompt injection keywords).
- You need policy to run regardless of provider capabilities or outages.

## When Not To Use
- You must scan the entire `ctx.messages` history (this middleware only reads `ctx.input`).
- You need semantic classification or nuanced moderation — use a model-backed moderation step or a specialized middleware.
- Inputs are non-text (images/files) — you’ll need a different policy mechanism.

## Notes & Gotchas
- Internationalization: simple regex checks may miss non-English variants; consider locale-aware policies if needed.
- Empty input: `ctx.input ?? ''` is passed; decide whether empty input should be allowed or rejected in your policy.
- Streaming: this middleware does not stream; if it blocks, it sets a final assistant message immediately.
- Logging: Be careful not to log sensitive content; consider `createRedactingLogger` from `@sisu-ai/core`.

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
