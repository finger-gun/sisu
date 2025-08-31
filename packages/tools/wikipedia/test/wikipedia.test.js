import { test, expect, vi, afterEach } from 'vitest';
import { wikipedia } from '../src/index.js';
afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WIKIPEDIA_BASE_URL;
    delete process.env.WIKI_BASE_URL;
    delete process.env.WIKIPEDIA_LANG;
    delete process.env.WIKI_LANG;
});
test('wikipedia summary maps key fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
            title: 'Dog', displaytitle: 'Dog', description: 'Domesticated canine', extract: 'Dogs are...',
            content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Dog' } },
            thumbnail: { source: 'https://img' }, type: 'standard'
        })
    });
    const out = await wikipedia.handler({ title: 'dog' }, {});
    expect(out.title).toBe('Dog');
    expect(out.description).toBe('Domesticated canine');
    expect(out.url).toMatch('/wiki/Dog');
    expect(out.thumbnailUrl).toBe('https://img');
});
test('wikipedia html returns string and sets Accept header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>ok</html>' });
    const html = await wikipedia.handler({ title: 'Dog', format: 'html' }, {});
    expect(typeof html).toBe('string');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Accept).toContain('text/html');
});
test('wikipedia related returns list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ pages: [{ title: 'Dog', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Dog' } } }] }) });
    const out = await wikipedia.handler({ title: 'Dog', format: 'related' }, {});
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].title).toBe('Dog');
});
test('wikipedia respects language env/flags', async () => {
    process.env.WIKIPEDIA_LANG = 'sv';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({}) });
    await wikipedia.handler({ title: 'Hund' }, {});
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://sv.wikipedia.org/api/rest_v1');
});
