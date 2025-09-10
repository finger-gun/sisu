import http, { type IncomingMessage, type ServerResponse } from 'http';
import https from 'https';
import type { Agent, Logger } from '@sisu-ai/core';
import { createConsoleLogger, createRedactingLogger } from '@sisu-ai/core';
import { EventEmitter } from 'events';
import type { AddressInfo } from 'net';
export { matchRoute } from './router.js';

export interface ListenOptions<Ctx> {
  tls?: https.ServerOptions;
  port?: number;
  host?: string;
  backlog?: number;
  path?: string;
  basePath?: string;
  createCtx?: (req: IncomingMessage, res: ServerResponse) => Promise<Ctx> | Ctx;
  healthPath?: string | false;
  logBanner?: boolean;                 // print startup banner (default: true)
  bannerEndpoints?: string[];          // additional endpoints to list under basePath
  logger?: Logger;                     // default logger if ctx.log is missing
  logLevel?: 'debug' | 'info' | 'warn' | 'error'; // convenience to create console logger
  redactLogKeys?: string[];            // additional keys to redact in logs
}

export class Server<Ctx = any> {
  private server?: http.Server | https.Server;
  private basePath: string;
  private healthPath: string | false;
  private createCtx: (req: IncomingMessage, res: ServerResponse) => Promise<Ctx> | Ctx;
  private emitter = new EventEmitter();

  constructor(private agent: Agent<any>, private opts: ListenOptions<Ctx> = {}) {
    this.basePath = opts.basePath ?? '/api';
    this.healthPath = opts.healthPath ?? '/health';
    this.createCtx = opts.createCtx ?? ((req, res) => ({ req, res } as unknown as Ctx));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    // Set up server-level request logging (independent of ctx)
    const baseLogger = this.opts.logger ?? createConsoleLogger({ level: this.opts.logLevel, timestamps: true } as any);
    const srvLogger = createRedactingLogger(baseLogger, { keys: this.opts.redactLogKeys });
    const started = Date.now();
    const { method = 'GET', url = '' } = req;
    srvLogger.info?.('[server] request', { method, url });
    res.once?.('finish', () => {
      const ms = Date.now() - started;
      srvLogger.info?.('[server] response', { method, url, status: res.statusCode, duration_ms: ms });
      this.emitter.emit('response', { method, url, status: res.statusCode, duration_ms: ms });
    });
    this.emitter.emit('request', { method, url });
    if (this.healthPath && req.url === this.healthPath) {
      res.statusCode = 200;
      res.end('ok');
      return;
    }
    if (!req.url || !req.url.startsWith(this.basePath)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const ctx = await this.createCtx(req, res);
    (ctx as any).agent = this.agent;
    // Provide a default logger if not present, mirroring CLI behavior
    if (!(ctx as any).log) {
      (ctx as any).log = srvLogger;
    }
    // Mark this context as an HTTP transport envelope and capture minimal request meta
    const headers = req.headers || {};
    const httpMeta = {
      method: req.method || 'GET',
      url: req.url || '',
      ip: (req.socket && (req.socket.remoteAddress || '')) || '',
      headers: {
        'user-agent': typeof headers['user-agent'] === 'string' ? headers['user-agent'] : undefined,
        'accept': typeof headers['accept'] === 'string' ? headers['accept'] : undefined,
        'content-type': typeof headers['content-type'] === 'string' ? headers['content-type'] : undefined,
      },
    };
    (ctx as any).state = { ...((ctx as any).state ?? {}), _transport: { type: 'http' }, _http: httpMeta };
    const handler = this.agent.handler();
    await handler(ctx as Ctx);
    // Only synthesize a 404 when nothing has been written at all.
    // If headers were sent (e.g., SSE), keep the connection as-is.
    if (!res.writableEnded && !(res as any).headersSent) {
      res.statusCode = 404;
      res.end();
    }
  }

  listener() {
    return this.handle.bind(this);
  }

  listen(cb?: () => void) {
    const listener = this.listener();
    this.server = this.opts.tls
      ? https.createServer(this.opts.tls, listener)
      : http.createServer(listener);
    if (this.opts.path) {
      this.server.listen(this.opts.path, cb);
    } else {
      this.server.listen(this.opts.port ?? 0, this.opts.host, this.opts.backlog, cb);
    }
    this.server.on('error', (err) => this.emitter.emit('error', err));
    this.server.on('close', () => this.emitter.emit('close'));
    const printBanner = this.opts.logBanner !== false;
    if (printBanner) {
      const addr = this.server.address();
      let url = '';
      if (typeof addr === 'object' && addr && 'port' in addr) {
        const host = this.opts.host && this.opts.host !== '0.0.0.0' ? this.opts.host : 'localhost';
        url = `http://${host}:${addr.port}`;
      } else if (typeof addr === 'string') {
        url = addr;
      }

      if (url) console.log(`[server] listening on ${url}`);
      if (this.healthPath) console.log(`[server] health: GET ${this.healthPath}`);
      if (this.basePath) console.log(`[server] basePath: ${this.basePath}`);
      if (this.opts.bannerEndpoints?.length) {
        console.log('[server] endpoints:');
        for (const ep of this.opts.bannerEndpoints) console.log(`  ${ep}`);
      }
      this.emitter.emit('listening', { url, address: addr as string | AddressInfo | null | undefined });
    }
    return this.server;
  }

  attach(server: http.Server | https.Server) {
    server.on('request', this.listener());
    this.server = server;
  }

  close(cb?: (err?: Error) => void) {
    this.server?.close(cb);
  }

  address() {
    return this.server?.address();
  }

  // Event subscription helpers
  on(event: 'listening', handler: (e: { url: string; address: string | AddressInfo | null | undefined }) => void): this;
  on(event: 'request', handler: (e: { method: string; url: string }) => void): this;
  on(event: 'response', handler: (e: { method: string; url: string; status: number; duration_ms: number }) => void): this;
  on(event: 'error', handler: (err: Error) => void): this;
  on(event: 'close', handler: () => void): this;
  on(event: string, handler: (...args: any[]) => void): this { this.emitter.on(event, handler); return this; }

  once(event: 'listening', handler: (e: { url: string; address: string | AddressInfo | null | undefined }) => void): this;
  once(event: 'request', handler: (e: { method: string; url: string }) => void): this;
  once(event: 'response', handler: (e: { method: string; url: string; status: number; duration_ms: number }) => void): this;
  once(event: 'error', handler: (err: Error) => void): this;
  once(event: 'close', handler: () => void): this;
  once(event: string, handler: (...args: any[]) => void): this { this.emitter.once(event, handler); return this; }

  off(event: 'listening', handler: (e: { url: string; address: string | AddressInfo | null | undefined }) => void): this;
  off(event: 'request', handler: (e: { method: string; url: string }) => void): this;
  off(event: 'response', handler: (e: { method: string; url: string; status: number; duration_ms: number }) => void): this;
  off(event: 'error', handler: (err: Error) => void): this;
  off(event: 'close', handler: () => void): this;
  off(event: string, handler: (...args: any[]) => void): this { this.emitter.off(event, handler); return this; }
}
