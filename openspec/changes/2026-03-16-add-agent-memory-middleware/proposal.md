## Why

SISU currently provides a `Memory` abstraction and an in-process default store (`InMemoryKV`), but it does not provide a first-class middleware for long-lived agent memory behavior (load relevant memory into context, then persist new memory after the run).

Users who want agents to "remember" across turns/sessions currently need to build custom logic themselves. This results in duplicated patterns and inconsistent session handling.

We need an additive, middleware-first memory capability that starts simple (file-backed markdown notes) while establishing a clean path to durable backends (Postgres, S3, vector retrieval) later.

## Goals

- Add a memory behavior middleware that can read and write persistent agent memory.
- Introduce explicit session scoping so callers can choose/rotate memory contexts.
- Ship an initial file-system-backed memory adapter for practical local usage.
- Keep architecture backend-agnostic so future adapters (Postgres/S3/etc.) are pluggable.
- Preserve SISU design principles: explicit behavior, composable middleware, structured state/logging.
- Make memory persistence selective and policy-driven (not "store every turn").
- Add explicit tools/skills so memory read/write operations are auditable and intentional.
- Define an optional memory-manager sub-agent pattern for future autonomous memory curation.

## Non-Goals

- Build a full semantic memory/RAG platform in v1.
- Introduce breaking changes to `Ctx`, `ToolContext`, or existing middleware APIs.
- Replace existing `ctx.memory` contract in this change.
- Implement distributed consistency guarantees across multi-instance deployments.
- Require sub-agent orchestration for the MVP path.

## What Changes

- New middleware package: `@sisu-ai/mw-memory`
  - Loads memory context at run start (based on session/user scope)
  - Persists memory updates at run end when policy allows
  - Stores runtime bookkeeping under `ctx.state.memory`
  - Applies write policy gates (explicit signal, confidence threshold, category rules)

- New memory tool/skill package surface (name TBD with repo conventions)
  - `rememberFact`: write durable memory entries
  - `searchMemory`: fetch relevant entries for current run
  - `forgetMemory`: remove/deprecate specific entries
  - `listMemory`: inspect scoped memory entries
  - Tool calls become the preferred write/read path for agent-initiated memory behavior

- New memory storage package: `@sisu-ai/memory-file` (or equivalent naming aligned with repo conventions)
  - File-system-backed storage adapter for memory records
  - Markdown storage format for human readability/debugging

- Session-aware memory semantics
  - Configurable session key resolution from explicit options and/or `ctx.state`
  - Deterministic memory key strategy (`scope + agent + session`)

- Memory content policy
  - Durable categories: identity, preferences, long-lived constraints, recurring goals
  - Excluded categories: transient one-off requests, raw transcript dumps, secrets
  - Category-level retention policy support (e.g. long-lived identity, shorter-lived preferences)

- Documentation + example updates
  - Example showing memory across two or more turns with same session id
  - Example showing session switch produces independent memory threads

## Capabilities

### New Capabilities

- `agent-memory-middleware`: middleware lifecycle for loading and persisting agent memory
- `memory-file-storage`: pluggable file-based storage adapter for persistent memory
- `memory-session-scoping`: standardized session/scope keying behavior for memory isolation
- `memory-tools-and-skills`: explicit, audited memory read/write tool surface
- `memory-curation-policy`: deterministic decision policy for what/when to store

### Modified Capabilities

- `trace-viewer` interoperability (additive): memory load/save lifecycle events visible in traces

## API Surface (Expected)

- New middleware export(s) under `@sisu-ai/mw-memory` (e.g., `memoryMiddleware(...)`)
- New file-storage export(s) under `@sisu-ai/memory-file` (e.g., `createFileMemoryStore(...)`)
- No breaking changes to existing public APIs

## Target Audience

- Developers building conversational agents that require persistence between runs
- Developers starting with local disk persistence before moving to database/object-store backends
- Teams needing explicit, inspectable memory behavior rather than implicit provider features

## Success Metrics / Acceptance Criteria

- Memory can be persisted and reloaded for the same session across independent runs.
- Different session ids produce isolated memory views.
- Middleware emits structured memory lifecycle logs (load/save/result).
- Cancellation/error paths do not silently corrupt memory writes.
- Tests cover happy path, invalid session inputs, and cancellation/error handling.
- Memory writes are selective: non-durable turns are skipped by default.
- Explicit memory tool invocations are traceable in logs/traces.
- High-confidence inferred facts can be persisted only when policy gates pass.

## Impact

**Affected code (planned):**

- New: `packages/middleware/memory/`
- New: `packages/memory/file/` (or equivalent package path/name)
- Docs and example additions in `examples/` and package READMEs

**Dependencies:**

- Reuses existing `Memory`/`Ctx` contracts in `@sisu-ai/core`
- No mandatory external service dependency for MVP (file system only)

**Breaking changes:**

- None (additive only)
