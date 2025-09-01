import { test, expect } from 'vitest';
import type { Ctx, Message } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { inputToMessage, conversationBuffer } from '../src/index.js';

function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  const ac = new AbortController();
  const base: Ctx = {
    input: '',
    messages: [],
    model: { name: 'dummy', capabilities: {}, async generate() { return { message: { role: 'assistant', content: '' } }; } },
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
  return Object.assign(base, partial);
}

test('inputToMessage pushes input as user message', async () => {
  const ctx = makeCtx({ input: 'Hello' });
  await compose([inputToMessage])(ctx);
  expect(ctx.messages.length).toBe(1);
  const m = ctx.messages[0] as Message;
  expect(m.role).toBe('user');
  expect(m.content).toBe('Hello');
});

test('conversationBuffer keeps head and last N messages', async () => {
  const msgs: Message[] = [{ role: 'system', content: 'sys' } as any];
  for (let i = 0; i < 5; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: String(i) } as any);
  const ctx = makeCtx({ messages: msgs.slice() });
  await compose([conversationBuffer({ window: 3 })])(ctx);
  // Expect head + last 3
  expect(ctx.messages.length).toBe(4);
  expect((ctx.messages[0] as any).role).toBe('system');
  const tails = ctx.messages.slice(1).map(m => (m as any).content);
  expect(tails).toEqual(['2','3','4']);
});
