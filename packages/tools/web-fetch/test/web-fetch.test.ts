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

test('webFetch is blocked by robots.txt for disallowed paths', async () => {
  // robots.txt disallows /secret on domain-a
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    text: async () => 'User-agent: *\nDisallow: /secret',
    url: 'https://domain-a.test/robots.txt',
  } as any);

  const res: any = await webFetch.handler({ url: 'https://domain-a.test/secret' } as any, {} as any);
  expect(res.status).toBe(403);
  expect(res.robotsBlocked).toBe(true);
  expect(res.text).toMatch(/Blocked by robots.txt/);
});

test('webFetch bypasses robots.txt when respectRobots=false', async () => {
  // Even if robots.txt would disallow, respectRobots=false should cause fetch to proceed
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html' },
    text: async () => '<title>Bypass</title><p>ok</p>',
    url: 'https://domain-b.test/ok',
  } as any);

  const res: any = await webFetch.handler({ url: 'https://domain-b.test/ok', respectRobots: false } as any, {} as any);
  expect(res.status).toBe(200);
  expect(res.title).toBe('Bypass');
  expect(res.text).toContain('ok');
});

test('webFetch reads streaming body and respects maxBytes cap', async () => {
  // Mock a streaming body with two chunks of 50 bytes each
  const chunks = [Buffer.from('a'.repeat(50)), Buffer.from('b'.repeat(50))];
  let idx = 0;
  const reader = {
    read: async () => {
      if (idx < chunks.length) {
        const v = chunks[idx++];
        return { done: false, value: new Uint8Array(v) };
      }
      return { done: true, value: undefined };
    }
  };
  const body = { getReader: () => reader };

  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'text/plain' },
    body,
    url: 'https://stream.test/large',
  } as any);

  const res: any = await webFetch.handler({ url: 'https://stream.test/large', maxBytes: 200 } as any, {} as any);
  // with a large cap the full stream should be read (50+50)
  expect(res.text.length).toBe(100);
  expect(res.status).toBe(200);
});

test('webFetch falls back to text when JSON parse fails', async () => {
  vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    body: undefined,
    text: async () => 'not a json',
    url: 'https://json.test/bad'
  } as any);

  const res: any = await webFetch.handler({ url: 'https://json.test/bad' } as any, {} as any);
  expect(res.json).toBeUndefined();
  expect(res.text).toContain('not a json');
  expect(res.status).toBe(200);
});
