## 1. Scaffold orchestration middleware package

- [x] 1.1 Create `packages/middleware/orchestration/` package structure (`package.json`, `tsconfig.json`, `src/index.ts`, `README.md`, `test/`)
- [x] 1.2 Export public orchestration middleware API and types from `src/index.ts`
- [x] 1.3 Wire package into workspace scripts/config so it builds and tests with Turbo

## 2. Implement delegation-first orchestrator loop

- [x] 2.1 Define orchestrator options and control tool schemas for `delegateTask` and `finish` in `packages/middleware/orchestration/src/index.ts`
- [x] 2.2 Implement orchestration loop that only accepts `delegateTask` or `finish` control actions
- [x] 2.3 Enforce guardrails (`maxDepth`, `maxDelegations`, cancellation propagation via `ctx.signal`)

## 3. Implement delegate task validation and child execution

- [x] 3.1 Define strict delegation input types for the 4-tuple (`instruction`, `context`, `tools`, `model`)
- [x] 3.2 Validate model/tool scope against policy before any child execution
- [x] 3.3 Implement pluggable `ChildExecutor` contract and built-in inline executor
- [x] 3.4 Build child context creation path with curated messages/context and scoped tools/model

## 4. Implement orchestration state and result contracts

- [x] 4.1 Implement initialization and maintenance of `ctx.state.orchestration` (run metadata, policy, totals)
- [x] 4.2 Record step lifecycle entries for each `delegate` and `finish` action
- [x] 4.3 Track per-child records (`status`, `trace`, `usage`, `error`) in orchestration state
- [x] 4.4 Implement structured `DelegationResult` normalization with fixed status enum (`ok`, `error`, `cancelled`, `timeout`)

## 5. Integrate observability and usage rollup

- [x] 5.1 Emit structured orchestration log events (`delegate.start`, `delegate.result`, `finish`) via `ctx.log`
- [x] 5.2 Persist parent-child run linkage fields (`runId`, `parentRunId`) for trace viewer consumption
- [x] 5.3 Roll up child usage metrics into orchestration totals while preserving child-level usage detail

## 6. Add tests for orchestration behavior

- [x] 6.1 Add unit tests for control-surface enforcement (`delegateTask`/`finish` only)
- [x] 6.2 Add unit tests for delegation validation failures (missing tuple fields, disallowed model/tool)
- [x] 6.3 Add unit tests for inline child execution and custom child executor injection
- [x] 6.4 Add unit tests for orchestration state lifecycle updates and child status aggregation
- [x] 6.5 Add unit tests for structured delegation result normalization and status handling
- [x] 6.6 Add unit tests for trace linkage and usage rollup behavior
- [x] 6.7 Add cancellation/timeout tests using `AbortSignal`

## 7. Documentation and examples

- [x] 7.1 Add middleware README usage examples showing delegate-first orchestration flow
- [x] 7.2 Document integration patterns with `register-tools`, `tool-calling`, `skills`, `trace-viewer`, and `usage-tracker`
- [x] 7.3 Create `examples/openai-orchestration/` with runnable orchestrator + delegated child execution flow
- [x] 7.4 Add `examples/openai-orchestration/README.md` with env setup, run command, and expected delegate/finish behavior
- [x] 7.5 Add root script command for the example (e.g. `ex:openai:orchestration`) in `package.json`

## 8. Validate quality gates

- [x] 8.1 Run `pnpm lint` and fix reported issues
- [x] 8.2 Run `pnpm build` and verify all workspaces build
- [x] 8.3 Run `pnpm test` (or targeted middleware tests + full suite as needed) and ensure passing results
