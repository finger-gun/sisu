import { test, expect, vi, afterEach } from 'vitest';
import { googleSearch } from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

test('googleSearch maps CSE JSON items', async () => {
  (process.env as any).GOOGLE_API_KEY = 'test';
  (process.env as any).GOOGLE_CSE_CX = 'cx';
  const json = {
    items: [
      { title: 'Result A', link: 'https://example.com/a', snippet: 'A snip' },
      { title: 'Result B', link: 'https://example.com/b', snippet: 'B snip' }
    ]
  };
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(json) } as any);
  const res = await googleSearch.handler({ query: 'x', num: 2, start: 1 } as any, {} as any) as any[];
  expect(res.length).toBe(2);
  expect(res[0].url).toBe('https://example.com/a');
});
