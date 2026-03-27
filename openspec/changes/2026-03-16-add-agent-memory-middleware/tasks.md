## 1. Scaffold packages and exports

- [ ] 1.1 Create `packages/middleware/memory/` package (`package.json`, `tsconfig.json`, `src/index.ts`, `README.md`, `test/`)
- [ ] 1.2 Create `packages/memory/file/` package (`package.json`, `tsconfig.json`, `src/index.ts`, `README.md`, `test/`)
- [ ] 1.3 Wire both packages into workspace build/test flow

## 2. Define contracts and middleware options

- [ ] 2.1 Define memory middleware options and runtime state types in `packages/middleware/memory/src/index.ts`
- [ ] 2.2 Define dedicated `AgentMemoryStore` contract and serializable `MemoryEntry`/`MemoryWrite` types
- [ ] 2.3 Define session/scope resolution behavior and validation rules
- [ ] 2.4 Define memory write policy contract (explicit signal, confidence threshold, category allow/block lists)

## 3. Implement memory middleware lifecycle

- [ ] 3.1 Implement load phase (resolve identity, call store, update `ctx.state.memory`)
- [ ] 3.2 Implement memory context injection policy (bounded, optional system-message mode)
- [ ] 3.3 Implement save phase (collect write candidates, apply policy gates, persist accepted writes, update state/logs)
- [ ] 3.4 Propagate cancellation via `ctx.signal` across all load/save operations
- [ ] 3.5 Implement dedupe/rejection reason tracking for skipped writes

## 4. Implement memory tools/skills API

- [ ] 4.1 Define `rememberFact` tool schema and handler integration
- [ ] 4.2 Define `searchMemory` tool schema and bounded retrieval integration
- [ ] 4.3 Define `forgetMemory` and `listMemory` tool schemas and handlers
- [ ] 4.4 Ensure all memory tool operations are scoped and traceable

## 5. Implement file-based memory store

- [ ] 5.1 Implement deterministic file path strategy by `agentId/scope/sessionId`
- [ ] 5.2 Implement markdown read/parse with bounded loading support
- [ ] 5.3 Implement markdown append/update write path with safe serialization
- [ ] 5.4 Persist and parse curation metadata (category/source/confidence)
- [ ] 5.5 Implement adapter-level validation and error mapping

## 6. Observability and docs

- [ ] 6.1 Emit structured memory lifecycle logs via `ctx.log`
- [ ] 6.2 Emit policy decision logs (accepted/rejected/skipped with reason)
- [ ] 6.3 Document middleware usage, selective write policy, and session semantics in package READMEs
- [ ] 6.4 Add runnable example (same session remembers, new session isolates)
- [ ] 6.5 Add runnable example showing explicit memory tool usage (`rememberFact` + `searchMemory`)

## 7. Optional phase: memory-manager sub-agent

- [ ] 7.1 Define sub-agent interface for memory curation decisions
- [ ] 7.2 Integrate optional checkpoint-based invocation (not mandatory for MVP)
- [ ] 7.3 Validate sub-agent mode reuses same policy/store contracts

## 8. Tests and quality gates

- [ ] 8.1 Add middleware unit tests (happy path, invalid session, policy reject/skip, cancellation)
- [ ] 8.2 Add memory tool tests (schema validation, scoped reads, policy-gated writes)
- [ ] 8.3 Add file adapter unit tests (read/write, malformed markdown, metadata parsing, isolation by scope/session)
- [ ] 8.4 Add integration-style test covering two-run memory recall with same session
- [ ] 8.5 Run `pnpm lint`
- [ ] 8.6 Run `pnpm build`
- [ ] 8.7 Run `pnpm test` (or targeted package tests + full validation as needed)
