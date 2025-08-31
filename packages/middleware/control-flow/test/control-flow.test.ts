import { test } from 'vitest';
import assert from 'node:assert';

import { compose, type Ctx, InMemoryKV, NullStream, SimpleTools } from '@sisu-ai/core';
import { sequence, branch, switchCase, loopWhile, loopUntil, parallel, graph } from '../src/index.js';

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

test('sequence executes middlewares in order', async () => {
  const seen: string[] = [];
  const a = async (c: Ctx, next: () => Promise<void>) => { seen.push('a'); c.state.a = 1; await next(); };
  const b = async (c: Ctx, next: () => Promise<void>) => { seen.push('b'); c.state.b = 2; await next(); };
  const handler = compose([sequence([a, b])]);
  const ctx = makeCtx();
  await handler(ctx);
  assert.deepStrictEqual(seen, ['a', 'b']);
  assert.deepStrictEqual(ctx.state, { a: 1, b: 2 });
});

test('branch routes to onTrue and onFalse', async () => {
  const ctxT = makeCtx({ state: {} });
  const ctxF = makeCtx({ state: {} });
  const onTrue = async (c: Ctx) => { c.state.path = 'T'; };
  const onFalse = async (c: Ctx) => { c.state.path = 'F'; };
  const mwT = branch(() => true, onTrue, onFalse);
  const mwF = branch(() => false, onTrue, onFalse);
  await compose([mwT])(ctxT);
  await compose([mwF])(ctxF);
  assert.strictEqual(ctxT.state.path, 'T');
  assert.strictEqual(ctxF.state.path, 'F');
});

test('switchCase routes by key and uses fallback', async () => {
  const ctxA = makeCtx({ state: {} });
  const ctxX = makeCtx({ state: {} });
  const routes = {
    A: async (c: Ctx) => { c.state.hit = 'A'; },
    B: async (c: Ctx) => { c.state.hit = 'B'; },
  };
  const fallback = async (c: Ctx) => { c.state.hit = 'fallback'; };
  await compose([switchCase(() => 'A', routes, fallback)])(ctxA);
  await compose([switchCase(() => 'X', routes, fallback)])(ctxX);
  assert.strictEqual(ctxA.state.hit, 'A');
  assert.strictEqual(ctxX.state.hit, 'fallback');
});

test('loopWhile executes while predicate holds and respects max', async () => {
  const ctx = makeCtx({ state: { i: 0 } });
  const body = async (c: Ctx) => { c.state.i = (c.state.i as number) + 1; };
  await compose([loopWhile((c) => (c.state.i as number) < 3, body)])(ctx);
  assert.strictEqual(ctx.state.i, 3);

  const ctxMax = makeCtx({ state: { i: 0 } });
  await compose([loopWhile(() => true, body, { max: 2 })])(ctxMax);
  assert.strictEqual(ctxMax.state.i, 2);
});

test('loopUntil executes until done becomes true and respects max', async () => {
  const ctx = makeCtx({ state: { i: 0 } });
  const body = async (c: Ctx) => { c.state.i = (c.state.i as number) + 1; };
  const done = (c: Ctx) => (c.state.i as number) >= 3;
  await compose([loopUntil(done, body)])(ctx);
  assert.strictEqual(ctx.state.i, 3);

  const ctxMax = makeCtx({ state: { i: 0 } });
  await compose([loopUntil(() => false, body, { max: 2 })])(ctxMax);
  assert.strictEqual(ctxMax.state.i, 2);
});

test('parallel clones context per branch and merges results', async () => {
  const ctx = makeCtx({ state: {} });
  const b1 = async (c: Ctx) => { c.state.val = 1; };
  const b2 = async (c: Ctx) => { c.state.val = 2; };
  const merge = async (c: Ctx, forks: Ctx[]) => { c.state.results = forks.map(f => f.state.val); };
  await compose([parallel([b1, b2], merge)])(ctx);
  assert.deepStrictEqual(ctx.state.results, [1, 2]);
});

test('graph executes nodes following edges', async () => {
  const order: string[] = [];
  const a = { id: 'a', run: async (_: Ctx) => { order.push('a'); } };
  const b = { id: 'b', run: async (_: Ctx) => { order.push('b'); } };
  const edges = [{ from: 'a', to: 'b' }];
  await compose([graph([a, b], edges, 'a')])(makeCtx());
  assert.deepStrictEqual(order, ['a', 'b']);
});

test('graph throws on excessive steps (cycle)', async () => {
  const x = { id: 'x', run: async (_: Ctx) => {} };
  const edges = [{ from: 'x', to: 'x' }];
  const handler = compose([graph([x], edges, 'x')]);
  await assert.rejects(handler(makeCtx()), /step limit exceeded/);
});

