import { test, expect, vi, afterEach } from 'vitest';
import { openAIWebSearch } from '../src/index.js';
import type { ToolContext } from '@sisu-ai/core';

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).OPENAI_API_KEY;
  delete (process.env as any).API_KEY;
  delete (process.env as any).OPENAI_RESPONSES_BASE_URL;
  delete (process.env as any).OPENAI_BASE_URL;
  delete (process.env as any).BASE_URL;
  delete (process.env as any).OPENAI_MODEL;
  delete (process.env as any).OPENAI_RESPONSES_MODEL;
});

test('openAIWebSearch posts to /v1/responses with web_search tool and returns results', async () => {
  process.env.OPENAI_API_KEY = 'k';
  process.env.OPENAI_RESPONSES_BASE_URL = 'https://api.example.com';
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url, init) => {
    const req = JSON.parse((init as any).body);
    expect(String(url)).toBe('https://api.example.com/v1/responses');
    expect(req.tools?.[0]?.type).toBe('web_search');
    expect(req.tool_choice?.type).toBe('web_search');
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ output: [ { type: 'web_search_results', web_search_results: [{ title: 'A', url: 'http://a' }] } ] }),
    } as any;
  });

  const ctx = {
    model: { name: 'openai:gpt-4o-mini' } as any,
    log: { info: vi.fn(), debug: vi.fn() },
    signal: new AbortController().signal,
    memory: { get: vi.fn(), set: vi.fn() }
  } as unknown as ToolContext;
  const results: any = await openAIWebSearch.handler({ query: 'hello' } as any, ctx);
  expect(Array.isArray(results)).toBe(true);
  expect(results[0]?.title).toBe('A');
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('openAIWebSearch throws on non-JSON response', async () => {
  process.env.OPENAI_API_KEY = 'k';
  process.env.OPENAI_RESPONSES_BASE_URL = 'https://api.example.com';
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>' } as any);
  const ctx = {
    model: { name: 'openai:gpt-4o-mini' } as any,
    log: { info: vi.fn(), debug: vi.fn() },
    signal: new AbortController().signal,
    memory: { get: vi.fn(), set: vi.fn() }
  } as unknown as ToolContext;
  await expect(openAIWebSearch.handler({ query: 'x' } as any, ctx)).rejects.toThrow(/non-JSON content/);
});

