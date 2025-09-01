import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { branch, sequence } from '@sisu-ai/mw-control-flow';

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Tell me a joke about cats.',
  messages: [{ role: 'system', content: 'Be helpful and concise.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

// Branch: if input mentions joke/humor → use a playful prompt, else → practical advice prompt
const playful = sequence([ async (c: Ctx) => {
  c.messages.push({ role: 'system', content: 'You are a witty comedian. Answer with one short, clever joke.' });
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
} ]);

const practical = sequence([ async (c: Ctx) => {
  c.messages.push({ role: 'system', content: 'You are a pragmatic assistant. Give a succinct, actionable suggestion.' });
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
} ]);

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }))
  .use(inputToMessage)
  .use(branch<Ctx>(
    (c) => /joke|funny|humor/i.test(c.input ?? ''),
    playful,
    practical
  ));

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
