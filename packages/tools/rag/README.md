# @sisu-ai/tool-rag

Backend-agnostic RAG tools for agents.

## Exports

- `createRetrieveTool`
- `createStoreTool`
- `createRagTools`

Type exports are re-exposed for convenience, but reusable chunking and ingestion mechanics live in `@sisu-ai/rag-core`.

## Composition

`@sisu-ai/tool-rag` expects:

- `embeddings` provider (`embed(input[]) => vectors[]`)
- `vectorStore` implementation (`upsert`, `query`)

Use backend adapters such as `@sisu-ai/vector-chroma` to provide `vectorStore`.

For startup seeding, chunking helpers, and developer-controlled ingestion, use `@sisu-ai/rag-core` directly.
