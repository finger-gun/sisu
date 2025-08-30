# @sisu/mw-conversation-buffer

Helpers for shaping basic conversation state.

## API
- `inputToMessage` — appends `{ role:'user', content: ctx.input }` when present.
- `conversationBuffer({ window=12 })` — keeps only the first message and the last `window` messages.

## Usage
```ts
import { inputToMessage, conversationBuffer } from '@sisu/mw-conversation-buffer';

const app = new Agent()
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }));
```
