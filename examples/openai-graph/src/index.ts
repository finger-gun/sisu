import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { graph, type Node, type Edge } from '@sisu-ai/mw-control-flow';

const model = openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' });

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Give me a short travel tip for Helsinki.',
  messages: [{ role: 'system', content: 'Be helpful and brief.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

// Graph: classify -> (draft || chat) -> polish
const classify: Node<Ctx> = {
  id: 'classify',
  run: async (c, next) => { c.state.intent = /plan|itinerary|route/i.test(c.input ?? '') ? 'draft' : 'chat'; await next(); }
};
const draft: Node<Ctx> = {
  id: 'draft',
  run: async (c) => {
    const res: any = await c.model.generate([...c.messages, { role: 'user', content: 'Draft a 3-step plan.' }], { toolChoice: 'none', signal: c.signal });
    if (res?.message) c.messages.push({ role: 'assistant', content: 'Draft: ' + (res.message.content || '') });
  }
};
const chat: Node<Ctx> = {
  id: 'chat',
  run: async (c) => {
    const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
    if (res?.message) c.messages.push(res.message);
  }
};
const polish: Node<Ctx> = {
  id: 'polish',
  run: async (c) => {
    const res: any = await c.model.generate([...c.messages, { role: 'user', content: 'Polish the answer into one compact paragraph.' }], { toolChoice: 'none', signal: c.signal });
    if (res?.message) c.messages.push(res.message);
  }
};

const edges: Edge<Ctx>[] = [
  { from: 'classify', to: 'draft', when: (c) => c.state.intent === 'draft' },
  { from: 'classify', to: 'chat', when: (c) => c.state.intent !== 'draft' },
  { from: 'draft', to: 'polish' },
  { from: 'chat', to: 'polish' },
];

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }))
  .use(inputToMessage)
  .use(graph<Ctx>([classify, draft, chat, polish], edges, 'classify'));

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
