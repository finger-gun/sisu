## Context

The change introduces a macOS-first desktop product where a native SwiftUI client is paired with a bundled local Sisu runtime written in Node/TypeScript. The current Sisu repository already provides provider-agnostic adapters, middleware-driven orchestration, tools, tracing, and strong type contracts, but these capabilities are exposed primarily as framework primitives rather than a first-party desktop user product.

The design must support local-first workflows (especially Ollama), preserve provider portability (OpenAI/Anthropic/Ollama), and deliver a low-latency, resilient chat experience. It also needs to set up reusable runtime contracts for future Apple-platform clients without requiring iOS local inference in v1.

Stakeholders include end users of the desktop app, Sisu maintainers, and future mobile client teams that will consume the same runtime protocol.

## Goals / Non-Goals

**Goals:**
- Define a clear runtime/client architecture for macOS with explicit integration boundaries.
- Standardize a local protocol for chat streaming, provider/model management, conversation history/search, and branch creation.
- Ensure runtime behavior supports cancellation, restart safety, and observable failures.
- Keep runtime orchestration aligned with existing Sisu middleware patterns and typed tool contracts.

**Non-Goals:**
- Defining iOS local-runtime/on-device model execution details.
- Reworking existing core adapter internals beyond what is needed for desktop runtime integration.
- Introducing cloud-only orchestration as a requirement for v1 desktop functionality.

## Decisions

1. **Native SwiftUI app + local Node runtime process**
   - Decision: Use SwiftUI for UI and UX; bundle a Node runtime process for orchestration.
   - Rationale: SwiftUI provides macOS-native responsiveness and integration, while Node/TS reuses Sisu’s mature provider and middleware ecosystem.
   - Alternative considered: Electron + React. Rejected for v1 due to weaker macOS-native feel and higher resource overhead for the target “premium local-first” experience.

2. **Local transport over localhost HTTP + streaming channel**
   - Decision: Runtime exposes localhost HTTP endpoints plus streaming (SSE or WebSocket) for token events and status updates.
   - Rationale: Keeps protocol debuggable, typed, and language-agnostic; easy Swift integration via URLSession/WebSocket APIs.
   - Alternative considered: direct process pipes only. Rejected because it complicates protocol evolution, observability tooling, and multi-client reuse.

3. **Capability-driven model metadata contract**
   - Decision: Runtime returns provider/model capability metadata (streaming, image-input support, tool support, context limits when known) in a normalized schema.
   - Rationale: UI can make deterministic product decisions (enable/disable features, warnings, defaults) without provider-specific branching.
   - Alternative considered: hardcoded per-provider UI rules. Rejected due to fragility and poor extensibility.

4. **Conversation and branch semantics owned by runtime domain**
   - Decision: Runtime owns canonical thread/message/branch persistence and search indexes, exposing explicit APIs to create branches from a source message.
   - Rationale: Prevents divergence between clients and keeps conversation graph logic testable in one place.
   - Alternative considered: client-owned persistence with thin runtime proxy. Rejected because it duplicates logic and complicates future multi-client consistency.

5. **Observability and recovery are first-class requirements**
   - Decision: Runtime emits structured logs and trace IDs for requests/streams; startup includes health checks and recovery of incomplete sessions.
   - Rationale: Desktop users need diagnosable failures; maintainers need reproducible traces; aligns with Sisu observability principles.
   - Alternative considered: minimal logs only. Rejected for insufficient supportability.

6. **Cancellation and timeout behavior propagated end-to-end**
   - Decision: Client cancellation maps to runtime abort signals and provider cancellation paths where supported.
   - Rationale: Prevents token waste and stale UI; matches existing middleware guidance for AbortSignal propagation.
   - Alternative considered: soft cancel in UI only. Rejected as it leaves backend work running and risks inconsistent state.

### Data flow and middleware/tool interactions

- SwiftUI sends chat command (`threadId`, prompt content, attachments, provider/model override) to runtime.
- Runtime composes Sisu pipeline with error boundary, guardrails/invariants, conversation buffering/persistence middleware, provider adapter, and optional tool-calling middleware.
- Runtime streams incremental events to client (`message.started`, `token.delta`, `tool.invoked`, `message.completed`, `message.failed`).
- Runtime persists canonical messages, usage metadata, and branch linkage after completion/failure.
- Client updates UI optimistically from stream and reconciles with terminal event payload.

### Error handling and cancellation

- Errors are surfaced as typed protocol errors with machine-readable codes and user-safe messages.
- Runtime does not silently swallow provider/tool errors; they are returned via terminal stream event + request log correlation ID.
- Cancel requests propagate to AbortSignal in orchestration path and result in explicit `message.cancelled` terminal events.

### Integration points and expected public exports

- `packages/protocol` exports request/response/event types and validation schemas.
- `packages/runtime-desktop` exports runtime bootstrap/start/stop APIs for desktop embedding and tests.
- `apps/desktop-macos` consumes generated Swift models and protocol client SDK wrappers.

## Risks / Trade-offs

- **[Risk] Bundled Node runtime increases app packaging complexity** → Mitigation: define deterministic build artifact layout and startup health checks; include integration tests for packaged runtime launch.
- **[Risk] Provider capability drift causes incorrect UI affordances** → Mitigation: capability metadata includes versioned schema + conservative defaults (feature disabled unless explicitly supported).
- **[Risk] Local persistence/indexing may degrade performance on large histories** → Mitigation: cap eager loads, paginate history, background index maintenance, and profile search paths.
- **[Risk] Stream interruption leaves partial UI/runtime state divergence** → Mitigation: terminal reconciliation API and resumable history fetch by message/thread ID.
- **[Risk] Cross-language contract divergence (TS vs Swift models)** → Mitigation: single source contract package with generated Swift models in CI validation.

## Migration Plan

1. Create workspace scaffolding for desktop app, runtime, and shared protocol package.
2. Implement protocol schemas and contract tests (TS), then generate/validate Swift models.
3. Build runtime lifecycle + health + stream infrastructure with stub provider responses.
4. Integrate providers (Ollama/OpenAI/Anthropic) behind normalized capability contract.
5. Implement conversation persistence/search/branch APIs in runtime.
6. Implement SwiftUI shell and wire streaming + conversation APIs.
7. Add observability surfaces and failure recovery behavior.
8. Run end-to-end tests and package/notarization readiness checks.

Rollback strategy:
- Keep desktop app feature flags to disable runtime-backed flows and fall back to safe empty-state UX.
- Maintain protocol version negotiation; reject incompatible runtime/app combinations with clear upgrade guidance.

## Open Questions

- Which streaming protocol is primary for v1 (SSE vs WebSocket) and what is the exact reconnect policy?
- What local database technology is preferred for runtime persistence/indexing (SQLite profile and migration tooling)?
- What minimum capability metadata set is required for v1 UI decisions vs deferred to later revisions?
- How will packaged runtime updates be delivered across app versions (embedded-only vs patchable component)?
