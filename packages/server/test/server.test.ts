import { test, expect } from 'vitest';
import { Agent } from '@sisu-ai/core';
import { Server } from '../src/index.js';

function makeReqRes(method: string, url: string) {
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = {};
  let statusCode = 0;
  const headers: Record<string, string> = {};
  let body = '';
  let ended = false;
  const res = new Writable({ write(chunk, _enc, cb) { body += chunk.toString(); cb(); } });
  (res as any).setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = v; };
  (res as any).writeHead = (code: number, hdrs?: Record<string, string>) => { statusCode = code; if (hdrs) for (const [k, v] of Object.entries(hdrs)) headers[k.toLowerCase()] = String(v); };
  (res as any).end = (data?: any) => { if (data) body += data.toString(); ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  return { req: req as any, res: res as any, result: () => ({ statusCode, headers, body }) };
}

test('health endpoint responds', async () => {
  const agent = new Agent<any>();
  const server = new Server(agent, { healthPath: '/healthz' });
  const { req, res, result } = makeReqRes('GET', '/healthz');
  await server.listener()(req, res);
  const out = result();
  expect(out.statusCode).toBe(200);
  expect(out.body).toBe('ok');
});

test('does not 404-close when headers already sent (e.g., SSE)', async () => {
  const agent = new Agent<any>();
  const server = new Server(agent, { basePath: '/api' });
  // Create a request under basePath that no middleware handles
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = 'GET';
  (req as any).url = '/api/sse';
  process.nextTick(() => req.push(null));
  let statusCode = 0; let ended = false; let headersSent = true; // simulate SSE headers already sent
  const res = new Writable({ write(_chunk: any, _enc: any, cb: any) { cb(); } });
  (res as any).setHeader = () => {};
  (res as any).writeHead = (code: number) => { statusCode = code; headersSent = true; };
  (res as any).end = () => { ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  Object.defineProperty(res, 'headersSent', { get: () => headersSent });
  await server.listener()(req as any, res as any);
  // Since headersSent is true, server should not synthesize a 404.
  expect(statusCode).not.toBe(404);
});
