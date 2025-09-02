import { test, expect } from 'vitest';
import type { Ctx, Message } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { contextCompressor } from '../src/index.js';

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

test('contextCompressor summarizes head when context exceeds limit', async () => {
  const messages: Message[] = [{ role: 'system', content: 'sys' } as any];
  for (let i = 0; i < 5; i++) messages.push({ role: i % 2 ? 'assistant' : 'user', content: 'msg' + i + ' '.repeat(80) } as any);
  // Preserve the original tail for later comparison since `messages` will mutate
  const origTail = messages.slice(-2).map(m => (m as any).content);
  const calls: Message[][] = [];
  const model = {
    name: 'dummy', capabilities: {},
    async generate(ms: Message[]) {
      calls.push(ms);
      const isSummary = ms[0]?.role === 'system' && String(ms[0].content).includes('compression assistant');
      if (isSummary) {
        return { message: { role: 'assistant', content: 'summary here' } } as any;
      }
      return { message: { role: 'assistant', content: 'final' } } as any;
    }
  };
  const ctx = makeCtx({ messages, model } as any);
  const caller = async (c: Ctx) => { const r = await c.model.generate(c.messages, {}); c.messages.push((r as any).message); };
  await compose([contextCompressor({ maxChars: 200, keepRecent: 2, summaryMaxChars: 50 }), caller as any])(ctx);
  expect(calls.length).toBe(2); // summary + final
  const finalMsgs = calls[1];
  expect(finalMsgs[1].content).toMatch(/\[Summary of earlier turns\]/);
  expect(finalMsgs.length).toBe(1 + 1 + 2);
  const tail = finalMsgs.slice(2).map(m => (m as any).content);
  expect(tail).toEqual(origTail);
});

test('contextCompressor clamps recent tool outputs and long messages', async () => {
  const limit = 50;
  const toolObj = { html: '<p>heavy</p>', text: 'x'.repeat(200), nested: { inner: 'y'.repeat(200) } };
  const messages: Message[] = [
    { role: 'system', content: 'sys' } as any,
    { role: 'tool', content: JSON.stringify(toolObj), tool_call_id: '1' } as any,
    { role: 'assistant', content: 'a'.repeat(limit * 4) } as any,
  ];
  const received: Message[][] = [];
  const model = { name: 'dummy', capabilities: {}, async generate(ms: Message[]) { received.push(ms); return { message: { role: 'assistant', content: 'ok' } } as any; } };
  const ctx = makeCtx({ messages, model } as any);
  const caller = async (c: Ctx) => { const r = await c.model.generate(c.messages, {}); c.messages.push((r as any).message); };
  await compose([contextCompressor({ maxChars: 10_000, recentClampChars: limit, keepRecent: 1 }), caller as any])(ctx);
  const finalMsgs = received[0];
  const tool = finalMsgs[1] as any;
  const parsed = JSON.parse(tool.content);
  expect(parsed.html).toBeUndefined();
  expect(parsed.text.length).toBeLessThanOrEqual(limit);
  expect(parsed.nested.inner.length).toBeLessThanOrEqual(limit);
  const last = finalMsgs[2] as any;
  expect(last.content.length).toBeLessThanOrEqual(limit * 2);
});

test('contextCompressor preserves assistant/tool pair when tail starts with tool', async () => {
  const messages: Message[] = [
    { role: 'system', content: 'sys' } as any,
    { role: 'assistant', content: 'calling', tool_calls: [{ id: '1', function: { name: 't' } }] } as any,
    { role: 'tool', content: '{}', tool_call_id: '1' } as any,
    // Pad the user message so the total context exceeds the compression threshold
    { role: 'user', content: 'hi' + ' '.repeat(100) } as any,
    { role: 'assistant', content: 'end' } as any,
  ];
  const calls: Message[][] = [];
  const model = { name: 'dummy', capabilities: {}, async generate(ms: Message[]) { calls.push(ms); return { message: { role: 'assistant', content: 'ok' } } as any; } };
  const ctx = makeCtx({ messages, model } as any);
  const caller = async (c: Ctx) => { const r = await c.model.generate(c.messages, {}); c.messages.push((r as any).message); };
  await compose([contextCompressor({ maxChars: 50, keepRecent: 3 }), caller as any])(ctx);
  expect(calls.length).toBe(2);
  const finalMsgs = calls[1];
  expect((finalMsgs[2] as any).role).toBe('assistant');
  expect((finalMsgs[2] as any).tool_calls?.length).toBe(1);
});
