import { test, expect, vi, afterEach } from 'vitest';
import { wikipedia } from '../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).WIKIPEDIA_BASE_URL;
  delete (process.env as any).WIKI_BASE_URL;
  delete (process.env as any).WIKIPEDIA_LANG;
  delete (process.env as any).WIKI_LANG;
});

test('wikipedia summary maps key fields', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({
      title: 'Dog', displaytitle: 'Dog', description: 'Domesticated canine', extract: 'Dogs are...',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Dog' } },
      thumbnail: { source: 'https://img' }, type: 'standard'
    })
  } as any);

  const out: any = await wikipedia.handler({ title: 'dog' } as any, {} as any);
  expect(out.title).toBe('Dog');
  expect(out.description).toBe('Domesticated canine');
  expect(out.url).toMatch('/wiki/Dog');
  expect(out.thumbnailUrl).toBe('https://img');
});

test('wikipedia html returns string and sets Accept header', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>ok</html>' } as any);
  const html = await wikipedia.handler({ title: 'Dog', format: 'html' } as any, {} as any);
  expect(typeof html).toBe('string');
  const [, init] = fetchMock.mock.calls[0] as any;
  expect(init.headers.Accept).toContain('text/html');
});

test('wikipedia related returns list', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ pages: [ { title: 'Dog', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Dog' } } } ] }) } as any);
  const out: any[] = await wikipedia.handler({ title: 'Dog', format: 'related' } as any, {} as any) as any[];
  expect(Array.isArray(out)).toBe(true);
  expect(out[0].title).toBe('Dog');
});

test('wikipedia respects language env/flags', async () => {
  process.env.WIKIPEDIA_LANG = 'sv';
  const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({}) } as any);
  await wikipedia.handler({ title: 'Hund' } as any, {} as any);
  const [url] = fetchMock.mock.calls[0] as any;
  expect(String(url)).toContain('https://sv.wikipedia.org/api/rest_v1');
});

