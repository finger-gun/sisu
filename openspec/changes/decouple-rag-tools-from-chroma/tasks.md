## 1. Contract and Package Structure

- [x] 1.1 Define a backend-agnostic vector-store contract type for upsert/query operations.
- [x] 1.2 Split reusable RAG mechanics into a non-tool package (`@sisu-ai/rag-core`).
- [x] 1.3 Update exports to clearly separate agent-facing tools, reusable RAG mechanics, and backend-specific primitives.

## 2. RAG Core Extraction

- [x] 2.1 Move chunkers and embeddings orchestration into `@sisu-ai/rag-core`.
- [x] 2.2 Add reusable content preparation and direct store/retrieve helpers in `@sisu-ai/rag-core`.
- [x] 2.3 Preserve chunking strategy/custom chunker support and bounded output behavior.

## 3. Thin Tool Wrappers

- [x] 3.1 Refactor `createStoreTool` to delegate to `@sisu-ai/rag-core`.
- [x] 3.2 Refactor `createRetrieveTool` to delegate to `@sisu-ai/rag-core`.
- [x] 3.3 Keep tool-specific validation and dependency resolution in `@sisu-ai/tool-rag`.

## 4. Chroma Adapter Integration

- [x] 4.1 Implement Chroma vector-store adapter conforming to the shared contract (`@sisu-ai/vector-chroma`).
- [x] 4.2 Ensure low-level `vector.upsert/query/delete` remain available for developer-controlled flows.
- [x] 4.3 Wire Chroma adapter into generic tools for current example compatibility.

## 5. Tests

- [x] 5.1 Add tests for `@sisu-ai/rag-core` chunking and orchestration behavior.
- [x] 5.2 Add wrapper-level tests for `@sisu-ai/tool-rag` behavior using mocked dependencies.
- [x] 5.3 Add adapter tests ensuring Chroma implementation preserves expected upsert/query semantics.

## 6. Examples and Docs

- [x] 6.1 Update `openai-rag-chroma` to use `@sisu-ai/rag-core` for developer ingestion and `@sisu-ai/tool-rag` + `@sisu-ai/vector-chroma` for model-facing composition.
- [x] 6.2 Update package docs to explain package roles and migration path.

## 7. Validation

- [x] 7.1 Run targeted tests/typechecks for touched packages.
- [x] 7.2 Run package build/lint/test validation and fix introduced issues.
