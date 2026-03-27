## 1. Spec

- [x] 1.1 Add a new OpenSpec change for the Vectra adapter and example.
- [x] 1.2 Add active specs for `vectra-vector-store-adapter` and `rag-vectra-dual-agent-example`.

## 2. Adapter Package

- [x] 2.1 Add `packages/vector/vectra` with package metadata, README, and build config.
- [x] 2.2 Implement `createVectraVectorStore(...)` over Vectra `LocalIndex`.
- [x] 2.3 Add tests covering upsert, query, delete, namespace isolation, and missing-index queries.

## 3. Example

- [x] 3.1 Copy `examples/openai-rag-chroma` to `examples/openai-rag-vectra`.
- [x] 3.2 Replace Chroma wiring with `@sisu-ai/vector-vectra` and local folder configuration.
- [x] 3.3 Add README guidance for zero-infrastructure local execution.

## 4. Docs and Validation

- [x] 4.1 Update vector/RAG docs and the root README to list Vectra as a maintained backend.
- [ ] 4.2 Install dependencies and run targeted build, typecheck, lint, and test validation.
