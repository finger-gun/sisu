import 'dotenv/config';
import { Agent, createCtx, type Ctx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { registerTools } from '@sisu-ai/mw-register-tools';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { toolCalling } from '@sisu-ai/mw-tool-calling';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { wikipedia } from '@sisu-ai/tool-wikipedia';

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' }),
  input: 'Tell me about the Hubble Space Telescope using Wikipedia.',
  systemPrompt: 'You are a helpful assistant. Use the wikipediaLookup tool to fetch accurate facts. Prefer format: "summary". If the title is ambiguous, first call with format: "related" to pick the best page.',
  logLevel: (process.env.LOG_LEVEL as any) ?? 'info',
});

const app = new Agent()
  .use(errorBoundary(async (err, c) => { c.log.error(err); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); }))
  .use(traceViewer())
  .use(registerTools([wikipedia]))
  .use(inputToMessage)
  .use(conversationBuffer({ window: 6 }))
  .use(toolCalling);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
