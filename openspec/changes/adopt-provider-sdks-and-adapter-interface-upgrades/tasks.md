## 1. Dependency and package setup

- [ ] 1.1 Add official SDK runtime dependencies to adapter packages: `openai` in `packages/adapters/openai/package.json`, `@anthropic-ai/sdk` in `packages/adapters/anthropic/package.json`, and `ollama` in `packages/adapters/ollama/package.json`.
- [ ] 1.2 Ensure dependency scope remains adapter-local (no SDK dependencies added to `packages/core` or repository root runtime dependencies).
- [ ] 1.3 Run `pnpm install` and verify lockfile/workspace resolution updates are clean and reproducible.

## 2. OpenAI adapter SDK transport migration

- [ ] 2.1 Refactor `packages/adapters/openai/src/index.ts` to replace direct HTTP transport calls with official `openai` SDK client requests while preserving `openAIAdapter` public API.
- [ ] 2.2 Keep Sisu message normalization and tool schema conversion logic intact, updating only transport and provider response parsing integration points.
- [ ] 2.3 Preserve streaming support by mapping SDK stream events into Sisu `ModelEvent` (`token`, then final `assistant_message`).
- [ ] 2.4 Propagate `GenerateOptions.signal` and maintain deterministic error mapping without silent fallback behavior.

## 3. Anthropic adapter SDK transport migration

- [ ] 3.1 Refactor `packages/adapters/anthropic/src/index.ts` to replace direct HTTP transport with `@anthropic-ai/sdk` while preserving `anthropicAdapter` public API.
- [ ] 3.2 Preserve tool-calling mappings (`tool_use`, `tool_result`) and existing normalized tool-call outputs.
- [ ] 3.3 Preserve streaming behavior by mapping Anthropic SDK stream deltas to Sisu `ModelEvent` contract.
- [ ] 3.4 Ensure cancellation/retry/timeout semantics remain explicit and documented after transport migration.

## 4. Ollama adapter SDK transport migration

- [ ] 4.1 Refactor `packages/adapters/ollama/src/index.ts` to replace direct HTTP transport with `ollama` client while preserving `ollamaAdapter` public API.
- [ ] 4.2 Preserve content + image normalization paths and map SDK responses to normalized Sisu assistant messages/tool calls.
- [ ] 4.3 Preserve streaming behavior via SDK async iteration mapped to Sisu `ModelEvent`.
- [ ] 4.4 Preserve abort/error propagation behavior for request and image preprocessing paths.

## 5. Adapter interface conformance hardening

- [ ] 5.1 Introduce shared test utilities (or conformance fixtures) for cross-adapter checks under adapter test directories (e.g., `packages/adapters/*/test`).
- [ ] 5.2 Add conformance tests that verify normalization of shared `GenerateOptions` semantics (`toolChoice`, `stream`, cancellation signal behavior).
- [ ] 5.3 Add conformance tests for normalized tool-call mapping shape `{ id, name, arguments }`.
- [ ] 5.4 Add conformance tests for streaming event ordering and final assistant message emission.
- [ ] 5.5 Add conformance tests for actionable error propagation with no synthetic success responses.

## 6. Migration compatibility and documentation

- [ ] 6.1 Update adapter READMEs in `packages/adapters/openai/README.md`, `packages/adapters/anthropic/README.md`, and `packages/adapters/ollama/README.md` with SDK-backed transport notes and compatibility expectations.
- [ ] 6.2 Document any observable behavior differences and required migration guidance for users.
- [ ] 6.3 Ensure examples relying on these adapters still run without API-breaking usage changes (update example docs only if behavior or options changed).

## 7. Validation and quality gates

- [ ] 7.1 Run targeted adapter tests: `pnpm --filter @sisu-ai/adapter-openai test`, `pnpm --filter @sisu-ai/adapter-anthropic test`, and `pnpm --filter @sisu-ai/adapter-ollama test`.
- [ ] 7.2 Run repository lint: `pnpm lint`.
- [ ] 7.3 Run repository build: `pnpm build`.
- [ ] 7.4 Run repository test suite: `pnpm test`.
