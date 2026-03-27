# @sisu-ai/rag-core

Reusable backend-agnostic RAG mechanics for Sisu.

## Exports

- chunkers: `characterChunker`, `sentenceChunker`, `paragraphChunker`, `getChunker`
- direct helpers: `prepareRagRecords`, `storeRagContent`, `retrieveRagContext`
- types for embeddings providers, chunking, and retrieval/storage results

## Package role

Use `@sisu-ai/rag-core` when you need RAG mechanics outside tool-calling, such as startup seeding or developer-controlled ingestion.

- `@sisu-ai/tool-rag` wraps this package for model-facing tool calls
- `@sisu-ai/vector-core` provides vector contracts
- `@sisu-ai/vector-chroma` provides a Chroma-backed `VectorStore`

