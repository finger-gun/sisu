import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Tool, type Ctx } from '@sisu-ai/core';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { switchCase, sequence, loopUntil } from '@sisu-ai/mw-control-flow';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { z } from 'zod';

// Simple weather tool
interface WeatherArgs { city: string }
const weather: Tool<WeatherArgs> = {
  name: 'getWeather',
  description: 'Get weather for a city',
  schema: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ city, tempC: 21, summary: 'Sunny' }),
};

const model = openAIAdapter({ model: 'openai/gpt-oss-20b', baseUrl: 'http://127.0.0.1:1234/' });

const ctx: Ctx = {
  input: process.argv.slice(2).join(' ') || 'What is the weather in Malmö?',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger(),
};

// Very small intent classifier
const intentClassifier = async (c: Ctx, next: () => Promise<void>) => {
  const q = String(c.input ?? '').toLowerCase();
  c.state.intent = q.includes('weather') || q.includes('forecast') ? 'tooling' : 'chat';
  await next();
};

// Decide whether to loop for another tool call (simple one-turn tool loop)
const decideIfMoreTools = async (c: Ctx, next: () => Promise<void>) => {
  const wasTool = c.messages.at(-1)?.role === 'tool';
  const turns = Number(c.state.turns ?? 0);
  c.state.moreTools = Boolean(wasTool && turns < 1);
  c.state.turns = turns + 1;
  await next();
};

// Tooling path: call tools, maybe loop once
const toolingBody = sequence([ toolCalling, decideIfMoreTools ]);
const toolingLoop = loopUntil(c => !c.state.moreTools, toolingBody, { max: 3 });

// Chat path: simple single-turn completion (no tools)
const chatPipeline = sequence([ async (c: Ctx) => {
  const res = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if ((res as any)?.message) c.messages.push((res as any).message);
}]);

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(registerTools([weather]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(intentClassifier)
  .use(switchCase((c) => String(c.state.intent), { tooling: toolingLoop, chat: chatPipeline }, chatPipeline));

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
