# @sisu-ai/mw-agent-run-api

Opinionated HTTP endpoints for starting, streaming, inspecting, and cancelling Sisu agent runs. Not a general routing framework.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/finger-gun/sisu/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/%40sisu-ai%2Fmw-agent-run-api)](https://www.npmjs.com/package/@sisu-ai/mw-agent-run-api)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)


## Setup

```bash
npm i @sisu-ai/mw-agent-run-api
```

## Usage

```ts
import { Agent } from '@sisu-ai/core';
import { agentRunApi } from '@sisu-ai/mw-agent-run-api';
import { Server } from '@sisu-ai/server';

const runApi = agentRunApi({ apiKey: 'secret' });
const app = new Agent().use(runApi);
const server = new Server(app, {
  createCtx: (req, res) => ({ req, res, messages: [], signal: new AbortController().signal }),
  bannerEndpoints: (runApi as any).bannerEndpoints,
});
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

### Routing by pipeline (example)

```ts
import { switchCase } from '@sisu-ai/mw-control-flow';

app.use(switchCase(
  (c) => (c as any).state?.agentRun?.pipeline ?? 'default',
  {
    support: async (c) => { /* handle support */ },
    default: async (c) => { /* fallback */ },
  },
));
```

### Error responses

- 400 invalid_json: body could not be parsed as JSON
- 413 body_too_large: payload exceeds `maxBodyBytes`
- 422 missing_input: `{ input }` is missing or null
- 400 invalid_request: custom `transform` threw; `message` included

### SSE stream

Subscribe to server-sent events for a run:

```bash
curl -N http://localhost:3000/api/runs/<runId>/stream
```

Client receives events like:

```
event: status
data: {"status":"running"}

event: final
data: {"result":"..."}
```

# Community & Support

Discover what you can do through examples or documentation. Check it out at https://github.com/finger-gun/sisu. Example projects live under [`examples/`](https://github.com/finger-gun/sisu/tree/main/examples) in the repo.


- [Code of Conduct](https://github.com/finger-gun/sisu/blob/main/CODE_OF_CONDUCT.md)
- [Contributing Guide](https://github.com/finger-gun/sisu/blob/main/CONTRIBUTING.md)
- [License](https://github.com/finger-gun/sisu/blob/main/LICENSE)
- [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md)