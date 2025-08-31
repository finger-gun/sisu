import { test } from 'vitest';
import assert from 'node:assert';
import type { Ctx } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { toolCallInvariant } from '../src/index.js';

function makeCtx(messages: any[]): Ctx {
  const ac = new AbortController();
  return {
    input: '',
    messages,
    model: { name: 'dummy', capabilities: {}, async generate() { return { message: { role: 'assistant', content: '' } }; } },
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
}

test('toolCallInvariant warns for missing tool responses', async () => {
  const messages = [
    { role: 'assistant', content: 'call', tool_calls: [{ id: 'x1', function: { name: 'foo' } }] },
    { role: 'tool', tool_call_id: 'x2', content: 'oops wrong id' },
  ] as any[];
  let warned: any[] | undefined;
  const ctx = makeCtx(messages);
  ctx.log = { ...ctx.log, warn: (...a: any[]) => { warned = a; } } as any;
  await compose([toolCallInvariant()])(ctx);
  assert.ok(warned, 'expected a warning');
});

test('toolCallInvariant throws in strict mode', async () => {
  const messages = [ { role: 'assistant', content: 'call', tool_calls: [{ id: 'x1', function: { name: 'foo' } }] } ] as any[];
  const ctx = makeCtx(messages);
  await assert.rejects(compose([toolCallInvariant({ strict: true })])(ctx), /Missing tool responses/);
});

