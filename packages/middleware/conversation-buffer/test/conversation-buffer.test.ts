import { test } from 'vitest';
import assert from 'node:assert';
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
  assert.strictEqual(ctx.messages.length, 1);
  const m = ctx.messages[0] as Message;
  assert.strictEqual(m.role, 'user');
  assert.strictEqual(m.content, 'Hello');
});

test('conversationBuffer keeps head and last N messages', async () => {
  const msgs: Message[] = [{ role: 'system', content: 'sys' } as any];
  for (let i = 0; i < 5; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: String(i) } as any);
  const ctx = makeCtx({ messages: msgs.slice() });
  await compose([conversationBuffer({ window: 3 })])(ctx);
  // Expect head + last 3
  assert.strictEqual(ctx.messages.length, 4);
  assert.strictEqual((ctx.messages[0] as any).role, 'system');
  const tails = ctx.messages.slice(1).map(m => (m as any).content);
  assert.deepStrictEqual(tails, ['2','3','4']);
});
