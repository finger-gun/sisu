# @sisu-ai/protocol

Shared desktop runtime protocol contracts for TypeScript and generated client models.

Exports include:

- Runtime health and dependency schemas
- Provider/model catalog schemas
- Chat generation, stream event, status, and cancellation schemas
- Conversation/thread/search/branch request-response schemas
- Default and per-thread model selection schemas
- Error envelope schema and parse helpers

## Development

```bash
pnpm --filter @sisu-ai/protocol build
pnpm --filter @sisu-ai/protocol lint
pnpm vitest run packages/protocol/test/protocol.test.ts
```

## Protocol version

Current protocol marker:

`PROTOCOL_VERSION = "2026-03-29"`

## Swift generation guidance

The schema names and TypeScript types in `src/index.ts` are the canonical source.
Swift models should map 1:1 to the exported schema payload fields.
