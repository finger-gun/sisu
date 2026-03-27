## 1. Retrieval Tool API in `@sisu-ai/tool-vec-chroma`

- [x] 1.1 Inspect `packages/tool-vec-chroma/src` and choose final public export name/signature for high-level query-text retrieval tool.
- [x] 1.2 Add retrieval tool input/output types and Zod schema validation in `packages/tool-vec-chroma/src` (including `queryText`, optional `topK`, and optional filter inputs).
- [x] 1.3 Implement retrieval flow in `packages/tool-vec-chroma/src` to embed query text, call existing vector query primitive, and map response to compact chunk/citation output.
- [x] 1.4 Add defaulting and bounds behavior for retrieval options (including a safe `topK` default/max) and ensure output remains small/serializable.
- [x] 1.5 Export the new retrieval tool from `packages/tool-vec-chroma/src/index.ts` and update package-level docs/comments as needed.

## 2. Storage Tool API in `@sisu-ai/tool-vec-chroma`

- [x] 2.1 Add high-level storage tool types and Zod schema in `packages/tool-vec-chroma/src` for communication-derived content payloads.
- [x] 2.2 Implement storage flow in `packages/tool-vec-chroma/src` to chunk/embed content and upsert vectors with metadata.
- [x] 2.3 Add bounded processing behavior for large payloads and return serializable acknowledgements (counts/ids).
- [x] 2.4 Export the new storage tool from `packages/tool-vec-chroma/src/index.ts` and align docs with retrieval/storage split.

## 3. Normalized Embeddings API in Provider Adapters

- [x] 3.1 Define or adopt shared embeddings contract types in adapter/core-facing types so tools can consume a consistent `embed` capability.
- [x] 3.2 Implement embeddings contract support in OpenAI adapter and ensure request/response mapping preserves input order.
- [x] 3.3 Verify cancellation and provider failure semantics are surfaced consistently through the normalized embeddings API.

## 4. Reliability and Tests for Retrieval/Storage Tools

- [x] 4.1 Add unit tests in `packages/tool-vec-chroma/test` (or existing test location) for happy-path query-text retrieval with mocked embeddings/vector query.
- [x] 4.2 Add unit tests for storage happy path and acknowledgment payload shape.
- [x] 4.3 Add unit tests for invalid schema inputs (for example empty `queryText`, empty storage content, invalid `topK`, invalid metadata).
- [x] 4.4 Add unit tests for cancellation behavior and embedding/query/upsert failure propagation.
- [x] 4.5 Add/adjust tests that verify bounded retrieval result count and bounded single-call storage behavior.

## 5. Adapter Embeddings Conformance Tests

- [x] 5.1 Add adapter-level tests to confirm normalized embeddings contract behavior (batch input mapping, stable ordering, error propagation).
- [x] 5.2 Add adapter-level tests for cancellation semantics in embeddings calls.

## 6. Update `examples/openai-rag-chroma` to Two-Agent Flow

- [x] 6.1 Refactor `examples/openai-rag-chroma/src/index.ts` to separate `ingestAgent` and `queryAgent` responsibilities.
- [x] 6.2 Keep ingestion flow functional with Chroma indexing and ensure retrieval flow accepts user prompt input independently.
- [x] 6.3 Register retrieval and storage tooling in the query agent so model tool-calling can fetch and persist semantic context during conversations.
- [x] 6.4 Wire query-agent retrieval/storage tools to OpenAI adapter embeddings via normalized embeddings contract (not provider-specific tool logic).

## 7. Documentation and Validation

- [x] 7.1 Update example/package documentation (including `examples/openai-rag-chroma` docs/readme text) to explain ingestion-first then query workflow, model-driven storage usage, and embedding injection via adapter contract.
- [x] 7.2 Run targeted checks for touched workspaces (for example tool/adapters/example-specific tests).
- [x] 7.3 Run repository validation commands (`pnpm lint`, `pnpm build`, `pnpm test`) and address issues introduced by this change.
