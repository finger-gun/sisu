# @sisu-ai/mw-guardrails

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
