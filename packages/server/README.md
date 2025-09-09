# @sisu-ai/server

Standalone HTTP/HTTPS adapter for Sisu agents. Spin up an HTTP server or attach to an existing one while keeping the small core philosophy.

## Setup

```bash
npm i @sisu-ai/server
```

## Usage

```ts
import { Agent } from '@sisu-ai/core';
import { Server } from '@sisu-ai/server';
import { agentRunApi } from '@sisu-ai/mw-agent-run-api';

const app = new Agent().use(agentRunApi());
const server = new Server(app, {
  port: 3000,
  // Optional banner (enabled by default). Add endpoints to list them.
  bannerEndpoints: [
    'POST /api/runs/start',
    'GET  /api/runs/:id/status',
    'GET  /api/runs/:id/stream',
    'POST /api/runs/:id/cancel',
  ],
  createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal })
});
server.listen();
```

## Options

- port/host/backlog/path/tls: standard Node listen options.
- basePath: base URL path for your agent routes. Default: `/api`.
- healthPath: health endpoint or `false` to disable. Default: `/health`.
- createCtx(req, res): build your per-request context; `Server` injects `agent` and a default `log` if missing.
- logBanner: print a startup banner. Default: `true`.
- bannerEndpoints: string lines printed under the banner (e.g., `GET /api/runs/:id/status`).
- logLevel: `'debug' | 'info' | 'warn' | 'error'`; sets the default console logger level.
- logger: provide a custom logger implementing Sisu `Logger`.
- redactLogKeys: additional keys to redact in logs (merged with built-ins).

## Request Logging

The server emits basic structured logs for every request and response using the default logger (or your `logger`).

- Request: `[server] request { method, url }`
- Response: `[server] response { method, url, status, duration_ms }`

Control verbosity via `logLevel` or `LOG_LEVEL`.

## Events API

Subscribe to server lifecycle and per-request events without using the `listen` callback.

```ts
const server = new Server(app, { port: 3000 });

server
  .on('listening', ({ url }) => {
    console.log('ready at', url);
  })
  .on('request', ({ method, url }) => {
    // e.g., metrics, audit
  })
  .on('response', ({ method, url, status, duration_ms }) => {
    // e.g., record duration_ms to your metrics system
  })
  .on('error', (err) => {
    console.error('server error', err);
  })
  .on('close', () => {
    console.log('server closed');
  });

server.listen();
```

### Features

- Health endpoint (`/health` by default)
- Attach to existing `http`/`https` server or listen directly
- Supports TLS and UNIX sockets
- Injects the agent into each request context so middleware can spawn runs
 - Startup banner: prints listen address, health path, base path, and optional endpoints
 - Request logs: per-request/response lines, redaction support
 - Events API: `listening`, `request`, `response`, `error`, `close`
