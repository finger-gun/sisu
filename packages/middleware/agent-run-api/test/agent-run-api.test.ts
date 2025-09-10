import { test, expect } from 'vitest';
import { Agent } from '@sisu-ai/core';
import { agentRunApi, type HttpCtx } from '../src/index.js';
import { Server } from '../../../server/src/index.js';

function makeReqRes(method: string, url: string, body?: unknown) {
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = { 'content-type': 'application/json' };
  if (body !== undefined) {
    const s = typeof body === 'string' ? body : JSON.stringify(body);
    // push body after next tick so handler can start awaiting
    process.nextTick(() => { req.push(Buffer.from(s)); req.push(null); });
  } else {
    process.nextTick(() => req.push(null));
  }
  let statusCode = 0;
  const headers: Record<string, string> = {};
  let buf = '';
  let ended = false;
  const res = new Writable({ write(chunk, _enc, cb) { buf += chunk.toString(); cb(); } });
  (res as any).setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = v; };
  (res as any).writeHead = (code: number, hdrs?: Record<string, string>) => { statusCode = code; if (hdrs) for (const [k, v] of Object.entries(hdrs)) headers[k.toLowerCase()] = String(v); };
  (res as any).end = (data?: any) => { if (data) buf += data.toString(); ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  return { req: req as any, res: res as any, read: () => ({ status: statusCode || 200, text: buf, json: () => JSON.parse(buf) }) };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('run lifecycle returns status and result', async () => {
  const app = new Agent<HttpCtx>()
    .use(agentRunApi())
    .use(async c => {
      if (c.signal.aborted) return;
      await sleep(10);
      if (typeof c.input === 'string') {
        c.messages = [{ role: 'assistant', content: 'ok' }];
      }
    });
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app }) });
  const a = makeReqRes('POST', '/api/runs/start', { input: 'hi' });
  await server.listener()(a.req, a.res);
  const start = a.read();
  expect(start.status).toBe(202);
  const startBody = start.json();
  expect(startBody.runId).not.toBe('stub');
  const runId = startBody.runId as string;
  let result: any;
  for (let i = 0; i < 50; i++) {
    await sleep(10);
    const bReq = makeReqRes('GET', `/api/runs/${runId}/status`);
    await server.listener()(bReq.req, bReq.res);
    const b = bReq.read().json();
    if (b.status === 'succeeded') {
      result = b.result;
      break;
    }
  }
  expect(result).toBe('ok');
  // no real server was started
});

test('run can be cancelled', async () => {
  const app = new Agent<HttpCtx>()
    .use(agentRunApi())
    .use(async c => {
      await sleep(100);
      if (c.signal.aborted) return;
      c.messages = [{ role: 'assistant', content: 'done' }];
    });
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app }) });
  const sReq = makeReqRes('POST', '/api/runs/start', { input: 'hi' });
  await server.listener()(sReq.req, sReq.res);
  const { runId } = sReq.read().json();
  const cReq = makeReqRes('POST', `/api/runs/${runId}/cancel`);
  await server.listener()(cReq.req, cReq.res);
  let status: string | undefined;
  for (let i = 0; i < 50; i++) {
    await sleep(10);
    const rReq = makeReqRes('GET', `/api/runs/${runId}/status`);
    await server.listener()(rReq.req, rReq.res);
    const b = rReq.read().json();
    if (b.status === 'cancelled') {
      status = b.status;
      break;
    }
  }
  expect(status).toBe('cancelled');
  // no real server was started
});

test('cancel returns 409 when run already completed', async () => {
  const app = new Agent<HttpCtx>()
    .use(agentRunApi())
    .use(async c => { c.messages = [{ role: 'assistant', content: 'done' }]; });
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app }) });
  // Start and wait for success
  const start = makeReqRes('POST', '/api/runs/start', { input: 'hi' });
  await server.listener()(start.req, start.res);
  const { runId } = start.read().json();
  // poll until succeeded
  let ok = false;
  for (let i = 0; i < 50; i++) {
    await sleep(10);
    const r = makeReqRes('GET', `/api/runs/${runId}/status`);
    await server.listener()(r.req, r.res);
    const b = r.read().json();
    if (b.status === 'succeeded') { ok = true; break; }
  }
  expect(ok).toBe(true);
  // Attempt cancel on completed run
  const cancel = makeReqRes('POST', `/api/runs/${runId}/cancel`);
  await server.listener()(cancel.req, cancel.res);
  const out = cancel.read();
  expect(out.status).toBe(409);
  expect(JSON.parse(out.text).error).toBe('run_not_cancellable');
});

