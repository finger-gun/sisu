import 'dotenv/config';
import { Agent, createCtx, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { reactToolLoop } from '@sisu-ai/mw-react-parser';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { z } from 'zod';

// ReAct-style tooling: the model emits `Action:` and `Action Input:` which we parse.
const echoTool = {
  name: 'echo',
  description: 'Echo back the provided text',
  schema: z.object({ text: z.string() }),
  handler: async ({ text }: { text: string }) => ({ text })
};

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' }),
  input: 'Use Action: echo with Action Input: {"text":"hello from ReAct"}',
  systemPrompt: 'Use tools when helpful. For ReAct, reply with\nAction: <tool>\nAction Input: <JSON>',
  logLevel: (process.env.LOG_LEVEL as any) ?? 'info',
});

const app = new Agent()
  .use(errorBoundary(async (err, ctx) => { ctx.log.error(err); ctx.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(usageTracker({ '*': { inputPer1M: 0.15, outputPer1M: 0.60 } }, { logPerCall: true }))
  .use(registerTools([echoTool as any]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 12 }))
  .use(reactToolLoop());

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
