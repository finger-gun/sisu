import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Say hello in one short sentence.',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const inputToMessage = async (c: Ctx, next: () => Promise<void>) => { if (c.input) c.messages.push({ role: 'user', content: c.input }); await next(); };
const generateOnce = async (c: Ctx) => { const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal }); if (res?.message) c.messages.push(res.message); };

const app = new Agent()
  .use(async (c, next) => { try { await next(); } catch (e) { c.log.error(e); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); } })
  .use(traceViewer({ style: 'modern' }))
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }, { logPerCall: true }))
  .use(inputToMessage)
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
