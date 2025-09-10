import 'dotenv/config';
import { Agent, type Ctx, createConsoleLogger, InMemoryKV, SimpleTools, stdoutStream, bufferStream, teeStream, streamOnce } from '@sisu-ai/core';
import { inputToMessage } from '@sisu-ai/mw-conversation-buffer';
import { anthropicAdapter } from '@sisu-ai/adapter-anthropic';

const model = anthropicAdapter({ model: process.env.MODEL || 'claude-sonnet-4-20250514' });

// Optional: capture a copy while also printing to stdout for demo purposes
const buf = bufferStream();

const ctx: Ctx = {
  input: 'Please explain our solar system as if I was 5.',
  messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
  model,
  tools: new SimpleTools(),
  memory: new InMemoryKV(),
  stream: teeStream(stdoutStream, buf.stream), // or just stdoutStream
  state: {},
  signal: new AbortController().signal,
  log: createConsoleLogger({ level: (process.env.LOG_LEVEL as any) ?? 'info' }),
};

const app = new Agent()
  .use(inputToMessage)
  .use(streamOnce); // streams tokens to ctx.stream, captures final assistant message

await app.handler()(ctx);

// If you used teeStream, you can also access the full streamed text:
console.log('\n\nCaptured buffer copy:\n', buf.getText());