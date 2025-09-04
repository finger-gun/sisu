import { test, expect } from 'vitest';
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
  expect(logs[0][0]).toEqual({ secret: '***REDACTED***', safe: 'ok' });
});

test('InMemoryKV stores and retrieves values', async () => {
  const mem = new InMemoryKV();
  await mem.set('foo', 'bar');
  expect(await mem.get('foo')).toBe('bar');

  await mem.set('retrieval:docs', ['Alpha', 'Beta']);
  const res = await mem.retrieval('docs').search('beta');
  expect(res[0].text).toBe('Beta');
});
