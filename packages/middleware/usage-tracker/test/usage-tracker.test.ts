import { test, expect } from 'vitest';
import type { Ctx } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { usageTracker } from '../src/index.js';

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

test('usageTracker accumulates token usage and cost (text only)', async () => {
  const prices = { dummy: { inputPer1K: 1, outputPer1K: 2 } };
  const ctx = makeCtx();
  // Provide a model that returns usage metrics directly
  ctx.model = {
    name: 'dummy',
    capabilities: {},
    async generate() { return { message: { role: 'assistant', content: '' }, usage: { promptTokens: 100, completionTokens: 50 } } as any; },
  } as any;
  const caller = async (c: Ctx) => { const res = await c.model.generate(c.messages, {}); c.messages.push((res as any).message); };
  await compose([usageTracker(prices), caller as any])(ctx);
  const usage: any = (ctx.state as any).usage;
  expect(usage.promptTokens).toBe(100);
  expect(usage.completionTokens).toBe(50);
  expect(usage.totalTokens).toBe(150);
  // cost = (100/1000)*1 + (50/1000)*2 = 0.2
  expect(usage.costUSD).toBe(0.2);
});

test('usageTracker counts image inputs and computes image cost', async () => {
  const prices = { dummy: { imageInputPer1K: 0.2, imageTokenPerImage: 1000 } };
  const ctx = makeCtx({ messages: [
    { role: 'user', content: [ { type: 'text', text: 'look' }, { type: 'image_url', image_url: 'http://x/1.png' } ] } as any,
    { role: 'user', content: [ { type: 'image_url', image_url: 'http://x/2.png' } ] } as any,
  ] });
  ctx.model = {
    name: 'dummy', capabilities: {},
    async generate() { return { message: { role: 'assistant', content: '' }, usage: { promptTokens: 2000, completionTokens: 0 } } as any; },
  } as any;
  const caller = async (c: Ctx) => { const res = await c.model.generate(c.messages, {}); c.messages.push((res as any).message); };
  await compose([usageTracker(prices), caller as any])(ctx);
  const usage: any = (ctx.state as any).usage;
  expect(usage.promptTokens).toBe(2000);
  expect(usage.completionTokens).toBe(0);
  expect(usage.totalTokens).toBe(2000);
  // two images -> 2000 image tokens at 0.2 per 1k => 0.4
  expect(usage.imageTokens).toBe(2000);
  expect(usage.imageCount).toBe(2);
  expect(usage.costUSD).toBe(0.4);
});

test('usageTracker supports per-image pricing and wildcard model', async () => {
  const prices = { '*': { imagePerImage: 0.5 } };
  const ctx = makeCtx({ messages: [
    { role: 'user', content: [ { type: 'image_url', image_url: 'http://x/1.png' } ] } as any,
    { role: 'user', content: [ { type: 'image_url', image_url: 'http://x/2.png' } ] } as any,
  ] });
  ctx.model = { name: 'unknown-model', capabilities: {}, async generate() { return { message: { role: 'assistant', content: '' }, usage: { promptTokens: 0, completionTokens: 0 } } as any; } } as any;
  const caller = async (c: Ctx) => { const res = await c.model.generate(c.messages, {}); c.messages.push((res as any).message); };
  await compose([usageTracker(prices), caller as any])(ctx);
  const usage: any = (ctx.state as any).usage;
  // Two images at $0.5 per image
  expect(usage.costUSD).toBe(1.0);
});

test('usageTracker counts top-level image fields even without content', async () => {
  const prices = { '*': { imagePerImage: 0.25 } };
  const ctx = makeCtx({ messages: [
    { role: 'user', image_url: 'http://x/1.png' } as any,
    { role: 'user', image: 'http://x/2.png' } as any,
    { role: 'user', images: ['http://x/3.png', 'http://x/4.png'] } as any,
  ] });
  ctx.model = { name: 'anything', capabilities: {}, async generate() { return { message: { role: 'assistant', content: '' }, usage: { promptTokens: 0, completionTokens: 0 } } as any; } } as any;
  const caller = async (c: Ctx) => { const res = await c.model.generate(c.messages, {}); c.messages.push((res as any).message); };
  await compose([usageTracker(prices), caller as any])(ctx);
  const usage: any = (ctx.state as any).usage;
  // 4 images at $0.25 each
  expect(usage.costUSD).toBe(1.0);
});
test('usageTracker can log per-call metrics when enabled', async () => {
  const prices = { dummy: { inputPer1K: 1, outputPer1K: 1 } };
  const logs: any[] = [];
  const ctx = makeCtx();
  ctx.log = { ...ctx.log, info: (...a: any[]) => { logs.push(a); } } as any;
  ctx.model = { name: 'dummy', capabilities: {}, async generate() { return { message: { role: 'assistant', content: '' }, usage: { promptTokens: 1000, completionTokens: 1000 } } as any; } } as any;
  const caller = async (c: Ctx) => { const res = await c.model.generate(c.messages, {}); c.messages.push((res as any).message); };
  await compose([usageTracker(prices, { logPerCall: true }), caller as any])(ctx);
  // Expect at least one [ '[usage] call', {...} ] entry
  const hadUsageLog = logs.some((args) => args[0] === '[usage] call');
  expect(hadUsageLog).toBe(true);
});
