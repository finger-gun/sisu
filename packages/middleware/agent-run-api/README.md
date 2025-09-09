# @sisu-ai/mw-agent-run-api

Opinionated HTTP endpoints for starting, streaming, inspecting, and cancelling Sisu agent runs. Not a general routing framework.

## Setup

```bash
npm i @sisu-ai/mw-agent-run-api
```

## Usage

```ts
import { Agent } from '@sisu-ai/core';
import { agentRunApi } from '@sisu-ai/mw-agent-run-api';
import { Server } from '@sisu-ai/server';

const app = new Agent().use(agentRunApi({ apiKey: 'secret' }));
const server = new Server(app, { createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal }) });
server.listen();
```

### Routes

- `POST /api/runs/start` – enqueue a run. Returns `{ runId, status }` with `202 Accepted`.
- `GET /api/runs/:id/status` – fetch run status and result.
- `GET /api/runs/:id/stream` – subscribe to run events via SSE.
- `POST /api/runs/:id/cancel` – request cancellation.

### Options

| Option | Description | Default |
| ------ | ----------- | ------- |
| `basePath` | Mount point for routes | `/api` |
| `apiKey` | Require `Authorization: Bearer` header | none |
| `maxBodyBytes` | Maximum JSON body size | `1_000_000` |
| `runStore` | Storage implementing Sisu `Memory` interface | in-memory `InMemoryKV` |
| `routes` | Extra POST start endpoints with transforms | none |

### Custom start routes

You can expose multiple start endpoints for different use cases, each with its own request shape and an optional logical pipeline tag. The `pipeline` is written to `ctx.state.agentRun.pipeline` so you can route using control-flow middleware.

```ts
const app = new Agent().use(agentRunApi({
  routes: [
    {
      path: '/runs/support-ticket',
      pipeline: 'support',
      async transform(_req, body) {
        // body is parsed JSON when available
        return { input: `${body.subject}: ${body.message}` };
      },
    },
  ],
}));
```

