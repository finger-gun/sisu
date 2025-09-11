# @sisu-ai/mw-error-boundary

Catch exceptions from downstream middleware and respond gracefully.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-error-boundary)](https://www.npmjs.com/package/@sisu-ai/mw-error-boundary)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

## Setup
```bash
npm i @sisu-ai/mw-error-boundary
```

## Exports
- `errorBoundary(onError: (err, ctx, next) => Promise<void>)`
  - Call early in your stack to ensure all downstream errors are caught.
  - Inside `onError`, you typically:
    - log the error (`ctx.log.error(err)`),
    - push a friendly assistant message to `ctx.messages`,
    - optionally write to `ctx.stream` if you’re mid‑stream.

## What It Does
- Wraps the rest of your pipeline in a `try/catch`.
- Invokes your handler with the error and context, so you can log and produce a user‑friendly fallback.
- Prevents crashes from bubbling to the caller while keeping control in your app.

## How It Works
`errorBoundary(onError)` returns middleware that does:

```ts
try {
  await next();
} catch (err) {
  await onError(err, ctx, async () => {}); // next is a no-op in error state
}
```

Your `onError` receives `(err, ctx, next)` where `next` is a no‑op to signal the boundary is terminal for that request.

## Usage
```ts
import { Agent } from '@sisu-ai/core';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => {
    ctx.log.error(err);
    // If streaming UI, consider writing to the stream instead/as well.
    ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' });
  }))
  // ... other middleware
```

### Placement & Ordering
- Put `errorBoundary` at or near the top to catch as much as possible.
- Combine with tracing/usage middleware as needed; if placed before them, those middlewares may not observe the error.
- If you use a server adapter, ensure it wraps request handling so per‑request errors are isolated.

## When To Use
- Any production app to avoid unhandled rejections crashing the process.
- CLIs and demos where you want graceful failure and a helpful message.
- Around tool‑calling loops where third‑party tools may throw.

## When Not To Use
- If you want errors to propagate to an outer boundary (e.g., framework handler) and be handled there.
- Highly controlled test scenarios where you prefer tests to fail fast instead of being swallowed.

## Notes & Gotchas
- The boundary swallows the error after `onError` runs; rethrow inside `onError` if you want upstream handling.
- Be careful not to leak secrets when logging errors — consider the redacting logger `createRedactingLogger` from `@sisu-ai/core`.
- If you are streaming tokens, write an error notice to `ctx.stream` and call `ctx.stream.end()` to close the client stream cleanly.
- Keep `onError` fast and robust; avoid throwing inside it.


# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.

- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
