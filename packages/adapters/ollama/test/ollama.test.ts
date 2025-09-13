import { test, expect, vi, afterEach } from 'vitest';
import { Readable } from 'stream';
import { ollamaAdapter } from '../src/index.js';
import type { Message, Tool } from '@sisu-ai/core';

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OLLAMA_BASE_URL;
});

test('ollamaAdapter streams tokens when stream option is set', async () => {
  const s = Readable.from([
    JSON.stringify({ message: { role: 'assistant', content: 'He' } }) + '\n',
    JSON.stringify({ message: { role: 'assistant', content: 'llo' } }) + '\n',
    JSON.stringify({ done: true }) + '\n',
  ]);
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, body: s } as any);
  const llm = ollamaAdapter({ model: 'llama3' });
  const out: string[] = [];
  const iter = await llm.generate([], { stream: true }) as AsyncIterable<any>;
  for await (const ev of iter) {
    if (ev.type === 'token') out.push(ev.token);
  }
  expect(out.join('')).toBe('Hello');
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  expect(body.stream).toBe(true);
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

test('ollamaAdapter converts http image URLs to base64 images[]', async () => {
  const imgBytes = new Uint8Array([1, 2, 3, 4]);
  const imgB64 = Buffer.from(imgBytes).toString('base64'); // AQIDBA==
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: any, init: any) => {
    const u = String(url);
    if (u.includes('/api/chat')) {
      return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ message: { role: 'assistant', content: '' } }) } as any;
    }
    // image fetch
    return { ok: true, arrayBuffer: async () => imgBytes.buffer } as any;
  });
  const llm = ollamaAdapter({ model: 'llama3' });
  const messages: Message[] = [
    { role: 'user', content: 'see', images: ['http://img/1.png', 'http://img/2.png'] } as any,
  ];
  await llm.generate(messages);
  // Last call should be to /api/chat; inspect its body
  const calls = fetchMock.mock.calls as any[];
  const [, init] = calls.find(c => String(c[0]).includes('/api/chat')) as any;
  const body = JSON.parse(init.body);
  const user = body.messages[0];
  expect(typeof user.content).toBe('string');
  expect(Array.isArray(user.images)).toBe(true);
  expect(user.images).toEqual([imgB64, imgB64]);
});
