## Why

`createStoreTool` and `createRetrieveTool` are now backend-agnostic, but generic RAG mechanics still live inside a tool package. That leaves application-side ingestion awkward and blurs Sisu package boundaries.

## Goals

- Keep agent-facing RAG tools in `@sisu-ai/tool-rag` as thin wrappers.
- Add reusable backend-agnostic RAG mechanics in `@sisu-ai/rag-core`.
- Keep vector contracts in `@sisu-ai/vector-core` and backend adapter concerns in `@sisu-ai/vector-chroma`.
- Preserve current DX for the OpenAI RAG example while moving toward cleaner package boundaries.

## Non-goals

- Adding new vector backends in this change.
- Reworking `@sisu-ai/mw-rag` orchestration semantics.
- Introducing document parser features (PDF/HTML/etc.) in this phase.

## What Changes

- Formalize the backend-agnostic vector store interface in `@sisu-ai/vector-core`.
- Add `@sisu-ai/rag-core` for chunking, embedding orchestration, content preparation, and retrieval shaping.
- Keep `@sisu-ai/tool-rag` as a thin model-facing wrapper over `@sisu-ai/rag-core`.
- Implement Chroma adapter/port in `@sisu-ai/vector-chroma`.
- Update exports and docs to clearly distinguish developer primitives (`vector.*`) from agent-facing RAG tools.
- Update affected examples to use `@sisu-ai/rag-core` for developer ingestion and `@sisu-ai/tool-rag` for model-facing composition.

## Capabilities

### New Capabilities

- `rag-tools-backend-agnostic`: Agent-facing store/retrieve tools consume an injected vector-store contract instead of backend-specific SDK calls.
- `chroma-vector-store-adapter`: Chroma package provides a concrete vector-store adapter implementation compatible with generic RAG tools.
- `rag-core-mechanics`: reusable RAG mechanics live in a non-tool package.

### Modified Capabilities

- `agent-retrieval-tooling`: Retrieval tool implementation changes from Chroma-coupled to backend-agnostic contract usage.
- `agent-storage-tooling`: Storage tool implementation changes from Chroma-coupled to backend-agnostic contract usage.

## Impact

- Affected code:
  - `packages/rag/core/*`
  - `packages/tools/rag/*`
  - `packages/vector/core/*`
  - `packages/vector/chroma/*`
  - `packages/tools/vec-chroma/*` (primitives/compat adjustments)
  - affected examples and docs
- API surface:
  - introduces `@sisu-ai/rag-core`
  - formalizes vector-store contract types in `@sisu-ai/vector-core`
  - narrows `@sisu-ai/tool-rag` to model-facing wrapper concerns
- Risks:
  - migration churn for imports and setup patterns
  - regression risk if behavior changes during extraction
