import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { parallel, sequence } from '@sisu-ai/mw-control-flow';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Explain sisu in two sentences and provide 5 concise hashtags.',
  messages: [{ role: 'system', content: 'Be concise.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const summary = sequence([ async (c: Ctx) => {
  const res: any = await c.model.generate([...c.messages, { role: 'user', content: 'Provide a two-sentence summary.' }], { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push({ role: 'assistant', content: 'Summary: ' + (res.message.content || '') });
} ]);

const hashtags = sequence([ async (c: Ctx) => {
  const res: any = await c.model.generate([...c.messages, { role: 'user', content: 'Provide 5 concise hashtags (no explanation).' }], { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push({ role: 'assistant', content: 'Hashtags: ' + (res.message.content || '') });
} ]);

const merge = async (c: Ctx, forks: Ctx[]) => {
  // Merge both assistant outputs back to the main context
  for (const f of forks) {
    const assistants = f.messages.filter(m => m.role === 'assistant');
    for (const m of assistants) c.messages.push(m);
  }
  // Final polish message
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
};

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }))
  .use(inputToMessage)
  .use(parallel<Ctx>([summary, hashtags], merge));

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
