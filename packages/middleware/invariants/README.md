# @sisu-ai/mw-invariants

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
