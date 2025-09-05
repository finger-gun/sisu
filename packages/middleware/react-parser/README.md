# @sisu-ai/mw-react-parser
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-react-parser)](https://www.npmjs.com/package/@sisu-ai/mw-react-parser)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Lightweight ReAct-style tool loop. Lets the model decide an action in natural language, you parse it, execute, and then the model reflects and answers.

## Setup
```bash
npm i @sisu-ai/mw-react-parser
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## Behavior (ReAct pattern)
- Think: Ask the model for an initial response with tools disabled (`toolChoice: 'none'`).
- Act: Parse `Action: <tool>` and `Action Input: <json or text>` from its message.
- Observe: Execute the named tool with parsed input, append a `role:'tool'` message.
- Reflect: Ask the model again to produce the final answer that incorporates the observation.

## Usage
```ts
import { reactToolLoop } from '@sisu-ai/mw-react-parser';

const app = new Agent()
  .use(reactToolLoop());
```

Prompting tip
- Seed system with the expected format, e.g.:
  - `Use tools when helpful. Reply with\nAction: <tool>\nAction Input: <JSON>`

Customizing
- Provide your own tools via `@sisu-ai/mw-register-tools` and define strict zod schemas for reliable parsing.
- If you need a different action syntax, build a small middleware before/after to transform the assistant message.

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
