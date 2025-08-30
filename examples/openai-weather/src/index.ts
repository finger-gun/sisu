import 'dotenv/config';
import { Agent, createConsoleLogger, createRedactingLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { toolCallInvariant } from '@sisu-ai/mw-invariants';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { reactToolLoop } from '@sisu-ai/mw-react-parser';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { switchCase, sequence, loopUntil } from '@sisu-ai/mw-control-flow';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { z } from 'zod';

const weather = {
  name: 'getWeather',
  description: 'Get weather for a city (demo stub)',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }: { city: string }) => {
    if (city.toLowerCase() === 'stockholm') return { city, tempC: 21, summary: 'Sunny (stub)' };
    return { city, tempC: 18, summary: 'Partly cloudy (stub)' };
  }
};

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const baseLogger = createConsoleLogger();
const redactingLogger = createRedactingLogger(baseLogger);

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'What is the weather in Stockholm, then summarize in Swedish.',
  messages: [{ role: 'system', content: 'You are a helpful assistant. If you need weather, call the getWeather tool.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: redactingLogger,
};

const intentClassifier = async (c: Ctx, next: () => Promise<void>) => { const q = (c.input ?? '').toLowerCase(); c.state.intent = q.includes('weather') || q.includes('forecast') ? 'tooling' : 'chat'; await next(); };
const decideIfMoreTools = async (c: Ctx, next: () => Promise<void>) => { const wasTool = c.messages.at(-1)?.role === 'tool'; const turns = Number(c.state.turns ?? 0); c.state.moreTools = Boolean(wasTool && turns < 1); c.state.turns = turns + 1; await next(); };

const toolingBody = sequence([ toolCalling, decideIfMoreTools ]);
const toolingLoop = loopUntil((c) => !c.state.moreTools, toolingBody, { max: 6 });
const chatPipeline = sequence([ reactToolLoop() ]);

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => { ctx.log.error(err); ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer({ style: 'dark' }))
  .use(usageTracker({ '*': { inputPer1K: 0.15, outputPer1K: 0.6 } }))
  .use(registerTools([weather as any]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }))
  .use(intentClassifier)
  .use(toolCallInvariant())
  .use(switchCase((c) => String(c.state.intent), { tooling: toolingLoop, chat: chatPipeline }, chatPipeline));

await app.handler()(ctx, async () => {});
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
