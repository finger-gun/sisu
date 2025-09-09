import http, { type IncomingMessage, type ServerResponse } from 'http';
import https from 'https';
import type { Agent } from '@sisu-ai/core';
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
}

export class Server<Ctx = any> {
  private server?: http.Server | https.Server;
  private basePath: string;
  private healthPath: string | false;
  private createCtx: (req: IncomingMessage, res: ServerResponse) => Promise<Ctx> | Ctx;

  constructor(private agent: Agent<any>, private opts: ListenOptions<Ctx> = {}) {
    this.basePath = opts.basePath ?? '/api';
    this.healthPath = opts.healthPath ?? '/health';
    this.createCtx = opts.createCtx ?? ((req, res) => ({ req, res } as unknown as Ctx));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
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
    const handler = this.agent.handler();
    await handler(ctx as Ctx);
    if (!res.writableEnded) {
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
}
