# @sisu-ai/mw-react-parser

Lightweight ReAct-style tool loop.

## Setup
```bash
npm i @sisu-ai/mw-react-parser
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

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
