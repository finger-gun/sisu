# @sisu-ai/mw-error-boundary
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-error-boundary)](https://www.npmjs.com/package/@sisu-ai/mw-error-boundary)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Catch exceptions and render a fallback.

## Setup
```bash
npm i @sisu-ai/mw-error-boundary
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `errorBoundary(onError)` — wraps the downstream pipeline in a try/catch and calls your `onError(err, ctx, next)`.

## Usage
```ts
import { errorBoundary } from '@sisu-ai/mw-error-boundary';

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => {
    ctx.log.error(err);
    ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' });
  }))
  // ...rest

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
```
