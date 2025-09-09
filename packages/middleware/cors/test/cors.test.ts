import { test, expect } from 'vitest';
import { cors } from '../src/index.js';
import { Readable, Writable } from 'stream';

function makeReqRes(method: string, url = '/') {
  const req = new Readable({ read() {} });
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = {};
  process.nextTick(() => req.push(null));
  let statusCode = 0;
  let ended = false;
  const headers: Record<string, string> = {};
  const res = new Writable({ write(_chunk: any, _enc: any, cb: any) { cb(); } });
  (res as any).setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = String(v); };
  (res as any).writeHead = (code: number, hdrs?: Record<string, string>) => { statusCode = code; if (hdrs) for (const [k, v] of Object.entries(hdrs)) headers[k.toLowerCase()] = String(v); };
  (res as any).end = () => { ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  return { req: req as any, res: res as any, headers, getStatus: () => statusCode, isEnded: () => ended };
}

test('sets CORS headers on GET and calls next', async () => {
  const mw = cors();
  const { req, res, headers } = makeReqRes('GET', '/api');
  let called = false;
  await mw({ req, res } as any, async () => { called = true; });
  expect(headers['access-control-allow-origin']).toBe('*');
  expect(headers['access-control-allow-methods']).toContain('GET');
  expect(headers['access-control-allow-headers']).toContain('Content-Type');
  expect(called).toBe(true);
});

test('OPTIONS preflight returns 204 and ends', async () => {
  const mw = cors();
  const { req, res, getStatus, isEnded } = makeReqRes('OPTIONS', '/api');
  await mw({ req, res } as any, async () => {});
  expect(getStatus()).toBe(204);
  expect(isEnded()).toBe(true);
});

test('credentials and custom origin are reflected in headers', async () => {
  const mw = cors({ origin: 'http://example.com', credentials: true });
  const { req, res, headers } = makeReqRes('GET', '/api');
  await mw({ req, res } as any, async () => {});
  expect(headers['access-control-allow-origin']).toBe('http://example.com');
  expect(headers['access-control-allow-credentials']).toBe('true');
});

