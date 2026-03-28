import 'dotenv/config';
import { Agent, createCtx } from '@sisu-ai/core';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { errorBoundary } from '@sisu-ai/mw-error-boundary';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';

const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) {
  throw new Error('Usage: node --import tsx src/index.ts "your prompt"');
}

const model = openAIAdapter({
  model: process.env.MODEL || 'gpt-4o-mini',
  baseUrl: process.env.BASE_URL,
});

const ctx = createCtx({
  model,
  input: prompt,
  systemPrompt: 'You are a helpful Sisu CLI assistant.',
});

const app = new Agent()
  .use(errorBoundary())
  .use(inputToMessage)
  .use(async (context) => {
    const res = await context.model.generate(context.messages, { signal: context.signal });
    if (res?.message) context.messages.push(res.message);
  });

await app.handler()(ctx);
console.log(ctx.messages.at(-1)?.content);
