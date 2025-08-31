import { test } from 'vitest';
import assert from 'node:assert';
import type { Ctx, Tool } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { registerTools } from '../src/index.js';

function makeCtx(): Ctx {
  const ac = new AbortController();
  return {
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
}

test('registerTools registers provided tools', async () => {
  const tools: Tool[] = [
    { name: 'a', schema: {}, async handler() { return 1; } } as any,
    { name: 'b', schema: {}, async handler() { return 2; } } as any,
  ];
  const ctx = makeCtx();
  await compose([registerTools(tools)])(ctx);
  assert.ok(ctx.tools.get('a'));
  assert.ok(ctx.tools.get('b'));
});

