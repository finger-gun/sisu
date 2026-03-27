# @sisu-ai/mw-agent-run-api

Expose production-ready run endpoints (start, status, stream, cancel) for Sisu agents.

[![Tests](https://github.com/finger-gun/sisu/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/finger-gun/sisu/actions/workflows/tests.yml)
[![CodeQL](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/finger-gun/sisu/actions/workflows/github-code-scanning/codeql)
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

---

## Documentation

**Core** — [Package docs](packages/core/README.md) · [Error types](packages/core/ERROR_TYPES.md)

**Adapters** — [OpenAI](packages/adapters/openai/README.md) · [Anthropic](packages/adapters/anthropic/README.md) · [Ollama](packages/adapters/ollama/README.md)

<details>
<summary>All middleware packages</summary>

- [@sisu-ai/mw-agent-run-api](packages/middleware/agent-run-api/README.md)
- [@sisu-ai/mw-context-compressor](packages/middleware/context-compressor/README.md)
- [@sisu-ai/mw-control-flow](packages/middleware/control-flow/README.md)
- [@sisu-ai/mw-conversation-buffer](packages/middleware/conversation-buffer/README.md)
- [@sisu-ai/mw-cors](packages/middleware/cors/README.md)
- [@sisu-ai/mw-error-boundary](packages/middleware/error-boundary/README.md)
- [@sisu-ai/mw-guardrails](packages/middleware/guardrails/README.md)
- [@sisu-ai/mw-invariants](packages/middleware/invariants/README.md)
- [@sisu-ai/mw-orchestration](packages/middleware/orchestration/README.md)
- [@sisu-ai/mw-rag](packages/middleware/rag/README.md)
- [@sisu-ai/mw-react-parser](packages/middleware/react-parser/README.md)
- [@sisu-ai/mw-register-tools](packages/middleware/register-tools/README.md)
- [@sisu-ai/mw-tool-calling](packages/middleware/tool-calling/README.md)
- [@sisu-ai/mw-trace-viewer](packages/middleware/trace-viewer/README.md)
- [@sisu-ai/mw-usage-tracker](packages/middleware/usage-tracker/README.md)
</details>

<details>
<summary>All tool packages</summary>

- [@sisu-ai/tool-aws-s3](packages/tools/aws-s3/README.md)
- [@sisu-ai/tool-azure-blob](packages/tools/azure-blob/README.md)
- [@sisu-ai/tool-extract-urls](packages/tools/extract-urls/README.md)
- [@sisu-ai/tool-github-projects](packages/tools/github-projects/README.md)
- [@sisu-ai/tool-rag](packages/tools/rag/README.md)
- [@sisu-ai/tool-summarize-text](packages/tools/summarize-text/README.md)
- [@sisu-ai/tool-terminal](packages/tools/terminal/README.md)
- [@sisu-ai/tool-web-fetch](packages/tools/web-fetch/README.md)
- [@sisu-ai/tool-web-search-duckduckgo](packages/tools/web-search-duckduckgo/README.md)
- [@sisu-ai/tool-web-search-google](packages/tools/web-search-google/README.md)
- [@sisu-ai/tool-web-search-openai](packages/tools/web-search-openai/README.md)
- [@sisu-ai/tool-wikipedia](packages/tools/wikipedia/README.md)
</details>

<details>
<summary>All RAG packages</summary>

- [@sisu-ai/rag-core](packages/rag/core/README.md)
</details>

<details>
<summary>All vector packages</summary>

- [@sisu-ai/vector-core](packages/vector/core/README.md)
- [@sisu-ai/vector-chroma](packages/vector/chroma/README.md)
</details>

<details>
<summary>All examples</summary>

**Anthropic** — [hello](examples/anthropic-hello/README.md) · [control-flow](examples/anthropic-control-flow/README.md) · [stream](examples/anthropic-stream/README.md) · [weather](examples/anthropic-weather/README.md)

**Ollama** — [hello](examples/ollama-hello/README.md) · [stream](examples/ollama-stream/README.md) · [vision](examples/ollama-vision/README.md) · [weather](examples/ollama-weather/README.md) · [web-search](examples/ollama-web-search/README.md)

**OpenAI** — [hello](examples/openai-hello/README.md) · [weather](examples/openai-weather/README.md) · [stream](examples/openai-stream/README.md) · [vision](examples/openai-vision/README.md) · [reasoning](examples/openai-reasoning/README.md) · [react](examples/openai-react/README.md) · [control-flow](examples/openai-control-flow/README.md) · [branch](examples/openai-branch/README.md) · [parallel](examples/openai-parallel/README.md) · [graph](examples/openai-graph/README.md) · [orchestration](examples/openai-orchestration/README.md) · [orchestration-adaptive](examples/openai-orchestration-adaptive/README.md) · [guardrails](examples/openai-guardrails/README.md) · [error-handling](examples/openai-error-handling/README.md) · [rag-chroma](examples/openai-rag-chroma/README.md) · [web-search](examples/openai-web-search/README.md) · [web-fetch](examples/openai-web-fetch/README.md) · [wikipedia](examples/openai-wikipedia/README.md) · [terminal](examples/openai-terminal/README.md) · [github-projects](examples/openai-github-projects/README.md) · [server](examples/openai-server/README.md) · [aws-s3](examples/openai-aws-s3/README.md) · [azure-blob](examples/openai-azure-blob/README.md)
</details>

---

## Contributing

We build Sisu in the open. Contributions welcome.

[Contributing Guide](CONTRIBUTING.md) · [Report a Bug](https://github.com/finger-gun/sisu/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/finger-gun/sisu/issues/new?template=feature_request.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

---

<div align="center">

**[Star on GitHub](https://github.com/finger-gun/sisu)** if Sisu helps you build better agents.

*Quiet, determined, relentlessly useful.*

[Apache 2.0 License](LICENSE)

</div>
