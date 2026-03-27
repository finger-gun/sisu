## Context

SISU already contains the key primitives needed for memory:

- `Ctx.memory` with the `Memory` interface (`get`, `set`, optional `retrieval`)
- Middleware composition as the central extension mechanism
- `ctx.state` namespace for middleware runtime metadata
- Existing patterns for trace/log integration and cancellation handling

What is missing is a standardized middleware that operationalizes memory behavior across a run, and a durable adapter beyond in-process `InMemoryKV`.

## Goals / Non-Goals

**Goals**

- Provide explicit middleware behavior for memory lifecycle:
  - resolve scope/session
  - load memory context
  - inject usable memory context for model/tool decisions
  - persist durable memory updates
- Keep storage backend pluggable and decoupled from middleware policy.
- Start with markdown-on-disk adapter as a practical MVP.
- Make writes selective by default using deterministic policy gates.
- Prefer explicit memory tools/skills for read/write actions.

**Non-Goals**

- Full long-term memory ranking, embeddings, and hybrid retrieval in v1.
- Hidden automatic memory writes without explicit middleware policy.
- Mandatory sub-agent orchestration in MVP.

## Architecture Recommendation

### Decision: Three-layer behavior model (policy middleware + tools + storage adapter)

1. **Policy layer**: `@sisu-ai/mw-memory`
   - orchestrates when memory is loaded/saved
   - manages session and scope resolution
   - records runtime state under `ctx.state.memory`

2. **Agent action layer**: memory tools/skills
   - explicit operations: `rememberFact`, `searchMemory`, `forgetMemory`, `listMemory`
   - auditable read/write actions in traces/logs
   - enables model to decide when memory actions are needed

3. **Storage layer**: pluggable memory adapter(s)
   - MVP: file-backed markdown implementation
   - Future: Postgres/S3 adapters with same behavioral contract

This mirrors existing SISU patterns (middleware for behavior, adapters/tools for I/O).

## Data Flow

```text
Incoming run
  │
  ├─ Resolve memory identity
  │    (agentId, scope, sessionId)
  │
  ├─ Load bounded memory snapshot
  │    from configured store (category-aware)
  │
  ├─ Expose memory context
  │    - optional system message injection
  │    - ctx.state.memory.loaded
  │
  ├─ Execute remaining middleware + model/tools
  │    - model may call memory tools
  │    - policy gates evaluate write candidates
  │
  └─ Persist memory updates
       - only for accepted writes
       - append/update markdown entries
       - update ctx.state.memory.persisted metadata
```

## Middleware Shape

Expected middleware options (illustrative):

```ts
type MemoryScope = "session" | "user" | "global";

interface MemoryMiddlewareOptions {
  agentId: string;
  scope?: MemoryScope;
  resolveSessionId?: (ctx: Ctx) => string | undefined;
  loadLimit?: number;
  injectAsSystemMessage?: boolean;
  persistPolicy?: "always" | "assistant-only" | "explicit" | "policy-gated";
  writePolicy?: MemoryWritePolicy;
  store: AgentMemoryStore;
}

interface MemoryWritePolicy {
  requireExplicitSignal?: boolean;
  minConfidence?: number;
  allowedCategories?: Array<"identity" | "preference" | "constraint" | "goal" | "fact">;
  blockedCategories?: Array<"transient" | "secret" | "raw-transcript">;
  retentionByCategory?: Partial<Record<string, "short" | "medium" | "long">>;
}
```

## Storage Contract

Define a dedicated memory-store contract for the middleware, instead of overloading generic KV semantics:

```ts
interface AgentMemoryStore {
  load(input: {
    agentId: string;
    scope: "session" | "user" | "global";
    sessionId?: string;
    categories?: string[];
    limit?: number;
    signal?: AbortSignal;
  }): Promise<{ entries: MemoryEntry[]; version?: string }>;

  save(input: {
    agentId: string;
    scope: "session" | "user" | "global";
    sessionId?: string;
    writes: MemoryWrite[];
    expectedVersion?: string;
    signal?: AbortSignal;
  }): Promise<{ version?: string }>;
}
```

`MemoryEntry`/`MemoryWrite` remain serializable and minimal in v1.

