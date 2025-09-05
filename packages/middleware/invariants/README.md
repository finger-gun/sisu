# @sisu-ai/mw-invariants
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-invariants)](https://www.npmjs.com/package/@sisu-ai/mw-invariants)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Safety checks for common protocol invariants.

## Setup
```bash
npm i @sisu-ai/mw-invariants
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## toolCallInvariant
```ts
import { toolCallInvariant } from '@sisu-ai/mw-invariants';

const app = new Agent()
  .use(toolCallInvariant({ strict: false }))
```

Ensures that for every assistant message with `tool_calls`, there is a subsequent `tool` message responding to each `tool_call_id` (or by `name` fallback if no id was provided).

- Logs a warning listing missing `tool_call_id`s and message indexes.
- With `{ strict: true }`, throws an Error to fail fast.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
