## 1. Core API and type contracts

- [ ] 1.1 Add new execution result and streaming event types in `packages/core/src/types.ts`.
- [ ] 1.2 Export new core execution APIs (non-streaming + streaming) from `packages/core/src/index.ts`.
- [ ] 1.3 Add API-level docs and usage examples for the new contracts in `packages/core/README.md`.

## 2. Shared execution orchestration implementation

- [ ] 2.1 Implement a shared tool-calling orchestration loop in `packages/core/src/util.ts` (or extracted helper file) used by both execution modes.
- [ ] 2.2 Implement non-streaming execution API to return a structured final result without requiring `ctx.messages` scraping.
- [ ] 2.3 Implement streaming execution API to emit typed lifecycle events and support an optional token sink override.
- [ ] 2.4 Ensure cancellation and error propagation is explicit and consistent across both APIs using `ctx.signal`.

## 3. Middleware compatibility and migration path

- [ ] 3.1 Update `packages/middleware/tool-calling/src/index.ts` to remain compatible, preferably by delegating to the new shared core orchestration path.
- [ ] 3.2 Keep `packages/middleware/register-tools/src/index.ts` interoperability intact and covered by tests.
- [ ] 3.3 Update `packages/middleware/tool-calling/README.md` to mark middleware as compatibility/legacy convenience and point to core execution APIs as primary.

## 4. Examples and integration updates

- [ ] 4.1 Update representative examples (including `examples/ollama-stream/src/index.ts`) to use the new core execution APIs.
- [ ] 4.2 Replace direct final-message scraping patterns with returned execution result usage in updated examples.
- [ ] 4.3 Add or update migration snippets in docs that show middleware-first to core execution-first transitions.

## 5. Tests and quality gates

- [ ] 5.1 Add unit tests for shared orchestration behavior in `packages/core/test/` covering tool rounds, defaults, and result shape.
- [ ] 5.2 Add unit tests for streaming event contract and cancellation/error behavior in `packages/core/test/`.
- [ ] 5.3 Add compatibility tests for `mw-tool-calling` and `mw-register-tools` integration in `packages/middleware/tool-calling/test/` and `packages/middleware/register-tools/test/`.
- [ ] 5.4 Run `pnpm lint`, `pnpm build`, and `pnpm test` and resolve any regressions.
