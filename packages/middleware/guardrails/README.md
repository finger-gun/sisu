# @sisu-ai/mw-guardrails

Policy guardrails to short-circuit unsafe input.

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
