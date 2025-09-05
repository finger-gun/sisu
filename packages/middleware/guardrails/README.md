# @sisu-ai/mw-guardrails
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-guardrails)](https://www.npmjs.com/package/@sisu-ai/mw-guardrails)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Policy guardrails to short-circuit unsafe input.

## Setup
```bash
npm i @sisu-ai/mw-guardrails
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `withGuardrails(policy)` — calls `await policy(ctx.input)`; if it returns a string, responds with that assistant message and stops.

## Usage
```ts
import { withGuardrails } from '@sisu-ai/mw-guardrails';

const policy = async (text: string) => text.match(/password|apikey/i) ? 'I can\'t help with that.' : null;

const app = new Agent()
  .use(withGuardrails(policy))
  // ...rest
```

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