test('custom route transform and pipeline tag', async () => {
  const app = new Agent<HttpCtx>()
    .use(agentRunApi({
      routes: [{
        path: '/runs/support-ticket',
        pipeline: 'support',
        transform: async (_req, body: any) => ({ input: `${body.subject}: ${body.message}` }),
      }],
    }))
    .use(async c => {
      // assert pipeline hint gets through
      const p = (c as any).state?.agentRun?.pipeline;
      if (p === 'support' && typeof c.input === 'string' && c.input.includes(':')) {
        c.messages = [{ role: 'assistant', content: 'ok-support' }];
      }
    });
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app, state: {} as any }) });
  const s = makeReqRes('POST', '/api/runs/support-ticket', { subject: 'S', message: 'M' });
  await server.listener()(s.req, s.res);
  const start = s.read();
  expect(start.status).toBe(202);
  const { runId } = start.json();
  let result: any;
  for (let i = 0; i < 50; i++) {
    await sleep(10);
    const rReq = makeReqRes('GET', `/api/runs/${runId}/status`);
    await server.listener()(rReq.req, rReq.res);
    const b = rReq.read().json();
    if (b.status === 'succeeded') { result = b.result; break; }
  }
  expect(result).toBe('ok-support');
  // no real server was started
});

test('invalid JSON returns 400', async () => {
  const app = new Agent<HttpCtx>().use(agentRunApi());
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app }) });
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = 'POST';
  (req as any).url = '/api/runs/start';
  (req as any).headers = { 'content-type': 'application/json' };
  process.nextTick(() => { req.push(Buffer.from('{"input":"hi"')); req.push(null); }); // missing closing brace
  let statusCode = 0; let body = ''; let ended = false;
  const res = new Writable({ write(chunk: any, _enc: any, cb: any) { body += chunk.toString(); cb(); } });
  (res as any).setHeader = () => {};
  (res as any).writeHead = (code: number) => { statusCode = code; };
  (res as any).end = (data?: any) => { if (data) body += data.toString(); ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  await server.listener()(req as any, res as any);
  expect(statusCode).toBe(400);
  const parsed = JSON.parse(body);
  expect(parsed.error).toBe('invalid_json');
});

test('missing input returns 422', async () => {
  const app = new Agent<HttpCtx>().use(agentRunApi());
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app }) });
  const s = makeReqRes('POST', '/api/runs/start', {});
  await server.listener()(s.req, s.res);
  const out = s.read();
  expect(out.status).toBe(422);
  expect(JSON.parse(out.text).error).toBe('missing_input');
});

test('SSE emits token events and final', async () => {
  // Fake streaming model that emits two tokens and a final
  const fakeModel: any = {
    name: 'fake', capabilities: { streaming: true },
    generate: (_m: any, opts?: any) => (opts?.stream ? (async function* () {
      yield { type: 'token', token: 'Hello' };
      yield { type: 'token', token: ' world' };
      yield { type: 'assistant_message', message: { role: 'assistant', content: 'Hello world' } };
    })() : { message: { role: 'assistant', content: 'Hello world' } })
  };
  const app = new Agent<HttpCtx>()
    .use(agentRunApi())
    .use(async c => {
      const it: any = (c as any).model.generate(c.messages, { stream: true, signal: c.signal });
      for await (const ev of it) {
        if (ev?.type === 'assistant_message') c.messages = [ev.message];
      }
    });
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app, model: fakeModel }) });
  // Start run
  const sReq = makeReqRes('POST', '/api/runs/start', { input: 'hi' });
  await server.listener()(sReq.req, sReq.res);
  const { runId } = sReq.read().json();
  // Connect SSE
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = 'GET';
  (req as any).url = `/api/runs/${runId}/stream`;
  process.nextTick(() => req.push(null));
  let buf = ''; let ended = false; let statusCode = 0;
  const res = new Writable({ write(chunk: any, _enc: any, cb: any) { buf += chunk.toString(); cb(); } });
  (res as any).setHeader = () => {};
  (res as any).writeHead = (code: number) => { statusCode = code; };
  (res as any).end = () => { ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  await server.listener()(req as any, res as any);
  // Wait a tick for stream to finish
  await sleep(10);
  expect(buf).toContain('event: token');
  expect(buf).toContain('event: final');
});

test('SSE late subscriber receives final immediately', async () => {
  const app = new Agent<HttpCtx>()
    .use(agentRunApi())
    .use(async c => { c.messages = [{ role: 'assistant', content: 'done' }]; });
  const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal, agent: app }) });
  const start = makeReqRes('POST', '/api/runs/start', { input: 'fast' });
  await server.listener()(start.req, start.res);
  const { runId } = start.read().json();
  // After completion, connect to stream
  await sleep(10);
  const { Readable, Writable } = require('stream');
  const req = new Readable({ read() {} });
  (req as any).method = 'GET';
  (req as any).url = `/api/runs/${runId}/stream`;
  process.nextTick(() => req.push(null));
  let buf = ''; let ended = false; let statusCode = 0;
  const res = new Writable({ write(chunk: any, _enc: any, cb: any) { buf += chunk.toString(); cb(); } });
  (res as any).setHeader = () => {};
  (res as any).writeHead = (code: number) => { statusCode = code; };
  (res as any).end = () => { ended = true; };
  Object.defineProperty(res, 'statusCode', { get: () => statusCode, set: (v) => { statusCode = v; } });
  Object.defineProperty(res, 'writableEnded', { get: () => ended });
  await server.listener()(req as any, res as any);
  expect(buf).toContain('event: final');
});
