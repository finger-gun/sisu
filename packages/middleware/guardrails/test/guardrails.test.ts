import { test, expect } from 'vitest';
import type { Ctx } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { withGuardrails } from '../src/index.js';

function makeCtx(input: string): Ctx {
  const ac = new AbortController();
  return {
    input,
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

test('withGuardrails intercepts when policy returns violation', async () => {
  const policy = async (msg: string) => msg.includes('bad') ? 'violation' : null;
  let reached = false;
  const tail = async () => { reached = true; };
  const ctx = makeCtx('bad words');
  await compose([withGuardrails(policy), tail as any])(ctx);
  expect(reached).toBe(false);
  const last = ctx.messages[ctx.messages.length - 1];
  expect(last.role).toBe('assistant');
  expect(last.content).toBe('violation');
});

test('withGuardrails passes through when no violation and calls next', async () => {
  const policy = async (_msg: string) => null;
  const ctx = makeCtx('all good');
  const tail = async (c: any) => { c.messages.push({ role: 'assistant', content: 'ok' } as any); };
  await compose([withGuardrails(policy), tail as any])(ctx);
  // next() executed, and no guardrails message inserted
  const last = ctx.messages[ctx.messages.length - 1] as any;
  expect(last.content).toBe('ok');
});

test('withGuardrails passes empty string to policy when input is undefined', async () => {
  let seen: string | undefined;
  const policy = async (msg: string) => { seen = msg; return null; };
  const ctx = makeCtx('');
  delete (ctx as any).input; // simulate missing input
  await compose([withGuardrails(policy)])(ctx);
  expect(seen).toBe('');
});
