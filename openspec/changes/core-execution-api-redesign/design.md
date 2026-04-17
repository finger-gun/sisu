## Context

Sisu currently exposes core generation primitives (`generate`/helpers) and middleware orchestration (`mw-tool-calling`) as separate paths. This creates fragmented data flow: non-streaming and streaming flows differ, and users often inspect `ctx.messages` directly to extract final output. The redesign introduces a core execution layer that unifies orchestration semantics while preserving middleware composability and adapter portability.

Stakeholders are framework users building production agents, example maintainers, and CLI/runtime maintainers that need consistent behavior across modes.

## Goals / Non-Goals

**Goals:**
- Provide first-class core APIs for non-streaming and streaming turn execution with shared tool-calling orchestration semantics.
- Return structured non-streaming results so users do not need to scrape `ctx.messages` for the assistant output.
- Emit a stable streaming event model covering tokens, tool lifecycle, completion, and errors.
- Keep tool registration (`mw-register-tools`) and middleware composition intact while shifting orchestration ownership to core.
- Preserve cancellation and error propagation behavior via `AbortSignal` and explicit errors.

**Non-Goals:**
- Removing middleware support in this change.
- Forcing provisional token streaming before tool rounds complete.
- Changing provider adapter contracts beyond what is needed to support unified execution.
- Introducing hidden mutable global context in `Agent`.

## Decisions

### 1. Core execution APIs become the primary orchestration surface

Decision:
- Add core APIs (names to finalize during implementation) for:
  - Non-streaming turn execution (default mode).
  - Streaming turn execution (explicit mode).

Rationale:
- Matches expected user mental model (one place to execute a turn) and removes middleware-first confusion.

Alternatives considered:
- Keep orchestration in middleware and improve docs only.
  - Rejected: does not resolve split behavior or API ergonomics.

### 2. Shared internal orchestration engine for stream and non-stream modes

Decision:
- Implement one internal tool-calling loop used by both non-streaming and streaming entry points.
- Default behavior: tools enabled when registered, non-streaming output transport unless streaming API is used.

Rationale:
- Prevents behavior drift between two public paths and simplifies testing.

Alternatives considered:
- Separate implementations per mode.
  - Rejected: likely divergence over time, duplicated bug fixes.

### 3. Stable execution outputs and event contracts

Decision:
- Non-streaming returns a typed result object (assistant message/text, execution metadata, tool execution records, usage where available).
- Streaming emits typed events (`token`, tool-start/tool-finish, assistant-message, done, error) and supports an optional sink for token transport.

Rationale:
- Avoids implicit `ctx.messages` scraping and supports CLI/UI/backend consumers with explicit contracts.

Alternatives considered:
- Keep only `ctx` mutation and ad-hoc stream writes.
  - Rejected: opaque contract and poor DX.

### 4. Middleware compatibility strategy

Decision:
- Keep `mw-register-tools` as-is.
- Keep `mw-tool-calling` operational but reposition as compatibility/legacy convenience, not default guidance.
- Implement middleware wrappers (if needed) as thin adapters around the new core execution engine.

Rationale:
- Minimizes ecosystem breakage while moving users to clearer primitives.

Alternatives considered:
- Hard-remove `mw-tool-calling`.
  - Rejected: unnecessary breakage for existing integrations.

### 5. Cancellation and error handling

Decision:
- Propagate `ctx.signal` through model/tool execution in all rounds.
- Abort immediately on cancellation with explicit error signaling.
- Surface tool validation/execution errors as explicit failures (no silent fallbacks).

Rationale:
- Maintains existing reliability expectations and testability.

## Data Flow and Integration

1. Caller creates `ctx` via `createCtx` and registers tools (typically with `mw-register-tools`).
2. Caller invokes core execution API in non-streaming or streaming mode.
3. Execution engine performs provider call(s), detects tool calls, resolves/executes tools, and loops until final assistant response.
4. Output transport differs by mode:
   - Non-streaming: returns result object and appends canonical assistant/tool messages.
   - Streaming: emits event stream (and optional sink writes), then returns final completion metadata/event.

Integration points:
- `@sisu-ai/core` exports new execution types and functions.
- Existing adapters continue via current generate/stream interfaces.
- Middleware stack remains available for registration, guardrails, tracing, and policy controls.

Expected public exports:
- Core execution API entry points for non-stream and stream modes.
- Execution result/event types.
- Optional compatibility helpers for middleware bridging.

## Risks / Trade-offs

- [Risk] API naming ambiguity between old helpers and new execution APIs. → Mitigation: clearly document primary APIs and deprecate old guidance with examples.
- [Risk] Streaming/tool-call semantics may vary by provider quirks. → Mitigation: enforce provider-agnostic event contract and add adapter conformance tests.
- [Risk] Backward-compat wrappers may hide migration urgency. → Mitigation: add deprecation notes and migration examples in docs/changelogs.
- [Risk] Added abstraction could increase implementation complexity. → Mitigation: shared internal loop with focused unit tests and minimal public surface.

## Migration Plan

1. Introduce new core execution APIs and types behind additive exports.
2. Update examples and docs to use core execution-first patterns.
3. Keep `mw-tool-calling` functional and document it as compatibility/legacy convenience.
4. Provide migration snippets from middleware-first flow to core execution flow.
5. After adoption window, evaluate stricter deprecation lifecycle.

Rollback strategy:
- Because new APIs are additive, rollback is low risk: documentation/examples can revert while existing middleware paths remain available.

## Open Questions

- Final public API names (`execute`/`executeStream` vs alternatives).
- Whether streaming should support only final-answer token emission initially or also provisional token policy.
- Whether token sink remains in context as fallback or is strictly call-option driven in the new API.
