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
  createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal })
});
server.listen(() => console.log('listening'));
```

### Features

- Health endpoint (`/healthz` by default)
- Attach to existing `http`/`https` server or listen directly
- Supports TLS and UNIX sockets
- Injects the agent into each request context so middleware can spawn runs
