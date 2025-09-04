import { test, expect } from 'vitest';
import type { Ctx } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { errorBoundary } from '../src/index.js';

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

test('errorBoundary catches errors and invokes handler', async () => {
  const seen: any[] = [];
  const onError = async (err: unknown, _ctx: any) => { seen.push(err); };
  const boom = async () => { throw new Error('boom'); };
  await compose([errorBoundary(onError as any), boom as any])(makeCtx());
  expect(seen.length).toBe(1);
  expect(String(seen[0])).toMatch(/boom/);
});

