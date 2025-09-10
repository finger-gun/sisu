import type { Middleware } from '@sisu-ai/core';

export interface CorsOptions {
  origin?: string;                 // '*' or specific origin
  methods?: string;                // 'GET,POST,...'
  headers?: string;                // 'Content-Type,Authorization,...'
  credentials?: boolean;           // Access-Control-Allow-Credentials
  maxAgeSec?: number;              // Access-Control-Max-Age
}

export function cors(opts: CorsOptions = {}): Middleware<any> {
  const origin = opts.origin ?? '*';
  const methods = opts.methods ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  const headers = opts.headers ?? 'Content-Type,Authorization';
  const credentials = opts.credentials ?? false;
  const maxAgeSec = opts.maxAgeSec ?? 600;
  return async (ctx, next) => {
    const { req, res } = ctx as any;
    if (!req || !res) return next();
    res.setHeader?.('Access-Control-Allow-Origin', origin);
    res.setHeader?.('Access-Control-Allow-Methods', methods);
    res.setHeader?.('Access-Control-Allow-Headers', headers);
    res.setHeader?.('Access-Control-Max-Age', String(maxAgeSec));
    if (credentials) res.setHeader?.('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    await next();
  };
}

