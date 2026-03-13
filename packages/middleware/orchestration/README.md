# @sisu-ai/mw-orchestration

Orchestration middleware for delegated multi-agent execution in Sisu.

## Install

```bash
pnpm add @sisu-ai/mw-orchestration
```

## What it does

- Constrains orchestrator control actions to `delegateTask` and `finish`
- Delegates child work using a strict 4-tuple (`instruction`, `context`, `tools`, `model`)
- Tracks runtime state in `ctx.state.orchestration`
- Supports pluggable child executors (built-in inline executor included)
- Emits explicit orchestration events for tracing/observability

## Flow

```mermaid
flowchart TD
  U[User Task] --> O[Orchestrator Middleware]
  O -->|delegateTask| C[Child Executor]
  C --> CC[Scoped Child Context\n instruction + context + tools + model]
  CC --> R[DelegationResult]
  R --> O
  O -->|finish| A[Final Assistant Answer]
```

```mermaid
sequenceDiagram
  autonumber
  participant P as Parent Orchestrator
  participant M as Parent Model
  participant E as Child Executor
  participant CM as Child Model
  participant T as Scoped Tools

  P->>M: generate(messages, control tools)
  M-->>P: assistant tool_call(delegateTask)
  P->>E: execute(request 4-tuple)
  E->>CM: generate(child messages, scoped tools)
  CM-->>E: tool_call(s)
  E->>T: invoke allowed tools only
  T-->>E: tool results
  E-->>P: DelegationResult(status, output, telemetry, trace)
  P->>M: continue with tool message(result)
  M-->>P: tool_call(finish)
  P-->>P: append final assistant answer
```

## Usage

```ts
import { Agent } from "@sisu-ai/core";
import { orchestration } from "@sisu-ai/mw-orchestration";

const app = new Agent()
  .use(
    orchestration({
      allowedModels: ["gpt-4o-mini"],
      maxDelegations: 6,
      defaultTimeoutMs: 30_000,
    }),
  );
```

## Integration notes

- Use with `@sisu-ai/mw-register-tools` to expose parent tool registry for child scoping.
- Child executions are compatible with `@sisu-ai/mw-tool-calling` style tool semantics.
- Usage rollup can consume metrics written by `@sisu-ai/mw-usage-tracker`.
- Traces can be viewed with `@sisu-ai/mw-trace-viewer` using parent-child run linkage in orchestration state.
