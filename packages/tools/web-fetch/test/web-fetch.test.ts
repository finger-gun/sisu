import { test, expect, vi, afterEach } from 'vitest';
import { webFetch } from '../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.env as any).WEB_FETCH_USER_AGENT;
  delete (process.env as any).HTTP_USER_AGENT;
  delete (process.env as any).WEB_FETCH_MAX_BYTES;
});

test('webFetch extracts title and text from HTML by default', async () => {
  const html = `<!doctype html><html><head><title>Hello &amp; World</title><style>.x{}</style></head><body><h1>Hi</h1><script>var a=1;</script><p>Para</p></body></html>`;
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    body: undefined,
    text: async () => html,
    url: 'https://example.com/x'
  } as any);
  const res: any = await webFetch.handler({ url: 'https://example.com/x' } as any, {} as any);
  expect(res.title).toBe('Hello & World');
  expect(res.text).toContain('Hi');
  expect(res.html).toBeUndefined();
  expect(res.status).toBe(200);
});

test('webFetch returns HTML when format=html', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<title>T</title>', url: 'u' } as any);
  const res: any = await webFetch.handler({ url: 'http://a', format: 'html' } as any, {} as any);
  expect(res.html).toContain('<title>');
  expect(res.title).toBe('T');
});

test('webFetch returns JSON when server responds JSON', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ a: 1 }), url: 'u' } as any);
  const res: any = await webFetch.handler({ url: 'http://a' } as any, {} as any);
  expect(res.json).toEqual({ a: 1 });
});

test('webFetch caps size and returns status/text on non-ok', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', headers: { get: () => 'text/html' }, text: async () => '<h1>Not Found</h1>' } as any);
  const res: any = await webFetch.handler({ url: 'http://a' } as any, {} as any);
  expect(res.status).toBe(404);
  expect(res.text).toMatch(/Not Found/);
});

test('htmlToText strips scripts/styles with sloppy closing tags and comments', async () => {
  const html = `<!doctype html><html><head>
  <script type="text/javascript">alert(1)</script foo="bar">
  <style>.x{color:red}</style  >
  <!-- comment -->Text<!-- another --!> after
  <title>X</title></head><body><h1>Hello</h1></body></html>`;
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    body: undefined,
    text: async () => html,
    url: 'https://example.com/x'
  } as any);
  const res: any = await webFetch.handler({ url: 'https://example.com/x' } as any, {} as any);
  expect(res.text).not.toMatch(/alert\(1\)/);
  expect(res.text).toContain('Hello');
});
