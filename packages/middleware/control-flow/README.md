# @sisu-ai/mw-control-flow

Combinators for composing agent pipelines like functions. Model steps stay explicit and testable while you express routing and iteration at the middleware layer.

## Setup
```bash
npm i @sisu-ai/mw-control-flow
```

## Documentation
Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu

## API
- `sequence([a,b,c])`: Run middlewares in order as one unit. Good for composing small steps into a named phase.
- `branch(pred, onTrue, onFalse?)`: Classic if/else routing. Pred is `(ctx) => boolean`.
- `switchCase(select, routes, fallback?)`: Route by key `(ctx) => string` to a middleware from `routes`.
- `loopWhile(pred, body, { max })`: While-loop; evaluates `pred(ctx)` before each iteration.
- `loopUntil(done, body, { max })`: Do-while; runs `body` at least once until `done(ctx)` returns true.
- `parallel([a,b], merge?)`: Fork the same `ctx` through branches concurrently, then `merge(ctx, results)`.
- `graph(nodes, edges, start)`: Small DAG runner. Each node has an `id` and `run(ctx, next)`. `edges` decide traversal.

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

### Branch
Use `branch` when a boolean predicate cleanly splits flow.
```ts
import { branch, sequence } from '@sisu-ai/mw-control-flow';

const playful = sequence([/* witty system prompt + generate */]);
const practical = sequence([/* pragmatic system prompt + generate */]);

app.use(branch(c => /joke|humor/i.test(c.input ?? ''), playful, practical));
```

### switchCase
Route by an intent or mode string computed from context.
```ts
import { switchCase, sequence } from '@sisu-ai/mw-control-flow';

const classify = async (c, next) => { c.state.intent = /weather/.test(c.input ?? '') ? 'tool' : 'chat'; await next(); };
const toolPipeline = sequence([/* register tools, toolCalling, etc. */]);
const chatPipeline = sequence([/* plain completion */]);

app.use(classify).use(switchCase(c => c.state.intent, { tool: toolPipeline, chat: chatPipeline }, chatPipeline));
```

### loopUntil / loopWhile
Iterate a sub-pipeline while a condition holds (with a safety cap).
```ts
import { loopUntil, sequence } from '@sisu-ai/mw-control-flow';

const decideIfMore = async (c, next) => { c.state.more = c.messages.at(-1)?.role === 'tool'; await next(); };
const body = sequence([/* toolCalling */ decideIfMore]);
app.use(loopUntil(c => !c.state.more, body, { max: 6 }));
```

### graph
Encode multi-step flows as nodes + conditional edges (DAG). Good for “classify → handle → polish” shapes.
```ts
import { graph, type Node, type Edge } from '@sisu-ai/mw-control-flow';

const nodes: Node[] = [
  { id: 'classify', run: async (c, next) => { c.state.intent = pickIntent(c.input); await next(); } },
  { id: 'draft',    run: async (c) => {/* generate a plan */} },
  { id: 'chat',     run: async (c) => {/* simple completion */} },
  { id: 'polish',   run: async (c) => {/* refine output */} },
];
const edges: Edge[] = [
  { from: 'classify', to: 'draft', when: c => c.state.intent === 'draft' },
  { from: 'classify', to: 'chat',  when: c => c.state.intent !== 'draft' },
  { from: 'draft', to: 'polish' },
  { from: 'chat',  to: 'polish' },
];
app.use(graph(nodes, edges, 'classify'));
```

Notes
- Keep node bodies small and reuse regular middlewares inside `graph` nodes where possible.
- Prefer `switchCase`/`branch` for simple splits; reach for `graph` when you have 3+ phases or need to rejoin branches.
