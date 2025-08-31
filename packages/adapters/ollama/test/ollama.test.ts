import { test, expect, vi, afterEach } from 'vitest';
import { ollamaAdapter } from '../src/index.js';
import type { Message, Tool } from '@sisu-ai/core';

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OLLAMA_BASE_URL;
});

test('ollamaAdapter posts to /api/chat with mapped messages', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      message: { role: 'assistant', content: 'ok' },
      done: true,
    }),
  } as any);

  const llm = ollamaAdapter({ model: 'llama3', baseUrl: 'http://localhost:11434' });
  const msgs: Message[] = [
    { role: 'user', content: 'hi' } as any,
    { role: 'assistant', content: '', tool_calls: [{ id: '1', name: 'echo', arguments: { a: 1 } }] } as any,
    { role: 'tool', content: 'result', tool_call_id: '1' } as any,
  ];
  const out = await llm.generate(msgs);
  expect(out.message.role).toBe('assistant');
  expect(out.message.content).toBe('ok');

  const [url, init] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toBe('http://localhost:11434/api/chat');
  const body = JSON.parse(init.body);
  expect(body.model).toBe('llama3');
  // Assistant tool_calls mapping
  const assistant = body.messages.find((m: any) => m.role === 'assistant');
  expect(assistant.tool_calls?.[0]?.function?.name).toBe('echo');
  // Tool message mapping
  const tool = body.messages.find((m: any) => m.role === 'tool');
  expect(tool.tool_call_id).toBe('1');
});

test('ollamaAdapter maps tool_calls from response to core shape', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [ { id: 't1', type: 'function', function: { name: 'sum', arguments: '{"x":1}' } } ],
      }
    })
  } as any);
  const llm = ollamaAdapter({ model: 'llama3' });
  const out = await llm.generate([]);
  const tcs = (out.message as any).tool_calls;
  expect(tcs[0].name).toBe('sum');
  expect(tcs[0].arguments).toEqual({ x: 1 });
});

test('ollamaAdapter sends tools schema when provided', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ message: { role: 'assistant', content: '' } }) } as any);
  const tool: Tool = { name: 'echo', description: 'e', schema: {} as any, handler: async () => null };
  const llm = ollamaAdapter({ model: 'llama3' });
  await llm.generate([], { tools: [tool] });
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  expect(Array.isArray(body.tools)).toBe(true);
  expect(body.tools[0].function.name).toBe('echo');
});

