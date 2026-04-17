## Context

The current `@sisu-ai/cli` package provides discovery/scaffolding commands (`list`, `info`, `create`, `install`) and does not yet expose an interactive chat runtime for day-to-day automation. This change adds a first-class `sisu chat` experience that combines a polished terminal UI with controlled tool execution, persistent sessions, and configurable provider/model behavior.

The design must preserve Sisu’s explicit, typed, observable patterns: middleware-based orchestration, deterministic error handling, and cancellation propagation via `AbortSignal`. It must remain additive to existing commands and keep a path open for integration with the planned desktop runtime direction.

## Goals / Non-Goals

**Goals:**
- Add an interactive chat command with modern terminal UX (streaming, statuses, keyboard-driven actions, theme-aware color).
- Add agent automation flow that can execute multi-step tool-driven work in-session.
- Add explicit governance for tool execution (policy checks, confirmations, cancellation, traceability).
- Add durable local session persistence with resume/search/branch workflows.
- Add profile-driven configuration for providers, models, and UX/tool policies.

**Non-Goals:**
- Replacing existing non-chat CLI commands.
- Requiring hosted backend services for v1 chat loop.
- Implementing desktop/macOS runtime packaging in this change.

## Decisions

1. **Introduce a dedicated chat command runtime inside `packages/cli/sisu`**
   - Decision: Implement `sisu chat` as a new command surface with a modular runtime (`ui`, `agent`, `tools`, `session`, `config`).
   - Rationale: Keeps existing CLI behavior stable while enabling focused architecture for interactive workflows.
   - Alternative considered: embedding chat logic directly into current `cli.ts`. Rejected due to maintainability and testability concerns.

2. **Use an event-driven terminal state model**
   - Decision: Represent chat activity as typed events (`user.submitted`, `assistant.token.delta`, `tool.pending`, `tool.approved`, `tool.completed`, `session.saved`, `error.raised`) consumed by renderer + state store.
   - Rationale: Clean separation of orchestration and rendering, easier replay/testing, deterministic recoverability.
   - Alternative considered: tightly coupled imperative rendering. Rejected due to poor replay/debug semantics.

3. **Adopt capability-driven provider/model resolution**
   - Decision: Normalize provider/model metadata into a profile-aware capability contract (streaming/tool/image/reasoning support where available).
   - Rationale: UI and automation policy can be deterministic without provider-specific branching spread through code.
   - Alternative considered: ad hoc provider checks in command handlers. Rejected as brittle.

4. **Enforce policy gates before impactful tool actions**
   - Decision: Tool execution pipeline requires policy evaluation and, for risky operations, explicit user confirmation with preview.
   - Rationale: Safe-by-default automation aligns with “first-class daily use” expectations and trust requirements.
   - Alternative considered: execute all tools automatically unless user disables. Rejected as unsafe.

5. **Persist sessions in a local structured store with event + snapshot layers**
   - Decision: Save normalized conversation/session metadata plus compact event history for resume/search/branch.
   - Rationale: Supports deterministic reload and efficient indexing while preserving traceability.
   - Alternative considered: transcript-only markdown logs. Rejected for weak query/search ergonomics.

6. **Expose integration seams via internal package modules and stable exported types**
   - Decision: Export chat runtime contracts from `packages/cli/sisu/src/chat/*` and reuse existing Sisu adapters/middleware APIs.
   - Rationale: Enables future shared runtime work with desktop clients while keeping current change scoped to CLI.
   - Alternative considered: private, untyped internals. Rejected for long-term interoperability risk.

### Data flow and middleware/tool interactions

- User enters prompt in `sisu chat` composer.
- Chat runtime resolves active profile (provider/model/tool policy/UI preferences).
- Request enters orchestration pipeline with error boundary and cancellation token.
- Provider adapter streams assistant deltas; UI renderer updates timeline incrementally.
- If assistant requests tool action, tool policy engine evaluates risk and may require confirmation.
- Tool execution emits lifecycle events and structured logs, then returns results to orchestration.
- Terminal assistant result is finalized, and session snapshot/events persist to local store.
- Resume/search/branch operations query persisted sessions and reconstruct the state model.

### Error handling and cancellation behavior

- All failures surface as typed errors with stable codes and user-safe messages in UI.
- Cancellation from user interrupts active provider stream and in-flight tool action using `AbortSignal`.
- No silent fallback for denied policy checks; explicit actionable feedback is shown.
- Persistence failures are surfaced and logged with correlation identifiers.

### Integration points and expected public exports

- `packages/cli/sisu/src/cli.ts`: command registration for `chat`.
- `packages/cli/sisu/src/chat/runtime.ts`: chat loop coordinator.
- `packages/cli/sisu/src/chat/events.ts`: event type contracts.
- `packages/cli/sisu/src/chat/tool-policy.ts`: policy + confirmation gate contracts.
- `packages/cli/sisu/src/chat/session-store.ts`: persistence interface + implementation.
- `packages/cli/sisu/src/chat/profiles.ts`: profile resolution and precedence logic.
- Exports from `packages/cli/sisu/src/lib.ts` for reusable chat contracts where needed.

## Risks / Trade-offs

- **[Risk] Terminal UI complexity harms maintainability** → Mitigation: strict module boundaries and renderer/event unit tests.
- **[Risk] Tool policy prompts increase friction** → Mitigation: profile-tunable trust levels with conservative secure defaults.
- **[Risk] Large session history impacts performance** → Mitigation: pagination, indexing, and bounded event replay.
- **[Risk] Provider capability mismatches produce confusing UX** → Mitigation: normalized capability contract with deterministic disabled states.
- **[Risk] Long-running automation may outlive user expectations** → Mitigation: visible progress timeline, cancel controls, and timeout policy settings.
