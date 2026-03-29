import { test, expect } from 'vitest';
import type { Ctx } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { errorBoundary, logAndRethrow, logErrors } from '../src/index.js';

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

test('errorBoundary stores _error details once and does not overwrite existing state', async () => {
  const ctx = makeCtx();
  ctx.state._error = { preexisting: true };
  const onError = async () => {};
  const boom = async () => { throw new Error('boom-state'); };
  await compose([errorBoundary(onError as any), boom as any])(ctx);
  expect(ctx.state._error).toEqual({ preexisting: true });
});

test('logErrors middleware swallows downstream error after logging', async () => {
  const ctx = makeCtx();
  let called = false;
  ctx.log.error = () => { called = true; };
  const boom = async () => { throw new Error('boom-log'); };
  await expect(compose([logErrors(), boom as any])(ctx)).resolves.toBeUndefined();
  expect(called).toBe(true);
});

test('logAndRethrow middleware rethrows downstream error', async () => {
  const ctx = makeCtx();
  const boom = async () => { throw new Error('boom-rethrow'); };
  await expect(compose([logAndRethrow(), boom as any])(ctx)).rejects.toThrow('boom-rethrow');
});
