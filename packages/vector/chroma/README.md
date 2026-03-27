# @sisu-ai/vector-chroma

Chroma vector-store adapter for Sisu RAG composition.

## Exports

- `createChromaVectorStore`

The created adapter exposes `upsert`, `query`, and `delete`, and is intended to be injected into backend-agnostic RAG tools such as `@sisu-ai/tool-rag`.

