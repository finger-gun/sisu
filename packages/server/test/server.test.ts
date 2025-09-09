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
