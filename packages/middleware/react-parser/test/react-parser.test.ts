import { test } from 'vitest';
import assert from 'node:assert';
import type { Ctx, Tool } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { reactToolLoop } from '../src/index.js';

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

test('reactToolLoop parses tool action, invokes tool, and appends follow-up', async () => {
  const echo: Tool<{ text: string }> = { name: 'echo', schema: { parse: (x: any) => x }, async handler({ text }) { return `ECHO:${text}`; } } as any;
  const tools = new SimpleTools();
  tools.register(echo);

  let calls = 0;
  const model = {
    name: 'dummy', capabilities: {},
    async generate(messages: any[]) {
      calls++;
      if (calls === 1) {
        return { message: { role: 'assistant', content: 'Action: echo\nAction Input: {"text":"hello"}' } } as any;
      }
      const last = messages[messages.length - 1];
      if (last?.role === 'user' && /Observation/.test(last.content)) {
        return { message: { role: 'assistant', content: 'final' } } as any;
      }
      return { message: { role: 'assistant', content: 'idle' } } as any;
    },
  };

  const ctx = makeCtx({ tools, model } as any);
  await compose([reactToolLoop()])(ctx);
  const last = ctx.messages[ctx.messages.length - 1];
  assert.strictEqual(last.role, 'assistant');
  assert.strictEqual(last.content, 'final');
  assert.ok(ctx.messages.some((m: any) => m.role === 'user' && /Observation \(echo\):/.test(m.content)));
});

test('reactToolLoop appends assistant when no tool action parsed', async () => {
  const model = { name: 'dummy', capabilities: {}, async generate() { return { message: { role: 'assistant', content: 'no tools here' } } as any; } } as any;
  const ctx = makeCtx({ model });
  await compose([reactToolLoop()])(ctx);
  const last = ctx.messages.at(-1) as any;
  assert.strictEqual(last?.content, 'no tools here');
});

