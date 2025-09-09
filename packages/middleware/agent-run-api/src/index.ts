import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { InMemoryKV, type Agent, type Middleware, type Memory } from '@sisu-ai/core';
import { matchRoute } from '@sisu-ai/server';
import type { IncomingMessage, ServerResponse } from 'http';

type StartRoute = {
  path: string; // e.g. '/runs/support-ticket'
  pipeline?: string;
  transform?: (req: IncomingMessage, body: unknown) => Promise<{ input: unknown; options?: Record<string, unknown> }> | { input: unknown; options?: Record<string, unknown> };
};

export interface AgentRunApiOptions {
  basePath?: string;
  apiKey?: string;
  maxBodyBytes?: number;
  runStore?: Memory;
  routes?: Array<StartRoute>;
}

export interface HttpCtx {
  req: IncomingMessage;
  res: ServerResponse;
  agent: Agent<any>;
  input?: unknown;
  messages?: Array<{ role: string; content: string }>;
  state?: Record<string, unknown>;
  signal: AbortSignal;
}

interface RunRecord {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled';
  startedAt: number;
  updatedAt: number;
  result?: unknown;
  error?: string;
  emitter: EventEmitter;
  controller: AbortController;
  pipeline?: string;
}

export function agentRunApi(opts: AgentRunApiOptions = {}): Middleware<any> {
  const basePath = opts.basePath ?? '/api';
  const runStore: Memory = opts.runStore ?? new InMemoryKV();
  const maxBody = opts.maxBodyBytes ?? 1_000_000; // 1MB default

  const customStartPaths = new Map<string, { pipeline?: string; transform?: StartRoute['transform'] }>();
  for (const r of opts.routes ?? []) {
    if (!r.path.startsWith('/')) throw new Error(`agentRunApi route path must start with '/': ${r.path}`);
    customStartPaths.set(`${basePath}${r.path}`, { pipeline: r.pipeline, transform: r.transform });
  }

  return async (ctx: HttpCtx, next) => {
    const { req, res } = ctx;
    const url = req.url || '';
    if (!url.startsWith(basePath)) {
      return next();
    }

    if (opts.apiKey) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${opts.apiKey}`) {
        res.statusCode = 401;
        res.end();
        return;
      }
    }

    // Common: read body for POSTs
    const readJsonBody = async (): Promise<unknown> => {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > maxBody) return { __tooLarge: true };
        chunks.push(chunk as Buffer);
      }
      if (chunks.length === 0) return undefined;
      try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return undefined; }
    };

    const startRun = async (initial: { input?: unknown; options?: Record<string, unknown> }, pipeline?: string) => {
      const runId = randomUUID();
      const controller = new AbortController();
      const run: RunRecord = {
        id: runId,
        status: 'queued',
        startedAt: Date.now(),
        updatedAt: Date.now(),
        emitter: new EventEmitter(),
        controller,
        pipeline,
      };
      await runStore.set(runId, run);
      res.statusCode = 202;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ runId, status: run.status }));

      const handler = ctx.agent.handler();
      setImmediate(async () => {
        run.status = 'running';
        run.updatedAt = Date.now();
        run.emitter.emit('status', { status: run.status });
        await runStore.set(runId, run);
        const runCtx: any = { ...ctx, req: { url: '', headers: {}, method: 'POST' } as any, res: undefined, input: initial.input, signal: controller.signal };
        // Ensure state exists and attach pipeline/options hint for downstream routing
        runCtx.state = { ...((ctx as any).state ?? {}) };
        runCtx.state.agentRun = { ...(runCtx.state.agentRun ?? {}), pipeline, options: initial.options };
        try {
          await handler(runCtx);
          if (controller.signal.aborted) {
            run.status = 'cancelled';
            run.updatedAt = Date.now();
            run.emitter.emit('status', { status: run.status });
          } else {
            const final = runCtx.messages?.filter((m: { role: string; content: string }) => m.role === 'assistant').pop();
            run.status = 'succeeded';
            run.result = final?.content;
            run.updatedAt = Date.now();
            run.emitter.emit('status', { status: run.status });
            run.emitter.emit('final', { result: run.result });
          }
          await runStore.set(runId, run);
        } catch (err: any) {
          if (controller.signal.aborted) {
            run.status = 'cancelled';
            run.emitter.emit('status', { status: run.status });
          } else {
            run.status = 'failed';
            run.error = err?.message;
            run.emitter.emit('error', { message: run.error });
          }
          run.updatedAt = Date.now();
          await runStore.set(runId, run);
        }
      });
    };

    // Handle POST start for default and custom routes
    if (req.method === 'POST' && (url === `${basePath}/runs/start` || customStartPaths.has(url))) {
      const body = await readJsonBody();
      if ((body as any)?.__tooLarge) { res.statusCode = 413; res.end(); return; }

      const custom = customStartPaths.get(url);
      if (custom) {
        const v = custom.transform ? await custom.transform(req, body) : { input: (body as any)?.input };
        const x: { input: unknown; options?: Record<string, unknown> } = (typeof v === 'object' && v && 'input' in v)
          ? (v as any)
          : { input: undefined };
        await startRun({ input: x.input, options: x.options }, custom.pipeline);
        return;
      }
      await startRun({ input: (body as any)?.input });
      return;
    }

    // GET /runs/:id/status
    const statusMatch = matchRoute(url, basePath, '/runs/:id/status');
    if (req.method === 'GET' && statusMatch) {
      const run = await runStore.get<RunRecord>(statusMatch.params.id);
      if (!run) { res.statusCode = 404; res.end(); return; }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      const { emitter, controller, ...data } = run;
      res.end(JSON.stringify({
        runId: data.id,
        status: data.status,
        startedAt: data.startedAt,
        updatedAt: data.updatedAt,
        result: data.result,
        error: data.error,
        pipeline: data.pipeline,
      }));
      return;
    }

    // GET /runs/:id/stream
    const streamMatch = matchRoute(url, basePath, '/runs/:id/stream');
    if (req.method === 'GET' && streamMatch) {
      const run = await runStore.get<RunRecord>(streamMatch.params.id);
      if (!run) { res.statusCode = 404; res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const send = (event: string, data: unknown) => { res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); };
      const onStatus = (s: unknown) => send('status', s);
      const onFinal = (d: unknown) => { send('final', d); cleanup(); res.end(); };
      const onError = (e: unknown) => { send('error', e); cleanup(); res.end(); };
      const cleanup = () => { run.emitter.off('status', onStatus); run.emitter.off('final', onFinal); run.emitter.off('error', onError); };
      run.emitter.on('status', onStatus);
      run.emitter.on('final', onFinal);
      run.emitter.on('error', onError);
      send('status', { status: run.status });
      req.on('close', cleanup);
      return;
    }

    // POST /runs/:id/cancel
    const cancelMatch = matchRoute(url, basePath, '/runs/:id/cancel');
    if (req.method === 'POST' && cancelMatch) {
      const run = await runStore.get<RunRecord>(cancelMatch.params.id);
      if (!run) { res.statusCode = 404; res.end(); return; }
      run.controller.abort();
      run.status = 'cancelling';
      run.updatedAt = Date.now();
      run.emitter.emit('status', { status: run.status });
      await runStore.set(run.id, run);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ runId: run.id, status: run.status }));
      return;
    }

    await next();
  };
}
