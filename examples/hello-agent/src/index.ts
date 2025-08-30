import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu/core';
import { usageTracker } from '@sisu/mw-usage-tracker';
import { openAIAdapter } from '@sisu/adapter-openai';
import { traceViewer } from '@sisu/mw-trace-viewer';

// Minimal example: send a single prompt, get a single assistant message.
// Usage:
//   OPENAI_API_KEY=... npm run dev -w examples/hello-agent -- "Say hello in one sentence."

const model = openAIAdapter({ model: 'gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/'  });

const ctx: Ctx = {
  input: process.argv.slice(2).join(' ') || 'Say hello in one short sentence.',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

// One tiny middleware: turns input into a user message and gets one assistant reply.
const inputToMessage = async (c: Ctx, next: () => Promise<void>) => {
  if (c.input) c.messages.push({ role: 'user', content: c.input });
  await next();
};
const generateOnce = async (c: Ctx, _next: () => Promise<void>) => {
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
};

const app = new Agent()
  .use(async (c, next) => { try { await next(); } catch (e) { c.log.error(e); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); } })
  .use(traceViewer({ style: 'modern' }))
  .use(usageTracker({ '*': { inputPer1K: 0.15, outputPer1K: 0.6 } }, { logPerCall: true }))
  .use(inputToMessage)
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
