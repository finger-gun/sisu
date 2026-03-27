## Why

Sisu now has a backend-agnostic `VectorStore` contract, but only one maintained implementation: `@sisu-ai/vector-chroma`.

That leaves the RAG stack without a simple zero-infrastructure local backend for development, demos, and small file-backed corpora.

## Goals

- Add `@sisu-ai/vector-vectra` as a second maintained `VectorStore` adapter.
- Keep the adapter thin and aligned with `@sisu-ai/vector-core` package boundaries.
- Add a Vectra-based OpenAI RAG example by copying the existing Chroma example and swapping only the backend setup.
- Update active specs and docs so the maintained vector backend story reflects both Chroma and Vectra.

## Non-goals

- Adding hybrid BM25 document-index flows from Vectra into `@sisu-ai/rag-core`.
- Expanding the shared vector contract in this change.
- Reworking existing Chroma behavior.

## What Changes

- Add `@sisu-ai/vector-vectra` under `packages/vector/vectra`.
- Implement `createVectraVectorStore(...)` returning a `VectorStore` backed by Vectra `LocalIndex`.
- Support direct `upsert`, `query`, and `delete` operations using one folder per namespace.
- Add `examples/openai-rag-vectra` as a file-backed counterpart to `openai-rag-chroma`.
- Update active OpenSpec and repo docs to include the Vectra adapter and example.

## Capabilities

### New Capabilities

- `vectra-vector-store-adapter`: Vectra package provides a file-backed `VectorStore` implementation.
- `rag-vectra-dual-agent-example`: OpenAI RAG example demonstrates the same layered stack against Vectra.

## Impact

- Affected code:
  - `packages/vector/vectra/*`
  - `examples/openai-rag-vectra/*`
  - active docs and specs referencing maintained vector backends
- API surface:
  - introduces `createVectraVectorStore`
- Risks:
  - metadata filter compatibility depends on Vectra's supported operator subset and indexed fields configuration
