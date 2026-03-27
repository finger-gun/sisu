## Overview

`@sisu-ai/vector-vectra` mirrors the role of `@sisu-ai/vector-chroma`: it is a thin adapter package that implements the shared `VectorStore` contract and owns only Vectra-specific translation.

The adapter uses Vectra `LocalIndex` rather than `LocalDocumentIndex` because Sisu's current layered RAG stack already owns chunking and embeddings in `@sisu-ai/rag-core`.

## Package Shape

- Package: `packages/vector/vectra`
- Public export: `createVectraVectorStore`
- Dependency: published `vectra` package

## Storage Model

- `folderPath` points at a base directory.
- Each namespace is mapped to a subfolder under that base directory.
- The adapter auto-creates a Vectra index on first write.
- Queries against a missing namespace return an empty result set.

This keeps Sisu namespace semantics without requiring a shared multi-tenant server.

## Metadata Handling

Vectra item metadata is limited to scalar values for indexed/queryable fields. Sisu metadata can contain richer values, so the adapter:

- preserves scalar `string` / `number` / `boolean` values directly
- serializes non-scalar metadata values to JSON strings
- allows callers to configure `indexedMetadataFields`

This matches the existing philosophy used in the Chroma adapter: keep translation concerns inside the backend package, not in `rag-core` or `tool-rag`.

## Query Handling

- `VectorQueryRequest.filter` is passed through after recursive sanitization into Vectra's filter subset.
- Query scores are surfaced as Vectra cosine similarity scores.

## Example

`examples/openai-rag-vectra` copies the structure of `openai-rag-chroma`:

- same docs
- same `rag-core` ingestion flow
- same `tool-rag` setup
- different vector backend setup only

The example uses a local folder instead of a running server, making it the simplest maintained RAG example in the repo.
