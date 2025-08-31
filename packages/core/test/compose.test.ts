import { test } from 'vitest';
import assert from 'node:assert';
import { compose, type Middleware } from '../src/compose.js';

test('compose runs middleware in sequence', async () => {
  const events: string[] = [];
  const mw1: Middleware<any> = async (ctx, next) => {
    events.push('mw1-before');
    ctx.seq.push(1);
    await next();
    events.push('mw1-after');
  };
  const mw2: Middleware<any> = async (ctx, next) => {
    events.push('mw2');
    ctx.seq.push(2);
    await next();
  };
  const handler = compose([mw1, mw2]);
  const ctx: any = { seq: [] };
  await handler(ctx);
  assert.deepStrictEqual(ctx.seq, [1,2]);
  assert.deepStrictEqual(events, ['mw1-before','mw2','mw1-after']);
});

test('compose throws when next called multiple times', async () => {
  const mw: Middleware<any> = async (_ctx, next) => { await next(); await next(); };
  const handler = compose([mw]);
  await assert.rejects(handler({} as any), /next\(\) called multiple times/);
});
