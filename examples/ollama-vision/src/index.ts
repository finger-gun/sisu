import 'dotenv/config';
import { Agent, createConsoleLogger, InMemoryKV, NullStream, type Ctx } from '@sisu-ai/core';
import { usageTracker } from '@sisu-ai/mw-usage-tracker';
import { traceViewer } from '@sisu-ai/mw-trace-viewer';
import { ollamaAdapter } from '@sisu-ai/adapter-ollama';

// Vision-capable model (ensure pulled locally)
// Examples: `llava:latest`, `qwen2.5-vl:latest` (model availability may vary)
const model = ollamaAdapter({ model: process.env.MODEL || 'llava:latest' });

// Example image (public domain) or first CLI arg
const imageSrc = process.argv.find(a => a.startsWith('http'))
  || 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg';

async function toBase64(src: string): Promise<string> {
  // If already looks like base64 (data URL), strip prefix and return the payload
  if (src.startsWith('data:')) return src.split(',')[1] ?? '';
  // Simple heuristic: if not http(s), return as-is
  if (!/^https?:\/\//i.test(src)) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

// Prepare base64 image for Ollama (expects images as base64 strings)
const base64Image = await toBase64(imageSrc);

// Use content parts to include text + image (adapter maps to images[])
const userMessage: any = {
  role: 'user',
  content: [
    { type: 'text', text: 'Please describe this image.' },
    { type: 'image_url', image_url: { url: base64Image } },
  ],
};

const ctx: Ctx = {
  input: '',
  messages: [
    { role: 'system', content: 'You are a concise, helpful assistant.' },
    userMessage,
  ] as any,
  model,
  tools: { list: () => [], get: () => undefined, register: () => { /* no-op */ } },
  memory: new InMemoryKV(),
  stream: new NullStream(),
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const generateOnce = async (c: Ctx) => {
  const res: any = await c.model.generate(c.messages, { toolChoice: 'none', signal: c.signal });
  if (res?.message) c.messages.push(res.message);
};

const app = new Agent()
  .use(async (c, next) => { try { await next(); } catch (e) { c.log.error(e); c.messages.push({ role: 'assistant', content: 'Sorry, something went wrong.' }); } })
  .use(traceViewer())
  // Local models, so set costs to zero
  .use(usageTracker({ '*': { inputPer1K: 0, outputPer1K: 0, imagePer1K: 0 } }, { logPerCall: true }))
  .use(generateOnce);

await app.handler()(ctx);
const final = ctx.messages.filter(m => m.role === 'assistant').pop();
console.log('\nAssistant:\n', final?.content);
