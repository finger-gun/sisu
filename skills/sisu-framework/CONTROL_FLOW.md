# Control Flow Patterns

Advanced control flow for Sisu agents using `@sisu-ai/mw-control-flow`.

## Installation

```bash
pnpm add @sisu-ai/mw-control-flow
```

## sequence - Run steps in order

```typescript
import { sequence } from '@sisu-ai/mw-control-flow';

const step1 = async (ctx, next) => {
  ctx.log.info('Step 1');
  await next();
};

const step2 = async (ctx, next) => {
  ctx.log.info('Step 2');
  await next();
};

.use(sequence([step1, step2, step3]))
```

## branch - Conditional routing

```typescript
import { branch } from '@sisu-ai/mw-control-flow';

const isWeatherQuery = (ctx) => /weather|temperature/i.test(ctx.input ?? '');

.use(branch(
  isWeatherQuery,
  toolPipeline,      // if true
  chatPipeline       // if false (optional)
))
```

## switchCase - Multi-way routing

```typescript
import { switchCase } from '@sisu-ai/mw-control-flow';

const classify = async (ctx, next) => {
  const input = ctx.input?.toLowerCase() ?? '';
  if (input.includes('weather')) ctx.state.intent = 'weather';
  else if (input.includes('search')) ctx.state.intent = 'search';
  else ctx.state.intent = 'chat';
  await next();
};

.use(classify)
.use(switchCase(
  ctx => ctx.state.intent,
  {
    'weather': weatherPipeline,
    'search': searchPipeline,
    'chat': chatPipeline
  },
  chatPipeline  // fallback (optional)
))
```

## loopUntil - Do-while loop

Run body at least once, continue until condition is true.

```typescript
import { loopUntil, sequence } from '@sisu-ai/mw-control-flow';

const setMoreFlag = async (ctx, next) => {
  ctx.state.needsMoreSteps = ctx.messages.at(-1)?.role === 'tool';
  await next();
};

const body = sequence([
  toolCalling,
  setMoreFlag
]);

.use(loopUntil(
  ctx => !ctx.state.needsMoreSteps,  // done condition
  body,
  { max: 6 }  // safety limit
))
```

## loopWhile - While loop

Evaluate condition before each iteration.

```typescript
import { loopWhile } from '@sisu-ai/mw-control-flow';

.use(loopWhile(
  ctx => ctx.state.retries < 3,  // continue condition
  retryBody,
  { max: 5 }
))
```

## parallel - Fork and merge

Run same context through multiple branches concurrently.

```typescript
import { parallel } from '@sisu-ai/mw-control-flow';

const branch1 = async (ctx) => {
  const res = await ctx.model.generate([
    { role: 'user', content: 'Summarize this: ...' }
  ]);
  return res?.message?.content;
};

const branch2 = async (ctx) => {
  const res = await ctx.model.generate([
    { role: 'user', content: 'Extract keywords: ...' }
  ]);
  return res?.message?.content;
};

const merge = (ctx, results) => {
  ctx.messages.push({
    role: 'assistant',
    content: `Summary: ${results[0]}\nKeywords: ${results[1]}`
  });
};

.use(parallel([branch1, branch2], merge))
```

## graph - DAG execution

For complex multi-step flows with conditional edges.

```typescript
import { graph, type Node, type Edge } from '@sisu-ai/mw-control-flow';

const nodes: Node[] = [
  {
    id: 'classify',
    run: async (ctx, next) => {
      ctx.state.intent = /weather/.test(ctx.input ?? '') ? 'tool' : 'chat';
      await next();
    }
  },
  {
    id: 'tools',
    run: toolPipeline
  },
  {
    id: 'chat',
    run: chatPipeline
  },
  {
    id: 'polish',
    run: async (ctx, next) => {
      // Refine output
      await next();
    }
  }
];

const edges: Edge[] = [
  { from: 'classify', to: 'tools', when: ctx => ctx.state.intent === 'tool' },
  { from: 'classify', to: 'chat', when: ctx => ctx.state.intent === 'chat' },
  { from: 'tools', to: 'polish' },
  { from: 'chat', to: 'polish' }
];

.use(graph(nodes, edges, 'classify'))
```

## Complete example

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { sequence, branch, loopUntil } from "@sisu-ai/mw-control-flow";
import { toolCalling } from "@sisu-ai/mw-tool-calling";
import { registerTools } from "@sisu-ai/mw-register-tools";

const classify = async (ctx, next) => {
  ctx.state.needsTools = /weather|search/.test(ctx.input ?? "");
  await next();
};

const setMoreFlag = async (ctx, next) => {
  ctx.state.more = ctx.messages.at(-1)?.role === "tool";
  await next();
};

const toolFlow = sequence([
  registerTools([weatherTool, searchTool]),
  loopUntil((ctx) => !ctx.state.more, sequence([toolCalling, setMoreFlag]), {
    max: 6,
  }),
]);

const chatFlow = async (ctx) => {
  const res = await ctx.model.generate(ctx.messages, { toolChoice: "none" });
  if (res?.message) ctx.messages.push(res.message);
};

const app = new Agent()
  .use(errorBoundary())
  .use(classify)
  .use(branch((ctx) => ctx.state.needsTools, toolFlow, chatFlow));
```

## Best practices

1. **Prefer branch/switchCase** for simple routing over graph
2. **Always set max iterations** on loops
3. **Keep node bodies small** in graphs
4. **Use sequence** to compose named phases
5. **Test edge conditions** (empty input, max iterations)

## Common mistakes

### ❌ No max iteration limit

```typescript
// WRONG - could loop forever
loopWhile((ctx) => ctx.state.retry, body);

// CORRECT
loopWhile((ctx) => ctx.state.retry, body, { max: 5 });
```

### ❌ Forgetting to set loop exit condition

```typescript
// WRONG - condition never changes
loopUntil((ctx) => ctx.state.done, body, { max: 10 });

// CORRECT - body sets the flag
const body = sequence([
  toolCalling,
  async (ctx, next) => {
    ctx.state.done = ctx.messages.at(-1)?.role !== "tool";
    await next();
  },
]);
```

### ❌ Too many branches in graph

```typescript
// WRONG - too complex
const nodes = [node1, node2, ..., node20];

// CORRECT - break into smaller graphs
const subGraph1 = graph(nodes1_5, edges1_5, 'start1');
const subGraph2 = graph(nodes6_10, edges6_10, 'start2');
```

## External docs

- [Control flow README](https://github.com/finger-gun/sisu/tree/main/packages/middleware/control-flow)
- [Control flow example](https://github.com/finger-gun/sisu/tree/main/examples/openai-control-flow)
- [Branch example](https://github.com/finger-gun/sisu/tree/main/examples/openai-branch)
- [Graph example](https://github.com/finger-gun/sisu/tree/main/examples/openai-graph)
