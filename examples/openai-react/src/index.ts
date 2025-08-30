import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, SimpleTools, type Ctx } from '@sisu/core';
import { openAIAdapter } from '@sisu/adapter-openai';
import { registerTools } from '@sisu/mw-register-tools';
import { reactToolLoop } from '@sisu/mw-react-parser';
import { inputToMessage, conversationBuffer } from '@sisu/mw-conversation-buffer';
import { errorBoundary } from '@sisu/mw-error-boundary';
import { traceViewer } from '@sisu/mw-trace-viewer';
import { usageTracker } from '@sisu/mw-usage-tracker';
import { z } from 'zod';

// ReAct-style tooling: the model emits `Action:` and `Action Input:` which we parse.
const echoTool = {
  name: 'echo',
  description: 'Echo back the provided text',
  schema: z.object({ text: z.string() }),
  handler: async ({ text }: { text: string }) => ({ text })
};

const model = openAIAdapter({ model: 'gpt-4o-mini' });

const ctx: Ctx = {
  input: process.argv.filter(a => !a.startsWith('--')).slice(2).join(' ') || 'Use Action: echo with Action Input: {"text":"hello from ReAct"}',
  messages: [{ role: 'system', content: 'Use tools when helpful. For ReAct, reply with\nAction: <tool>\nAction Input: <JSON>' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => { ctx.log.error(err); ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer({ style: 'modern' }))
  .use(usageTracker({ '*': { inputPer1K: 0.15, outputPer1K: 0.6 } }, { logPerCall: true }))
  .use(registerTools([echoTool as any]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }))
  .use(reactToolLoop());

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);

