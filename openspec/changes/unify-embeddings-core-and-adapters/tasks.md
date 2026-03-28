## 1. Core embeddings foundation

- [ ] 1.1 Add the generic embeddings client export and supporting option/types in `packages/core/src/`.
- [ ] 1.2 Implement the shared HTTP embeddings request/response normalization path in `packages/core/src/`.
- [ ] 1.3 Preserve `EmbeddingsProvider` contract behavior for batching, model override, count validation, and cancellation.

## 2. Refactor OpenAI embeddings to use core

- [ ] 2.1 Replace adapter-local embeddings types in `packages/adapters/openai/src/index.ts` with imports from `@sisu-ai/core`.
- [ ] 2.2 Reimplement `openAIEmbeddings(...)` as a thin preset over the core embeddings client while preserving current defaults and env handling.
- [ ] 2.3 Update `packages/adapters/openai/README.md` to document both `openAIEmbeddings(...)` and direct core usage where appropriate.

## 3. Add Anthropic and Ollama helpers

- [ ] 3.1 Add `anthropicEmbeddings(...)` to `packages/adapters/anthropic/src/index.ts` with explicit third-party endpoint configuration behavior.
- [ ] 3.2 Update `packages/adapters/anthropic/README.md` to explain that Anthropic model users must configure a compatible external embeddings provider.
- [ ] 3.3 Add `ollamaEmbeddings(...)` to `packages/adapters/ollama/src/index.ts` targeting `/api/embed` with normalized output ordering.
- [ ] 3.4 Update `packages/adapters/ollama/README.md` with local embeddings usage examples and base URL configuration.

## 4. Tests and examples

- [ ] 4.1 Add focused tests in `packages/core` for success, mismatched counts, invalid JSON, provider errors, and `AbortSignal` cancellation.
- [ ] 4.2 Update `packages/adapters/openai/test/openai.test.ts` to verify the wrapper still preserves public behavior.
- [ ] 4.3 Add adapter tests for `anthropicEmbeddings(...)` and `ollamaEmbeddings(...)`, including batch ordering and failure paths.
- [ ] 4.4 Update any embedding or RAG-facing example/docs references that should point to the shared core/helper model.

## 5. Validation

- [ ] 5.1 Run `pnpm lint` and fix any issues introduced by the refactor.
- [ ] 5.2 Run `pnpm build` and verify all affected workspaces compile.
- [ ] 5.3 Run `pnpm test` (or targeted package tests plus the required suite) and confirm embeddings coverage passes.
