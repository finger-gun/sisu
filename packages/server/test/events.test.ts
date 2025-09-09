import { test, expect } from 'vitest';
import { Agent } from '@sisu-ai/core';
import { Server } from '../src/index.js';

function makeReqRes(method: string, url: string) {
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = {};
  process.nextTick(() => req.push(null));
  let statusCode = 0;
  let ended = false;
  const res = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  (res as any).setHeader = () => {};
  (res as any).writeHead = (code: number) => { statusCode = code; };
  (res as any).end = () => { ended = true; (res as any).emit('finish'); };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  return { req: req as any, res: res as any };
}

test('emits request and response events', async () => {
  const agent = new Agent<any>();
  const server = new Server(agent, { basePath: '/api' });
  let seenReq: any, seenRes: any;
  server.on('request', e => { seenReq = e; });
  server.on('response', e => { seenRes = e; });
  const { req, res } = makeReqRes('GET', '/api/unknown');
  await server.listener()(req, res);
  expect(seenReq).toEqual({ method: 'GET', url: '/api/unknown' });
  expect(seenRes?.method).toBe('GET');
  expect(seenRes?.url).toBe('/api/unknown');
  expect(typeof seenRes?.status).toBe('number');
  expect(typeof seenRes?.duration_ms).toBe('number');
});
