## Why

Today, Sisu exposes vector-database primitives (`upsert`, `query`, `delete`) and RAG middleware orchestration, but it lacks an agent-friendly retrieval tool that can be called directly from model tool-calling flows. This gap makes common RAG use cases harder to implement and the `openai-rag-chroma` example less representative of real-world agent behavior.

## Goals

- Provide a high-level retrieval tool on top of `@sisu-ai/tool-vec-chroma` that accepts user-query text and returns compact, citation-ready context.
- Improve developer experience by letting agents perform semantic retrieval through a single tool call.
- Update `examples/openai-rag-chroma` to clearly separate ingestion and retrieval responsibilities across two agents.
- Replace toy embedding usage in the example flow with OpenAI embeddings to align with production-like behavior.

## Non-goals

- Replacing or removing existing low-level `vector.*` primitives.
- Redesigning `@sisu-ai/mw-rag` orchestration middleware behavior.
- Introducing new vector store backends or changing Chroma persistence semantics.
- Building a full multi-tenant retrieval policy system in this change.

## What Changes

- Add a higher-level retrieval tool capability in `@sisu-ai/tool-vec-chroma` that:
  - accepts query text and retrieval options,
  - embeds query text internally,
  - executes vector search,
  - returns compact chunks with metadata/citations suitable for model context construction.
- Add a separate agent-facing storage tool capability in `@sisu-ai/tool-vec-chroma` that:
  - accepts communication-derived text/content payloads,
  - chunks/embeds content for storage,
  - writes vectors and metadata to Chroma for future retrieval.
- Add a normalized embeddings API at provider-adapter level so providers expose a consistent embedding contract that tools can consume via dependency injection.
- Define stable input/output contracts for this retrieval tool, including validation and failure behavior.
- Define stable input/output contracts for this storage tool, including validation and failure behavior.
- Add tests for happy path, invalid inputs, edge behavior, and cancellation-aware retrieval flow.
- Update `examples/openai-rag-chroma/src/index.ts` to use two agents:
  - an ingestion-focused agent that indexes content,
  - a retrieval-focused agent that handles user prompts and invokes retrieval tooling.
- Switch the example embedding configuration from toy embedding to OpenAI embeddings.
- Update relevant package/example documentation for the new tool usage pattern.

## Target Audience

- Sisu application developers building agentic RAG experiences.
- Example consumers learning how to combine tool-calling and retrieval.
- Maintainers who need a clear, reusable abstraction between embedding/query primitives and model-facing tools.

## Success Metrics

- Developers can build prompt-driven retrieval with one documented tool integration instead of manually wiring embed/query plumbing.
- The `openai-rag-chroma` example demonstrates ingestion and retrieval as separate, understandable agent flows.
- Retrieval tool behavior is covered by deterministic tests and passes repository validation.

## Acceptance Criteria

- New retrieval capability is documented with explicit inputs, outputs, and constraints.
- Example flow supports ingestion and user-query retrieval via separate agents.
- OpenAI embeddings are used in the updated example retrieval path.
- Required artifacts (`proposal`, `design`, `specs`, `tasks`) are complete and implementation-ready.

## Capabilities

### New Capabilities

- `agent-retrieval-tooling`: Add a model-callable retrieval tool on top of Chroma primitives that performs embedding + semantic search + compact context response formatting.
- `agent-storage-tooling`: Add a model-callable storage tool on top of Chroma primitives that persists useful communication-derived content for later retrieval.
- `adapter-embeddings-api`: Add a provider-normalized embeddings interface so adapters expose a consistent `embed` capability for tool/middleware composition.
- `rag-chroma-dual-agent-example`: Update the OpenAI Chroma RAG example to separate ingestion and user-query retrieval into distinct agents using OpenAI embeddings.

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `packages/tool-vec-chroma/*` (new high-level retrieval tooling + tests)
  - `examples/openai-rag-chroma/src/index.ts` (two-agent flow)
  - related docs/readmes for usage updates
- API surface:
  - Adds new user-facing tool API in `@sisu-ai/tool-vec-chroma`.
  - Adds/standardizes provider adapter embedding API surface for normalized embedding calls.
  - Existing low-level vector APIs remain intact (non-breaking).
- Dependencies/systems:
  - Example relies on OpenAI embeddings configuration.
  - Chroma remains the vector backend for ingestion/query storage.
