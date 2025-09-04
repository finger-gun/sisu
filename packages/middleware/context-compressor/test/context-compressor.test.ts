import { test, expect } from 'vitest';
import type { Ctx, Message, LLM, GenerateOptions, ModelEvent, ModelResponse } from '@sisu-ai/core';
import { InMemoryKV, NullStream, SimpleTools, compose } from '@sisu-ai/core';
import { contextCompressor } from '../src/index.js';

// Helper middleware to invoke the model once
const invokeModel = async (ctx: Ctx) => {
  const out: any = await ctx.model.generate(ctx.messages, {} as any);
  ctx.messages.push(out.message as Message);
};

function makeCtx(partial: Partial<Ctx> = {}): Ctx {
  const ac = new AbortController();
  const model = makeDummyModel();
  const base: Ctx = {
    input: '',
    messages: [],
    model,
    tools: new SimpleTools(),
    memory: new InMemoryKV(),
    stream: new NullStream(),
    state: {},
    signal: ac.signal,
    log: { debug() {}, info() {}, warn() {}, error() {}, span() {} },
  };
  return Object.assign(base, partial);
}

// Create a dummy model whose generate satisfies both overloads.
function makeDummyModel(
  impl?: (messages: Message[], opts?: GenerateOptions) => Promise<ModelResponse>
): LLM {
  async function* stream(): AsyncIterable<ModelEvent> {
    yield { type: 'token', token: 'ok' };
    yield { type: 'assistant_message', message: { role: 'assistant', content: 'ok' } } as ModelEvent;
  }
  const gen = ((messages: Message[], opts?: GenerateOptions) => {
    if (opts?.stream) {
      return stream();
    }
    return impl
      ? impl(messages, opts)
      : Promise.resolve({ message: { role: 'assistant', content: '' } });
  }) as LLM['generate'];
  return { name: 'dummy', capabilities: {}, generate: gen };
}

test('compresses head into summary when over maxChars', async () => {
  // Build a conversation large enough to trigger compression
  const headChunks: Message[] = [{ role: 'system', content: 'sys' }];
  for (let i = 0; i < 6; i++) headChunks.push({ role: i % 2 ? 'assistant' : 'user', content: ('X'.repeat(60)) } as any);
  const tail: Message[] = [
    { role: 'user', content: 'most recent q1' },
    { role: 'assistant', content: 'most recent a1' },
  ];
  const all = [...headChunks, ...tail];

  let finalCallMessages: Message[] = [];
  const ctx = makeCtx({
    messages: all,
    model: makeDummyModel(async (messages) => {
      // If this is the compression prompt, return a short summary
      if ((messages[0]).role === 'system' && String((messages[0] as any).content).includes('compression assistant')) {
        return { message: { role: 'assistant', content: 'facts: A; B; C.\nCitations: https://ex' } } as any;
      }
      finalCallMessages = messages.slice();
      return { message: { role: 'assistant', content: 'ok' } };
    }),
  });

  await compose([contextCompressor({ maxChars: 200, keepRecent: 2, summaryMaxChars: 80 }), invokeModel as any])(ctx);
  // We expect: [system], [summary assistant], ...tail (2 msgs)
  expect(finalCallMessages.length).toBeGreaterThanOrEqual(1 + 1 + tail.length);
  expect(finalCallMessages[0].role).toBe('system');
  expect(finalCallMessages[1].role).toBe('assistant');
  expect(String(finalCallMessages[1].content)).toContain('[Summary of earlier turns]');
  // Ensure tail preserved
  const lastTwo = finalCallMessages.slice(-2).map(m => (m).content);
  expect(lastTwo).toEqual(['most recent q1', 'most recent a1']);
});

test('clamps recent tool outputs and truncates long texts', async () => {
  const bigToolPayload = JSON.stringify({ html: '<div>HUGE</div>', text: 'T'.repeat(10_000), small: 'ok' });
  const msgs: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'a' },
    { role: 'tool', content: bigToolPayload, tool_call_id: 'dummy-id' },
  ];

  let seenToolContent = '';
  const ctx = makeCtx({
    messages: msgs,
    model: makeDummyModel(async (messages) => {
      const last = messages[messages.length - 1];
      if (last.role === 'tool') {
        seenToolContent = String(last.content);
      }
      return { message: { role: 'assistant', content: 'done' } };
    }),
  });

  await compose([contextCompressor({ maxChars: 10_000, keepRecent: 4, recentClampChars: 256 }), invokeModel as any])(ctx);
  // Should be valid JSON without html field and text truncated
  const parsed = JSON.parse(seenToolContent);
  expect(parsed.html).toBeUndefined();
  expect(typeof parsed.text).toBe('string');
  expect(parsed.text.length).toBeLessThanOrEqual(256);
  expect(parsed.small).toBe('ok');
});

test('does not split assistant+tool group when cutting head', async () => {
  // Arrange messages so that cut falls before a tool group
  const older: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'old1 ' + 'x'.repeat(200) },
    { role: 'assistant', content: 'old2 ' + 'y'.repeat(200) },
  ];
  const withTools: any[] = [
    { role: 'assistant', content: 'calling tools', tool_calls: [{ id: '1', name: 'dummy', arguments: {} }] },
    { role: 'tool', content: '{"ok":true}', tool_call_id: '1' },
  ];
  const tail: Message[] = [ { role: 'user', content: 'final q' } ];
  const all = [...older, ...withTools, ...tail];

  let callMessages: Message[] = [];
  const ctx = makeCtx({
    messages: all,
    model: makeDummyModel(async (messages) => {
      // Return summary for compression prompt
      if ((messages[0]).role === 'system' && String((messages[0]).content).includes('compression assistant')) {
        return { message: { role: 'assistant', content: 'summary here' } };
      }
      callMessages = messages.slice();
      return { message: { role: 'assistant', content: 'ok' } };
    }),
  });

  await compose([contextCompressor({ maxChars: 200, keepRecent: 2, summaryMaxChars: 200 }), invokeModel])(ctx);

  // Should contain summary at index 1
  expect(callMessages[1].role).toBe('assistant');
  expect(String(callMessages[1].content)).toContain('[Summary of earlier turns]');
  // Verify that an assistant with tool_calls appears after summary (in the tail segment)
  const assistantWithToolsIdx = callMessages.findIndex((m) => m.role === 'assistant' && Array.isArray(m.tool_calls));
  expect(assistantWithToolsIdx).toBeGreaterThan(1);
  // And the tool message follows somewhere after
  expect(callMessages.some((m) => m.role === 'tool')).toBe(true);
});
