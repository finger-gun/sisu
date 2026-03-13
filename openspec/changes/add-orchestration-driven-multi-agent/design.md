## Context

SISU already has the right primitives for orchestration:

- Middleware composition (`Agent`, `compose`)
- Typed execution context (`Ctx`)
- Tool execution loop (`mw-tool-calling`)
- Control-flow primitives (`mw-control-flow`)
- Trace and usage capture (`mw-trace-viewer`, `mw-usage-tracker`)
- Spawned/internal run patterns (`mw-agent-run-api`)

What is missing is a standardized orchestration layer that turns these pieces into **delegated specialized execution** with explicit contracts.

## Goals / Non-Goals

**Goals**

- Keep orchestration SISU-native and middleware-first
- Make multi-agent mean delegated execution, not fixed role-play personas
- Create child executions on demand via 4-tuple (`instruction`, `context`, `tools`, `model`)
- Keep orchestrator behavior minimal (`delegateTask`, `finish`)
- Provide explicit state, structured results, and trace linkage
- Support pluggable child executors

**Non-Goals**

- Building a separate framework/runtime
- Defining static agent roles or role DSLs
- Introducing heavyweight graph DSL for MVP
- Implementing learnable orchestration in first release

## Architecture Recommendation

### Decision: Hybrid (Middleware-first now, minimal core later)

**MVP** should ship as a new middleware package: `@sisu-ai/mw-orchestration`.

Why:

- Matches current extension model in SISU
- Avoids expanding core surface before contract confidence
- Reuses existing middleware behavior and tool-calling loops

**Core path (later, only if needed):**

- Add exported orchestration types to `@sisu-ai/core`
- Add optional helper for child context creation (if repeated patterns emerge)

No core behavioral engine should be added in v1.

## Public API Sketch

```ts
type DelegationContext = {
  messages?: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
  memoryKeys?: string[];
  artifacts?: Array<{ type: string; value: string }>;
};

type DelegationToolScope = {
  allow: string[];
};

type DelegationModelRef = {
  name: string;
  provider?: "openai" | "anthropic" | "ollama" | string;
  opts?: Record<string, unknown>;
};

type DelegateTaskInput = {
  instruction: string;
  context: DelegationContext;
  tools: DelegationToolScope;
  model: DelegationModelRef;
  metadata?: Record<string, unknown>;
};

type DelegateTaskOptions = {
  timeoutMs?: number;
  maxChildTurns?: number;
  idempotencyKey?: string;
};

declare function delegateTask(
  ctx: Ctx,
  input: DelegateTaskInput,
  options?: DelegateTaskOptions,
): Promise<DelegationResult>;
```

Orchestrator should be constrained to two control tools:

- `delegateTask(...)`
- `finish(...)`

## Orchestration State Shape (`ctx.state.orchestration`)

```ts
interface OrchestrationState {
  version: 1;
  runId: string;
  depth: number;
  maxDepth: number;
  status: "running" | "finished" | "aborted" | "error";

  steps: Array<{
    stepId: string;
    type: "delegate" | "finish";
    startedAt: string;
    endedAt?: string;
    status: "ok" | "error" | "cancelled" | "timeout";
    delegationId?: string;
  }>;

  children: Record<string, {
    delegationId: string;
    parentRunId: string;
    instruction: string;
    toolScope: string[];
    model: string;
    status: "running" | "ok" | "error" | "cancelled" | "timeout";
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      costUSD?: number;
    };
    trace?: { runId: string; file?: string };
    error?: { message: string; code?: string; retryable?: boolean };
  }>;

  totals: {
    delegations: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUSD?: number;
  };

  policy: {
    allowParallel: boolean;
    defaultTimeoutMs: number;
    allowedModels: string[];
  };
}
```

## Child Execution Model

Define a pluggable executor contract:

```ts
type ChildExecutionRequest = {
  delegationId: string;
  input: DelegateTaskInput;
  options?: DelegateTaskOptions;
};

type ChildExecutor = (
  request: ChildExecutionRequest,
  parentCtx: Ctx,
) => Promise<DelegationResult>;
```

Built-in executors:

- `inlineChildExecutor` (MVP): in-process child run using curated context + scoped tools/model
- `runApiChildExecutor` (future): execute child through `agent-run-api` for isolation/distribution

## Structured Delegation Result Contract

```ts
interface DelegationResult {
  delegationId: string;
  status: "ok" | "error" | "cancelled" | "timeout";

  output?: {
    summary: string;
    answer?: string;
    artifacts?: Array<{ type: string; value: string }>;
    citations?: string[];
  };

  telemetry: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    model: string;
    toolsAllowed: string[];
    toolsUsed: string[];
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      costUSD?: number;
    };
  };

  trace: {
    runId: string;
    parentRunId: string;
    file?: string;
  };

  error?: {
    name: string;
    message: string;
    code?: string;
    retryable?: boolean;
  };
}
```

## Trace / Observability Model

Parent run events (structured logs):

- `[orchestration] delegate.start`
- `[orchestration] delegate.result`
- `[orchestration] finish`

Trace requirements:

- Every child receives unique `runId` and `parentRunId`
- Parent trace stores child links (no opaque embedding of child logs)
- Tool/model scope for each delegation is visible
- Usage/cost aggregated to orchestration totals

## Ecosystem Compatibility

This design composes with existing SISU packages directly:

- `mw-register-tools`: child tool scoping gate
- `mw-tool-calling`: child tool execution loop
- `mw-skills`: optional skill loading for child context/tooling
- `mw-conversation-buffer` / `mw-context-compressor`: curated child context packing
- `mw-usage-tracker`: child and rolled-up usage
- `mw-trace-viewer`: parent-child run visibility
- `mw-invariants` / `mw-error-boundary`: protocol correctness and failure boundaries

## MVP Scope

- Middleware package with orchestrator loop
- Sequential delegation only
- `delegateTask` + `finish` control operations only
- Inline child executor only
- Strict 4-tuple validation
- State tracking under `ctx.state.orchestration`
- Structured `DelegationResult`
- Depth/iteration/time safeguards

## Deferred Scope

- Parallel delegation and fan-out/fan-in scheduling
- Retry classes and backoff policies
- Cross-child shared memory coordination
- Dynamic model routing by learned policy
- Learned orchestration from historical traces

## Why Not Start With Mid-Term Scope

Starting at mid-term adds several coupled complexities at once:

1. **Concurrency semantics**: parallel children need deterministic merge behavior and cancellation fan-out.
2. **Policy correctness**: dynamic routing needs clear objective functions (quality, latency, cost) and guardrails.
3. **Failure isolation**: nested, parallel failures need explicit parent continuation/fail-fast policy.
4. **Trace density**: graph-shaped runs can quickly become unreadable without additional trace UX.
5. **Contract stability risk**: introducing policy/routing before result contracts mature can force API churn.

The pragmatic path is to ship a strict sequential contract first, collect real traces and outcomes, then layer routing/learning without breaking delegate/finish APIs.

## Forward Path to Mid-Term

- Add optional `modelRouter` hook (rule-based first)
- Add optional `parallelDelegate` with bounded concurrency
- Add policy feedback storage from delegation outcomes
- Add offline evaluator for routing policy evolution
- Keep child contract and state schema backward compatible
