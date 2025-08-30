# @sisu-ai/mw-control-flow

Combinators for composing agent pipelines like functions.

## Setup
```bash
npm i @sisu-ai/mw-control-flow
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `sequence([a,b,c])` — run middlewares in order, then continue.
- `branch(pred, onTrue, onFalse?)` — if/else routing.
- `switchCase(select, routes, fallback?)` — route by string key.
- `loopWhile(pred, body, { max })` — while-loop with safety max.
- `loopUntil(done, body, { max })` — do-while loop with safety max.
- `parallel([a,b], merge?)` — fork contexts, then merge.
- `graph(nodes, edges, start)` — minimal DAG executor.

## Usage
```ts
import { sequence, branch, switchCase, loopUntil } from '@sisu-ai/mw-control-flow';

const decide = async (c, next) => { c.state.intent = c.input?.match(/tools/i) ? 'tool' : 'chat'; await next(); };
const toolFlow = sequence([/* tool loop */]);
const chatFlow = sequence([/* plain chat */]);

const app = new Agent()
  .use(decide)
  .use(switchCase(c => String(c.state.intent), { tool: toolFlow, chat: chatFlow }, chatFlow));
```
