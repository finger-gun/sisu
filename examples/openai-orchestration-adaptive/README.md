# OpenAI Adaptive Orchestration Example

Demonstrates **policy-bounded autonomous delegation** with `@sisu-ai/mw-orchestration`.

Unlike the fixed-phase orchestration example, this one does **not** force a predefined sequence. The orchestrator decides dynamically whether delegation is worthwhile.

## What this example demonstrates

- The model controls **when/how often** to call `delegateTask`
- Delegations remain strictly scoped (tools/model per child)
- Orchestrator stops when confidence is sufficient, then calls `finish`
- Full traceability through `delegate.start`, `delegate.result`, and `finish`

## Delegation model

```mermaid
flowchart TD
  U[User request] --> O[Adaptive orchestrator]
  O --> D{Need more evidence?}
  D -->|Yes| C[delegateTask with scoped tools/model]
  C --> R[DelegationResult]
  R --> O
  D -->|No| F[finish answer]
```

```mermaid
sequenceDiagram
  autonumber
  participant O as Orchestrator
  participant C1 as Child A
  participant C2 as Child B

  O->>C1: delegateTask (weather + options)
  C1-->>O: result
  O->>C2: delegateTask (risk evaluation)
  C2-->>O: result
  Note over O: Decide if more delegation adds value
  O-->>O: finish(answer)
```

## Run

- Quick start: `pnpm ex:openai:orchestration-adaptive`
- Alternate with prompt:
  - `TRACE_HTML=1 pnpm --filter=openai-orchestration-adaptive dev -- --trace -- "Plan an evening in Malmö with fallback options"`

## Environment

- `API_KEY` (required)
- `MODEL` (optional, default `gpt-4o-mini`)
- `BASE_URL` (optional, for OpenAI-compatible endpoints)
- `TRACE_HTML=1` and/or `TRACE_JSON=1` for trace output
