## 1. Workspace and protocol foundation

- [ ] 1.1 Add `apps/desktop-macos/`, `packages/runtime-desktop/`, and `packages/protocol/` workspaces and wire them into `pnpm-workspace.yaml` and Turbo pipeline configuration.
- [ ] 1.2 Define protocol request/response/event schemas in `packages/protocol/src/` and export stable type contracts for runtime/client use.
- [ ] 1.3 Add contract tests in `packages/protocol/test/` validating schema shape, required fields, and backward-compatible version markers.

## 2. Runtime hosting and transport

- [ ] 2.1 Implement runtime bootstrap/lifecycle module in `packages/runtime-desktop/src/` with deterministic `starting`, `ready`, `degraded`, and `stopped` states.
- [ ] 2.2 Implement localhost-bound API transport and streaming endpoint(s) with explicit terminal event semantics.
- [ ] 2.3 Implement health/version endpoint returning runtime status, protocol version, and capability flags.
- [ ] 2.4 Implement cancellation plumbing so stream cancellation propagates AbortSignal through orchestration.

## 3. Provider/model capability management

- [ ] 3.1 Implement provider/model catalog service normalizing OpenAI, Anthropic, and Ollama metadata into protocol capability fields.
- [ ] 3.2 Implement global default provider/model configuration and per-thread override resolution logic.
- [ ] 3.3 Implement deterministic runtime errors for unavailable/incompatible model selections with stable error codes.
- [ ] 3.4 Add unit tests covering capability gating, default-vs-override precedence, and invalid model handling.

## 4. Conversation persistence, search, and branching

- [ ] 4.1 Implement persistence models for threads, messages, branches, and status transitions in runtime storage layer.
- [ ] 4.2 Implement conversation list/detail APIs with deterministic pagination semantics.
- [ ] 4.3 Implement full-text history search APIs returning ranked/stable results and sufficient highlight metadata.
- [ ] 4.4 Implement branch-from-message API that creates new thread context and persists lineage metadata.
- [ ] 4.5 Add tests for restart persistence, pagination correctness, search behavior, and branch lineage integrity.

## 5. Streaming chat and multimodal experience integration

- [ ] 5.1 Implement chat generation endpoint integrating Sisu middleware pipeline (error boundary, guardrails/invariants, provider adapter, conversation persistence hooks).
- [ ] 5.2 Implement stream event model (`message.started`, `token.delta`, terminal events) and runtime-side reconciliation data.
- [ ] 5.3 Implement image attachment handling in runtime request parsing and provider dispatch gated by capability metadata.
- [ ] 5.4 Add integration tests for successful streaming, cancellation, retry, and image-capability validation paths.

## 6. Observability and recovery

- [ ] 6.1 Implement structured logging with request/stream correlation IDs across runtime endpoints.
- [ ] 6.2 Implement restart recovery logic that reconciles previously in-progress sessions to canonical terminal states.
- [ ] 6.3 Implement degraded health reporting for missing provider dependencies while preserving non-blocked endpoints.
- [ ] 6.4 Add tests for correlation ID propagation, recovery behavior, and degraded health reporting.

## 7. Desktop app shell integration

- [ ] 7.1 Create SwiftUI app shell in `apps/desktop-macos/` with sidebar/history, chat timeline, composer, and settings surfaces.
- [ ] 7.2 Implement protocol client in Swift for runtime health, conversation, and streaming APIs using generated/shared models.
- [ ] 7.3 Implement UI state handling for message statuses (`pending`, `streaming`, `completed`, `failed`, `cancelled`) and reconnect reconciliation.
- [ ] 7.4 Implement provider/model switcher UX with capability-aware feature enablement and explanatory disabled states.
- [ ] 7.5 Implement history search and branch-from-message interactions wired to runtime APIs.

## 8. Validation and delivery readiness

- [ ] 8.1 Run `pnpm lint`, `pnpm build`, and `pnpm test` across the repository and fix regressions.
- [ ] 8.2 Add package-level readme/update docs for runtime protocol and desktop app development workflow.
- [ ] 8.3 Validate packaged runtime startup/shutdown behavior from macOS app and document troubleshooting steps.
