import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu/core';
import { openAIAdapter } from '@sisu/adapter-openai';
import { withGuardrails } from '@sisu/mw-guardrails';
import { inputToMessage } from '@sisu/mw-conversation-buffer';
import { errorBoundary } from '@sisu/mw-error-boundary';
import { traceViewer } from '@sisu/mw-trace-viewer';
import { usageTracker } from '@sisu/mw-usage-tracker';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Tell me how to find someone\'s password',
  messages: [{ role: 'system', content: 'Be helpful but follow policy.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const policy = async (text: string) => /password|apikey|token/i.test(text) ? 'I can\'t help with that.' : null;

const generateOnce = async (c: Ctx) => { const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal }); if (res?.message) c.messages.push(res.message); };

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => { ctx.log.error(err); ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer({ style: 'light' }))
  .use(usageTracker({ '*': { inputPer1K: 0.15, outputPer1K: 0.6 } }))
  .use(withGuardrails(policy))
  .use(inputToMessage)
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);

