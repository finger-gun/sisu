# @sisu-ai/mw-react-parser

Lightweight ReAct-style tool loop.

## Behavior
- Asks the model for a reply with tools disabled.
- Parses `Action: <tool>` and `Action Input: <json or text>` from the assistant message.
- Invokes the tool and appends a `role:'tool'` message.
- Asks the model again for a final assistant message.

## Usage
```ts
import { reactToolLoop } from '@sisu-ai/mw-react-parser';

const app = new Agent()
  .use(reactToolLoop());
```
