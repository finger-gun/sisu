import { test } from 'vitest';
import assert from 'node:assert';
import type { Ctx, Tool } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { toolCalling } from '../src/index.js';

function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  const ac = new AbortController();
  const base: Ctx = {
    input: '',
    messages: [],
    model: { name: 'dummy', capabilities: { functionCall: true }, async generate() { return { message: { role: 'assistant', content: '' } }; } },
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
  return Object.assign(base, partial);
}

test('tool-calling executes tools then appends final assistant message', async () => {
  const echo: Tool<{ text: string }> = { name: 'echo', schema: { parse: (x: any) => x }, async handler({ text }) { return { echoed: text }; } } as any;

  let callCount = 0;
  const ctx = makeCtx({
    tools: (() => { const r = new SimpleTools(); r.register(echo); return r; })(),
    model: {
      name: 'dummy',
      capabilities: { functionCall: true },
      async generate(messages: any[], opts: any) {
        callCount++;
        // First pass: request tool
        if (opts.toolChoice !== 'none') {
          return { message: { role: 'assistant', content: 'Using a tool', tool_calls: [{ id: '1', name: 'echo', arguments: { text: 'hi' } }] } } as any;
        }
        // Second pass: respond normally
        const last = messages[messages.length - 1];
        if (last?.role === 'tool') {
          return { message: { role: 'assistant', content: 'done' } } as any;
        }
        return { message: { role: 'assistant', content: 'unexpected' } } as any;
      },
    },
  });

  await compose([toolCalling])(ctx);
  const last = ctx.messages[ctx.messages.length - 1];
  assert.strictEqual(last.role, 'assistant');
  assert.strictEqual(last.content, 'done');
  // Expect sequence: assistant(tool_calls), tool result, assistant(final)
  assert.ok(ctx.messages.some((m: any) => m.role === 'tool' && /echoed/.test(String(m.content))));
  assert.ok(callCount >= 2);
});

test('tool-calling caches duplicate calls for identical name+args', async () => {
  let handlerCalls = 0;
  const echo: Tool<{ text: string }> = { name: 'echo', schema: { parse: (x: any) => x }, async handler({ text }) { handlerCalls++; return { echoed: text }; } } as any;

  const tools = new SimpleTools();
  tools.register(echo);

  const ctx = makeCtx({ tools, model: {
    name: 'dummy', capabilities: { functionCall: true },
    async generate(_messages: any[], opts: any) {
      if (opts.toolChoice !== 'none') {
        // Two identical calls with same args; second should reuse cached result
        return { message: { role: 'assistant', content: '', tool_calls: [
          { id: '1', name: 'echo', arguments: { text: 'hi' } },
          { id: '2', name: 'echo', arguments: { text: 'hi' } },
        ] } } as any;
      }
      return { message: { role: 'assistant', content: 'ok' } } as any;
    },
  } as any });

  await compose([toolCalling])(ctx);
  // Handler called once due to caching identical (name,args)
  assert.strictEqual(handlerCalls, 1);
  // But two tool messages appended (one per tool_call id)
  const toolMsgs = ctx.messages.filter((m: any) => m.role === 'tool');
  assert.strictEqual(toolMsgs.length, 2);
});

test('tool-calling appends assistant when no tool_calls present', async () => {
  const ctx = makeCtx({ model: {
    name: 'dummy', capabilities: { functionCall: true },
    async generate(_messages: any[], _opts: any) {
      return { message: { role: 'assistant', content: 'plain' } } as any;
    },
  } as any });
  await compose([toolCalling])(ctx);
  const last = ctx.messages.at(-1) as any;
  assert.strictEqual(last?.content, 'plain');
});
