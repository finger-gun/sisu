# OpenAI Server Example

Run Sisu over HTTP using the OpenAI adapter, server adapter and the agent run API middleware.

## Run
- `npm run ex:openai:server`
- or `npm run dev -w examples/openai-server`

## Endpoints

All routes are mounted under `/api`.

- `POST /runs/start` – start a run
- `GET /runs/:id/status` – get run status and result
- `GET /runs/:id/stream` – stream events via SSE
- `POST /runs/:id/cancel` – cancel a running job

Example:

```bash
curl -s -X POST localhost:3000/api/runs/start \
  -H 'content-type: application/json' \
  -d '{"input":"Say hello"}'
```

The response includes `runId` that can be used with the other routes.

## Config Flags (CLI overrides env)
- `--openai-api-key`, `--api-key`
- `--openai-base-url`, `--base-url`
- `--openai-model`
- `--port`

## Env Vars (alternatives)
- `OPENAI_API_KEY` or `API_KEY`
- `OPENAI_BASE_URL` or `BASE_URL`
- `OPENAI_MODEL`
- `PORT`