`MemoryWrite` SHOULD include metadata fields for policy decisions (`category`, `confidence`, `source`, `explicitSignal`).

## File Storage Adapter (MVP)

Recommended file layout:

```text
<baseDir>/
  <agentId>/
    session/<sessionId>.md
    user/<userId>.md
    global.md
```

Markdown format objective:

- human-readable memory timeline
- simple deterministic parsing/appending
- include timestamp + source metadata headers
- include category/confidence metadata for later curation

The adapter should support bounded reads (`limit`) and cancellation (`AbortSignal`) for safety.

## Session & Scope Resolution

Order of precedence:

1. explicit middleware option callback (`resolveSessionId(ctx)`)
2. well-known state key (`ctx.state.memorySessionId`)
3. undefined session (allowed only for non-session scopes or explicit fallback policy)

The middleware should fail fast (or no-op by configuration) on invalid session identifiers.

## Prompt/Context Integration Strategy

V1 should prefer explicit and conservative injection:

- Optionally inject a synthesized system message with top memory items
- Do not dump unbounded raw memory into prompt
- Keep token budget controls (`loadLimit`, char limits)
- Prioritize categories likely to be useful for continuity (identity/preferences/constraints)

Later versions can add semantic retrieval and ranking (potential integration with vector packages).

## Write Decision Policy (MVP)

Memory writes SHOULD default to selective behavior:

1. Accept writes with explicit user signal (`"remember this"`, `"for next time"`, direct personal profile statements).
2. Accept inferred facts only when confidence meets threshold and category is allowed.
3. Reject transient or sensitive content categories by default.
4. Deduplicate semantically equivalent facts before persisting.

This prevents noisy memory growth and aligns persistence with user intent.

## Tools/Skills Integration

Preferred explicit tool surface:

- `rememberFact(input)`: propose and persist a memory fact (subject to policy)
- `searchMemory(input)`: retrieve relevant scoped memory
- `forgetMemory(input)`: remove/deactivate memory entries
- `listMemory(input)`: inspect memory entries for transparency/debugging

Middleware remains authoritative for scoping, policy gates, and store interaction; tools provide model-accessible affordances.

## Optional Memory-Manager Sub-Agent (Phase 2)

Define an optional orchestration pattern where a dedicated memory-manager sub-agent:

- receives conversation summary + candidate facts
- decides what to store or prune using the same policy contract
- decides what to retrieve for future runs based on scope and task intent

MVP remains single-agent with tools. Sub-agent mode is additive and uses the same store/policy interfaces.

## Runtime State Namespace (`ctx.state.memory`)

```ts
interface MemoryRuntimeState {
  scope: "session" | "user" | "global";
  sessionId?: string;
  loadedCount: number;
  loadedAt?: string;
  persistedCount: number;
  persistedAt?: string;
  skippedCount?: number;
  writePolicy?: {
    accepted: number;
    rejected: number;
    reasons?: string[];
  };
  storeKind?: "file" | "postgres" | "s3" | string;
  warnings?: string[];
}
```

## Error Handling and Cancellation

- Respect `ctx.signal` for load/save operations.
- Surface real `Error` objects; include context (`scope`, `sessionId`) without leaking secrets.
- Default behavior: fail the run on storage errors (configurable soft-fail can be added later if required).
- Never catch-and-silence adapter failures.

## Observability

Structured log events:

- `[memory] load.start`
- `[memory] load.result`
- `[memory] save.start`
- `[memory] save.result`
- `[memory] save.skipped` (if policy skips write)

Trace compatibility should be additive through existing trace logger middleware.

## Rollout Plan

1. Ship middleware + file adapter + focused example.
2. Ship memory tools/skills and policy-gated write defaults.
3. Validate ergonomics and state shape via real usage.
4. Add production adapters (Postgres/S3) without changing middleware API.
5. Add optional semantic retrieval mode (vector/RAG integration) in follow-up change.
6. Add optional memory-manager sub-agent orchestration.

## Open Questions

- Should explicit user confirmation be required before writing inferred profile data?
- How should retention/expiry be encoded in markdown for future compaction?
- Should sub-agent mode run every turn or only at checkpoints (end-of-run / interval)?
