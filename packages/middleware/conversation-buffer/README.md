# @sisu-ai/mw-conversation-buffer

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
