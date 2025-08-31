import { test, expect, vi, afterEach } from 'vitest';
import { duckDuckGoWebSearch, type DuckDuckGoResultItem } from '../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

test('duckDuckGoWebSearch flattens groups, maps fields, deduplicates, and limits', async () => {
  const json = {
    Heading: 'Dog',
    RelatedTopics: [
      { FirstURL: 'https://duckduckgo.com/Dog', Text: 'Dog A domesticated descendant of the gray wolf.', Icon: { URL: '/i/16101b42.jpg' } },
      { Name: 'Animals', Topics: [
        { FirstURL: 'https://duckduckgo.com/Dhole', Text: 'Indian wild dog', Icon: { URL: '/i/5942505d.jpg' }},
        { FirstURL: 'https://duckduckgo.com/Dog', Text: 'Dog duplicate should be deduped', Icon: { URL: '/i/16101b42.jpg' }},
      ] },
    ],
  };
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => json,
  } as any);

  const out = await duckDuckGoWebSearch.handler({ query: 'dogs' } as any, {} as any) as DuckDuckGoResultItem[];
  expect(Array.isArray(out)).toBe(true);
  // Should include two unique URLs
  expect(out.length).toBe(2);
  expect(out[0].url).toBe('https://duckduckgo.com/Dog');
  expect(out[0].iconUrl).toMatch('https://duckduckgo.com/');
  expect(out[1].url).toBe('https://duckduckgo.com/Dhole');
});

test('duckDuckGoWebSearch throws on HTTP error', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: false, status: 500, statusText: 'Bad', json: async () => ({}) } as any);
  await expect(duckDuckGoWebSearch.handler({ query: 'x' } as any, {} as any)).rejects.toThrow(/DuckDuckGo search failed: 500/);
});

