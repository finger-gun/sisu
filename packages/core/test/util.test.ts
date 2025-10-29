import { test, expect, describe } from 'vitest';
import { createRedactingLogger, InMemoryKV } from '../src/util.js';
import type { Logger } from '../src/types.js';

describe('createRedactingLogger', () => {
  test('masks configured keys', () => {
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

  test('masks OpenAI-style API keys by pattern', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({ message: 'API key is sk-1234567890abcdefghijklmnopqrstuvwxyz123456' });
    expect(logs[0][0]).toEqual({ message: '***REDACTED***' });
  });

  test('masks JWT tokens by pattern', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    logger.debug({ token: jwt });
    expect(logs[0][0]).toEqual({ token: '***REDACTED***' });
  });

  test('masks GitHub personal access tokens by pattern', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({ auth: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' });
    expect(logs[0][0]).toEqual({ auth: '***REDACTED***' });
  });

  test('masks AWS access keys by pattern', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({ credentials: 'AKIAIOSFODNN7EXAMPLE' });
    expect(logs[0][0]).toEqual({ credentials: '***REDACTED***' });
  });

  test('masks Slack tokens by pattern', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({ slack: 'xoxb-1234567890-1234567890-abcdefghijklmnop' });
    expect(logs[0][0]).toEqual({ slack: '***REDACTED***' });
  });

  test('uses custom patterns when provided', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const customPattern = /custom-\d{4}/;
    const logger = createRedactingLogger(base, { patterns: [customPattern] });
    logger.debug({ code: 'custom-1234' });
    expect(logs[0][0]).toEqual({ code: '***REDACTED***' });
  });

  test('uses custom mask when provided', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base, { mask: '[HIDDEN]' });
    logger.debug({ apiKey: 'sk-1234567890abcdefghijklmnopqrstuvwxyz123456' });
    expect(logs[0][0]).toEqual({ apiKey: '[HIDDEN]' });
  });

  test('masks values in nested objects', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({
      config: {
        settings: {
          apiKey: 'sk-1234567890abcdefghijklmnopqrstuvwxyz123456'
        }
      }
    });
    expect(logs[0][0]).toEqual({
      config: {
        settings: {
          apiKey: '***REDACTED***'
        }
      }
    });
  });

  test('redacts entire value when key is sensitive', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({
      config: {
        auth: {
          username: 'admin',
          password: 'secret123'
        }
      }
    });
    // When 'auth' key is found, entire value is redacted for safety
    expect(logs[0][0]).toEqual({
      config: {
        auth: '***REDACTED***'
      }
    });
  });

  test('masks values in arrays', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({
      tokens: ['sk-1234567890abcdefghijklmnopqrstuvwxyz123456', 'safe-value']
    });
    expect(logs[0][0]).toEqual({
      tokens: ['***REDACTED***', 'safe-value']
    });
  });

  test('does not mask safe strings', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base);
    logger.debug({ message: 'This is a safe message', count: 42, flag: true });
    expect(logs[0][0]).toEqual({ message: 'This is a safe message', count: 42, flag: true });
  });

  test('combines key-based and pattern-based redaction', () => {
    const logs: any[][] = [];
    const base: Logger = {
      debug: (...a: any[]) => { logs.push(a); },
      info: () => {},
      warn: () => {},
      error: () => {},
      span: () => {}
    };
    const logger = createRedactingLogger(base, { keys: ['password'] });
    logger.debug({
      password: 'mypassword',
      token: 'sk-1234567890abcdefghijklmnopqrstuvwxyz123456',
      safe: 'value'
    });
    expect(logs[0][0]).toEqual({
      password: '***REDACTED***',
      token: '***REDACTED***',
      safe: 'value'
    });
  });
});

test('InMemoryKV stores and retrieves values', async () => {
  const mem = new InMemoryKV();
  await mem.set('foo', 'bar');
  expect(await mem.get('foo')).toBe('bar');

  await mem.set('retrieval:docs', ['Alpha', 'Beta']);
  const res = await mem.retrieval('docs').search('beta');
  expect(res[0].text).toBe('Beta');
});
