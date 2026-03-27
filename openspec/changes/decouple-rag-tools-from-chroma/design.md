## Context

Current RAG agent tools (`createStoreTool`, `createRetrieveTool`) no longer depend directly on Chroma internals, but generic chunking and ingestion logic still lives in the tool package. This makes app-side reuse awkward and leaves package responsibilities blurry.

## Goals / Non-Goals

**Goals:**
- Define a backend-agnostic vector store contract in `@sisu-ai/vector-core`.
- Move reusable RAG mechanics into a package that is not a tool or middleware package.
- Keep generic tool behavior thin and backend-neutral.
- Preserve Chroma support through a dedicated adapter implementation.

**Non-Goals:**
- Add new backend adapters in this change.
- Expand ingestion/parsing to file formats (PDF/HTML) in this change.

## Decisions

### 1) Introduce a vector-store port interface
Define a contract in `@sisu-ai/vector-core` with at least:
- `upsert(records, opts)`
- `query(request, opts)`
- optional `delete` for future parity

Rationale: vector contracts belong to the vector layer, and generic tools/domain logic depend on stable behavior rather than SDK details.

### 2) Add `@sisu-ai/rag-core` for reusable mechanics
`@sisu-ai/rag-core` owns:
- embeddings provider contract used by RAG flows
- chunking strategy/custom chunker support
- content-to-record preparation
- direct store/retrieve orchestration over the vector-store port
- retrieval result shaping

Rationale: these behaviors are reusable domain mechanics, not model-facing tool concerns.

### 3) Keep `@sisu-ai/tool-rag` as thin wrappers
`@sisu-ai/tool-rag` should only own:
- Zod schemas
- tool naming/description
- `ToolContext` dependency resolution
- calls into `@sisu-ai/rag-core`

Rationale: tool packages should be thin model-callable interfaces.

### 4) Keep Chroma implementation as adapter in vector namespace
`@sisu-ai/vector-chroma` implements the vector-store port and `@sisu-ai/tool-vec-chroma` continues exposing low-level primitives.

Rationale: preserves backend-specific optimizations and avoids breaking existing low-level usage.

### 5) Maintain explicit agent-safe bundles
Agent-facing bundles should exclude low-level primitives by default.

Rationale: prevents accidental model invocation of developer primitives.

## Risks / Trade-offs

- **[Risk]** Migration complexity for existing imports/setup → **Mitigation:** provide clear upgrade notes and consistent examples.
- **[Risk]** Behavior drift during extraction → **Mitigation:** contract tests comparing previous and new behavior paths.
- **[Risk]** Over-abstraction early → **Mitigation:** keep contract minimal and focused on current needs.

## Migration Plan

1. Add/expand vector-store contract types in `@sisu-ai/vector-core`.
2. Add reusable mechanics in `@sisu-ai/rag-core`.
3. Refactor `@sisu-ai/tool-rag` into thin wrappers over `@sisu-ai/rag-core`.
4. Keep Chroma adapter implementation in `@sisu-ai/vector-chroma` and primitives in `@sisu-ai/tool-vec-chroma`.
5. Update examples to use `rag-core` for developer ingestion and `tool-rag` for model-facing composition.
6. Validate with targeted tests and package builds/linting.

Rollback: keep existing Chroma-coupled path behind temporary compatibility exports during transition window.

## Open Questions

- Should `@sisu-ai/tool-rag` keep temporary re-exports for moved helpers, or should those move cleanly to `@sisu-ai/rag-core` immediately?
- What minimal `VectorStore` contract shape should be frozen for v1 portability?
- Should app seeding examples prefer `prepareRagRecords(...)` or higher-level `storeRagContent(...)` from `@sisu-ai/rag-core`?
