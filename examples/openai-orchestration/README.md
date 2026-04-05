# OpenAI Orchestration Example

Demonstrates orchestration-driven delegated execution with `@sisu-ai/mw-orchestration`.

## What this example shows

- Orchestrator control surface constrained to `delegateTask` and `finish`
- Three specialized delegated phases: research → risk review → synthesis
- Per-delegation tool/model scoping (different child tool allow-lists per phase)
- Trace generation with explicit parent-child linkage metadata

## Orchestration design

```mermaid
flowchart LR
  Q[User Query] --> O[Orchestrator]
  O --> D1[Phase 1 delegateTask<br/>Research]
  D1 --> C1[Child 1<br/>getWeather + getCityEvents]
  C1 --> O
  O --> D2[Phase 2 delegateTask<br/>Risk Review]
  D2 --> C2[Child 2<br/>assessOutdoorRisk]
  C2 --> O
  O --> D3[Phase 3 delegateTask<br/>Synthesis]
  D3 --> C3[Child 3<br/>summarizePlan]
  C3 --> O
  O --> F[finish answer]
```

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant O as Orchestrator
  participant R as Research Child
  participant K as Risk Child
  participant S as Synthesis Child

  U->>O: "Plan a weather-aware day"
  O->>R: delegateTask(research scope)
  R-->>O: DelegationResult(research notes)
  O->>K: delegateTask(risk scope)
  K-->>O: DelegationResult(risk assessment)
  O->>S: delegateTask(synthesis scope)
  S-->>O: DelegationResult(final draft)
  O-->>U: finish(answer + risk note + backup)
```

## Run

- Quick start: `pnpm ex:openai:orchestration`
- Alternate: `TRACE_HTML=1 pnpm --filter=openai-orchestration dev -- --trace -- "Plan a weather-aware day in Malmö"`

## Environment

- `API_KEY` (required)
- `MODEL` (optional, default `gpt-5.4`)
- `BASE_URL` (optional, for OpenAI-compatible endpoints)
- `TRACE_HTML=1` and/or `TRACE_JSON=1` for trace output

## Expected behavior

1. The orchestrator receives the user task.
2. It delegates a **research** child (`getWeather`, `getCityEvents`).
3. It delegates a **risk** child (`assessOutdoorRisk`).
4. It delegates a **synthesis** child (`summarizePlan`).
5. It calls `finish` with a final plan + risk note + backup option.

In logs you should typically see multiple `delegate.start` / `delegate.result` events before `finish`.
