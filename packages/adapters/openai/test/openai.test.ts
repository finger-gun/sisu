import { test, expect, vi, afterEach } from 'vitest';
import { Readable } from 'stream';
import { openAIAdapter } from '../src/index.js';
import type { Message, Tool } from '@sisu-ai/core';

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OPENAI_API_KEY;
  delete (process.env as any).OPENAI_BASE_URL;
});

test('openAIAdapter throws without API key', async () => {
  delete (process.env as any).OPENAI_API_KEY;
  expect(() => openAIAdapter({ model: 'gpt-4o-mini' })).toThrow(/Missing OPENAI_API_KEY/);
});

test('openAIAdapter streams tokens when stream option is set', async () => {
  process.env.OPENAI_API_KEY = 'stream';
  const s = Readable.from([
    'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
    'data: [DONE]\n\n',
  ]);
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, body: s } as any);
  const llm = openAIAdapter({ model: 'gpt-4o' });
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

test('openAIAdapter posts messages and returns mapped response with usage', async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }),
  } as any);

  const llm = openAIAdapter({ model: 'gpt-4o-mini', baseUrl: 'https://api.example.com' });
  const msgs: Message[] = [
    { role: 'user', content: 'hello', } as any,
  ];
  const out = await llm.generate(msgs, { temperature: 0.1 });
  expect(out.message.role).toBe('assistant');
  expect(out.message.content).toBe('ok');
  expect(out.usage?.promptTokens).toBe(10);
  expect(out.usage?.completionTokens).toBe(2);
  expect(out.usage?.totalTokens).toBe(12);

  // Verify request built correctly
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toBe('https://api.example.com/v1/chat/completions');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toContain('Bearer test-key');
  const body = JSON.parse(init.body);
  expect(body.model).toBe('gpt-4o-mini');
  expect(Array.isArray(body.messages)).toBe(true);
});

test('openAIAdapter maps tool_calls and tool_choice in request/response', async () => {
  process.env.OPENAI_API_KEY = 'x';
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url, init) => {
    const req = JSON.parse((init as any).body);
    // Tool choice should be mapped to function object when a specific tool name is provided
    expect(req.tool_choice).toEqual({ type: 'function', function: { name: 'echo' } });
    // Assistant message with tool_calls should map to OpenAI structure and content null when no content
    const assistant = req.messages.find((m: any) => m.role === 'assistant');
    expect(assistant.tool_calls?.[0]?.function?.name).toBe('echo');
    expect(assistant.content).toBeNull();
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'done', tool_calls: [ { id: '1', type: 'function', function: { name: 'echo', arguments: '{"foo":1}' } } ] } }],
      }),
    } as any;
  });

  const tool: Tool = { name: 'echo', description: 'echoes', schema: {} as any, handler: async () => null };
  const llm = openAIAdapter({ model: 'gpt-4o-mini' });
  const messages: Message[] = [
    // Assistant requesting tools (input mapping)
    { role: 'assistant', content: '', tool_calls: [{ id: '1', name: 'echo', arguments: { foo: 1 } }] } as any,
  ];
  const out = await llm.generate(messages, { tools: [tool], toolChoice: 'echo' });
  expect(out.message.content).toBe('done');
  const tc = (out.message as any).tool_calls[0];
  expect(tc.name).toBe('echo');
  expect(tc.arguments).toEqual({ foo: 1 }); // parsed from string

  expect(fetchMock).toHaveBeenCalledOnce();
});

test('openAIAdapter builds image content parts from convenience shapes', async () => {
  process.env.OPENAI_API_KEY = 'y';
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ choices: [{ message: { role: 'assistant', content: '' } }] }) } as any);
  const llm = openAIAdapter({ model: 'gpt-4o' });
  const messages: Message[] = [
    { role: 'user', content: 'see', images: ['http://img/1.png', 'http://img/2.png'] } as any,
  ];
  await llm.generate(messages);
  const [, init] = fetchMock.mock.calls[0] as any;
  const body = JSON.parse(init.body);
  const user = body.messages[0];
  expect(Array.isArray(user.content)).toBe(true);
  expect(user.content.some((p: any) => p.type === 'image_url')).toBe(true);
});

test('openAIAdapter throws on HTTP error with message', async () => {
  process.env.OPENAI_API_KEY = 'z';
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: false, status: 400, statusText: 'Bad', text: async () => JSON.stringify({ error: { message: 'bad req' } }) } as any);
  const llm = openAIAdapter({ model: 'gpt-4o' });
  await expect(llm.generate([], {})).rejects.toThrow(/OpenAI API error: 400/);
});

