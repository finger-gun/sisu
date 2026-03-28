import 'dotenv/config';
import { Agent, createCtx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { inputToMessage, conversationBuffer } from '@sisu-ai/mw-conversation-buffer';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

const model = openAIAdapter({
  model: process.env.MODEL || 'gpt-4o-mini',
  baseUrl: process.env.BASE_URL,
});

const ctx = createCtx({
  model,
  input: process.argv.slice(2).join(' ') || 'Tell me what Sisu is in one sentence.',
  systemPrompt: 'You are a helpful assistant built with Sisu.',
});

const app = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(async (context) => {
    const res = await context.model.generate(context.messages, { signal: context.signal });
    if (res?.message) context.messages.push(res.message);
  });

await app.handler()(ctx);

const final = ctx.messages.at(-1);
console.log(final?.content);
