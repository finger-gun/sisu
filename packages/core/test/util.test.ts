import { test } from 'vitest';
import assert from 'node:assert';
import { createRedactingLogger, InMemoryKV } from '../src/util.js';
import type { Logger } from '../src/types.js';

test('createRedactingLogger masks configured keys', () => {
  const logs: any[][] = [];
  const base: Logger = {
    debug: (...a: any[]) => { logs.push(a); },
    info: () => {},
    warn: () => {},
    error: () => {},
    span: () => {}
  };
  const logger = createRedactingLogger(base, { keys: ['secret'] });
  logger.debug({ secret: 'value', safe: 'ok' });
  assert.deepStrictEqual(logs[0][0], { secret: '***REDACTED***', safe: 'ok' });
});

test('InMemoryKV stores and retrieves values', async () => {
  const mem = new InMemoryKV();
  await mem.set('foo', 'bar');
  assert.strictEqual(await mem.get('foo'), 'bar');

  await mem.set('retrieval:docs', ['Alpha', 'Beta']);
  const res = await mem.retrieval('docs').search('beta');
  assert.strictEqual(res[0].text, 'Beta');
});
