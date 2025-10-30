import 'dotenv/config';
import { Agent, createCtx, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { openAIAdapter } from '@sisu-ai/adapter-openai';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';

// Vision-capable model
// Example image (public domain)
const imageUrl = process.argv.find(a => a.startsWith('http'))
  || 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg';

// Use content parts to include text + image
const userMessage: any = {
  role: 'user',
  content: [
    { type: 'text', text: 'Please describe this image.' },
    { type: 'image_url', image_url: { url: imageUrl } },
  ],
};

const ctx = createCtx({
  model: openAIAdapter({ model: process.env.MODEL || 'gpt-4o-mini' }),
  systemPrompt: 'You are a concise, helpful assistant.',
  logLevel: (process.env.LOG_LEVEL as any) ?? 'info',
  tools: { list: () => [], get: () => undefined, register: () => { /* no-op */ } },
});

// Add the user message with image after context creation
ctx.messages.push(userMessage);

const generateOnce = async (c: Ctx) => {
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
};

const app = new Agent()
  .use(async (c, next) => { try { await next(); } catch (e) { c.log.error(e); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); } })
  .use(traceViewer())
  .use(usageTracker({
    '*': { inputPer1M: 0.15, outputPer1M: 0.60, imagePer1K: 0.217 },
  }, { logPerCall: true }))
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
