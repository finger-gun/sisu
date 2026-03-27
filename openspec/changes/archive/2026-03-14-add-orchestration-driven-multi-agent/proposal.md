## Why

SISU needs first-class orchestration-driven multi-agent support for tasks that benefit from delegated specialized execution. Today, SISU has excellent primitives (middleware composition, tool-calling, tracing, skills, usage tracking), but no native way for one orchestrator to spawn scoped child executions on demand with explicit contracts.

The target is **not** role-play agents with fixed personas. The target is **delegation as execution**: each child is created just-in-time as a 4-tuple:

- `instruction`
- `context`
- `tools`
- `model`

This aligns with SISU philosophy (small, explicit, composable, observable) and with production needs (traceability, tool/model control, safety boundaries, and cost governance).

## What Changes

- New middleware package: `@sisu-ai/mw-orchestration`
  - Orchestrator loop constrained to two operations: `delegateTask` and `finish`
  - Child creation from 4-tuple with strict validation
  - Scoped tool/model execution per child
  - Structured delegation result contract
  - Explicit orchestration state under `ctx.state.orchestration`

- New pluggable child executor contract
  - MVP default: inline in-process child executor
  - Future: remote/distributed executor integration via existing `agent-run-api`

- New OpenAI example demonstrating orchestration
  - Add `examples/openai-orchestration/` to demonstrate delegated child execution end-to-end
  - Include trace output and scoped tool/model delegation behavior

- Trace/observability additions
  - Parent-child run linkage
  - Delegation lifecycle events
  - Roll-up usage/cost accounting at orchestration level

## Capabilities

### New Capabilities

- `orchestration-delegation`: middleware-first delegated execution with explicit child scope
- `orchestration-state`: standardized state namespace for orchestration runtime data
- `orchestration-result-contract`: structured child output for deterministic parent reasoning
- `orchestration-openai-example`: runnable OpenAI example showcasing orchestration middleware usage and traces

### Modified Capabilities

- `trace-viewer` interoperability (additive): parent-child linkage and delegation event clarity
- `usage-tracker` interoperability (additive): usage rollup from child runs

## Impact

**Affected Code:**

- New: `packages/middleware/orchestration/`
- Additive updates likely in docs/examples for orchestration patterns
- No required changes to existing adapters/tools for MVP

**Dependencies:**

- Reuses existing SISU core and middleware contracts
- No mandatory new runtime dependencies required for MVP

**Systems:**

- Integrates with existing middleware stack (`register-tools`, `tool-calling`, `skills`, `trace-viewer`, `usage-tracker`, `invariants`, `error-boundary`)
- Compatible with current adapters (OpenAI, Anthropic, Ollama) via existing `LLM` interface

**Breaking Changes:**

- None (purely additive)

## Why Not Jump Straight to Mid-Term Scope

Mid-term scope is still the direction, but making it initial scope would combine multiple independent complexity dimensions at once:

- Parallel delegation scheduling + cancellation fan-out
- Retry/timeout policy matrix per child/task class
- Cross-child memory and shared artifact consistency
- Dynamic model/tool routing policy with measurable quality signals
- Failure isolation semantics across nested orchestration depth
- Trace UX for dense task graphs (not just parent-child chains)

Delivering all of this in v1 raises risk of leaky abstractions and unstable API contracts. A narrow MVP gives us concrete traces and usage data to validate contracts before adding policy learning and routing intelligence.

## Delivery Strategy

- Phase 1 (MVP): sequential delegated execution with strict 4-tuple scope and explicit traces
- Phase 2 (near/mid-term): policy-based model/tool routing and optional parallel child execution
- Phase 3 (mid/long-term): learnable orchestration from trace outcomes without changing public delegate/finish contract
