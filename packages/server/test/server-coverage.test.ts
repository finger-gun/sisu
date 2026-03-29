import { Agent } from '@sisu-ai/core';
import type { Ctx } from '@sisu-ai/core';
import { describe, expect, test } from 'vitest';
import { Server } from '../src/index.js';

function makeReqRes(method: string, url: string, headersSent = false) {
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  req.method = method;
  req.url = url;
  req.headers = { 'user-agent': 'vitest' };
  req.socket = { remoteAddress: '127.0.0.1' };

  let statusCode = 0;
  let ended = false;
  const chunks: string[] = [];
  const res = new Writable({ write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) { chunks.push(chunk.toString()); cb(); } });
  (res as any).setHeader = () => {};
  (res as any).writeHead = (code: number) => { statusCode = code; };
  (res as any).end = (data?: string) => { if (data) chunks.push(data); ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  Object.defineProperty(res, 'headersSent', { get: () => headersSent });

  return { req: req as any, res: res as any, result: () => ({ statusCode, ended, body: chunks.join('') }) };
}

describe('server coverage', () => {
  test('basePath mismatch returns 404', async () => {
    const server = new Server(new Agent<any>(), { basePath: '/api' });
    const { req, res, result } = makeReqRes('GET', '/other');
    await server.listener()(req, res);
    expect(result().statusCode).toBe(404);
  });

  test('injects logger + http metadata into ctx', async () => {
    let captured: Ctx | undefined;
    const agent = new Agent<any>().use(async (ctx, next) => {
      captured = ctx;
      await next();
    });

    const server = new Server(agent, {
      basePath: '/api',
      createCtx: () => ({ state: {} } as any),
      logBanner: false,
    });

    const { req, res } = makeReqRes('POST', '/api/run');
    await server.listener()(req, res);

    expect(captured?.log).toBeDefined();
    expect((captured?.state as Record<string, unknown>)._transport).toEqual({ type: 'http' });
    expect((captured?.state as Record<string, any>)._http?.method).toBe('POST');
  });

  test('when headers are already sent, server does not synthesize 404', async () => {
    const server = new Server(new Agent<any>(), { basePath: '/api' });
    const { req, res, result } = makeReqRes('GET', '/api/sse', true);
    await server.listener()(req, res);
    expect(result().statusCode).not.toBe(404);
  });

  test('listen emits lifecycle events and supports off/once', async () => {
    const server = new Server(new Agent<any>(), { logBanner: true });

    let listeningCount = 0;
    let requestCount = 0;
    const requestHandler = () => {
      requestCount += 1;
    };

    server.once('listening', () => {
      listeningCount += 1;
    });
    server.on('request', requestHandler);

    const httpServer = server.listen();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.address()).toBeDefined();

    const address = server.address();
    if (address && typeof address === 'object' && 'port' in address) {
      const { req, res } = makeReqRes('GET', '/health');
      await server.listener()(req, res);
    }

    server.off('request', requestHandler);
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(httpServer).toBeDefined();
    expect(listeningCount).toBe(1);
    expect(requestCount).toBeGreaterThan(0);
  });
});
