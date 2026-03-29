# @sisu-ai/runtime-desktop

Desktop runtime for Sisu apps.

This package provides:

- Runtime controller lifecycle (`starting`, `ready`, `degraded`, `stopped`)
- Localhost-only HTTP API server for desktop clients
- Streaming chat events (`message.started`, `token.delta`, terminal events)
- Provider/model catalog with OpenAI, Anthropic, and Ollama factory helpers
- Conversation persistence/search/branching (default in-memory implementation)

## Development

```bash
pnpm --filter @sisu-ai/runtime-desktop build
pnpm --filter @sisu-ai/runtime-desktop lint
pnpm vitest run packages/runtime-desktop/test/runtime-desktop.test.ts
```

## Run local desktop runtime

```bash
RUNTIME_HOST=127.0.0.1 \
RUNTIME_PORT=8787 \
OPENAI_API_KEY=... \
ANTHROPIC_API_KEY=... \
sisu-runtime-desktop
```

Optional variables:

- `RUNTIME_API_KEY` (Bearer token required by HTTP server when set)
- `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `OLLAMA_BASE_URL`

## HTTP endpoints

- `GET /health`
- `GET /providers`
- `GET /threads`
- `POST /threads`
- `GET /threads/:threadId`
- `POST /threads/:threadId/override-model`
- `GET /search?query=...`
- `POST /threads/branch`
- `POST /chat/generate`
- `GET /streams/:streamId/events` (SSE)
- `GET /streams/:streamId/status`
- `POST /streams/:streamId/cancel`

All endpoints are loopback-restricted (`127.0.0.1` / `::1`).
