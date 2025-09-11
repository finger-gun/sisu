import { test, expect } from 'vitest';
import {
  createTracingLogger,
  parseFlags,
  configFromFlagsAndEnv,
  firstConfigValue,
  bufferStream,
  teeStream,
  SimpleTools,
  NullStream,
} from '../src/util.js';
import type { Tool, Ctx } from '../src/types.js';

test('parseFlags parses equals, pairs and booleans', () => {
  const flags = parseFlags(['node','script','--foo=bar','--alpha','1','--bool']);
  expect(flags.foo).toBe('bar');
  expect(flags.alpha).toBe('1');
  expect(flags.bool).toBe(true);
});

test('firstConfigValue prefers CLI over env', () => {
  const flags = parseFlags(['node','script','--openai-api-key=cliKey']);
  const env = { OPENAI_API_KEY: 'envKey' } as any;
  const v = firstConfigValue(['OPENAI_API_KEY'], flags, env);
  expect(v).toBe('cliKey');
});

test('configFromFlagsAndEnv maps multiple names with precedence', () => {
  const flags = parseFlags(['node','script','--openai-api-key=cli', '--base-url', 'http://cli.example']);
  const env = { OPENAI_API_KEY: 'env', BASE_URL: 'http://env.example' } as any;
  const conf = configFromFlagsAndEnv(['OPENAI_API_KEY','BASE_URL'], flags, env);
  expect(conf.OPENAI_API_KEY).toBe('cli');
  expect(conf.BASE_URL).toBe('http://cli.example');
});

test('bufferStream captures writes and teeStream fans out', () => {
  const buf1 = bufferStream();
  const buf2 = bufferStream();
  const tee = teeStream(buf1.stream, buf2.stream);
  tee.write('Hello');
  tee.write(' World');
  tee.end();
  expect(buf1.getText()).toBe('Hello World');
  expect(buf2.getText()).toBe('Hello World');
});

test('SimpleTools registers, gets and lists tools', async () => {
  const tools = new SimpleTools();
  const t1: Tool = { name: 't1', description: 'd', schema: {}, handler: async () => 'ok' };
  const t2: Tool = { name: 't2', description: 'd2', schema: {}, handler: async () => ({}) };
  tools.register(t1);
  tools.register(t2);
  expect(tools.get('t1')).toBe(t1);
  expect(tools.list().map(t => t.name).sort()).toEqual(['t1','t2']);
});

test('NullStream is a safe no-op', () => {
  const s = new NullStream();
  // should not throw
  s.write('x');
  s.end();
});

test('createTracingLogger records events and forwards', () => {
  const { logger, getTrace, reset } = createTracingLogger();
  logger.debug('a');
  logger.info('b', { c: 1 });
  logger.warn('w');
  logger.error('e');
  logger.span?.('step', { ok: true });
  const evs = getTrace();
  expect(evs.length).toBeGreaterThanOrEqual(5);
  expect(evs[0].level).toBe('debug');
  expect(evs.some(e => e.level === 'span')).toBe(true);
  reset();
  expect(getTrace().length).toBe(0);
});

