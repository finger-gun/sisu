import { test } from 'vitest';
import assert from 'node:assert';
import { Agent } from '../src/Agent.js';

test('Agent executes middleware in order', async () => {
  const calls: string[] = [];
  const agent = new Agent<any>();
  agent
    .use(async (_c, next) => { calls.push('mw1'); await next(); })
    .use(async (_c, next) => { calls.push('mw2'); await next(); })
    .use(async () => { calls.push('mw3'); });
  await agent.handler()({} as any);
  assert.deepStrictEqual(calls, ['mw1','mw2','mw3']);
});
