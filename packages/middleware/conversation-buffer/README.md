# @sisu-ai/mw-conversation-buffer
[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-conversation-buffer)](https://www.npmjs.com/package/@sisu-ai/mw-conversation-buffer)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)

Helpers for shaping basic conversation state.

## Setup
```bash
npm i @sisu-ai/mw-conversation-buffer
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `inputToMessage` — appends `{ role:'user', content: ctx.input }` when present.
- `conversationBuffer({ window=12 })` — keeps only the first message and the last `window` messages.

## Usage
```ts
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';

const app = new Agent()
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }));
```

# Community & Support
- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)
