## 1. Chat command and runtime foundation

- [x] 1.1 Add `chat` command routing in `packages/cli/sisu/src/cli.ts` with argument parsing and help text.
- [x] 1.2 Create `packages/cli/sisu/src/chat/` module structure (`runtime.ts`, `events.ts`, `state.ts`, `renderer.ts`) and export contracts from `src/lib.ts`.
- [x] 1.3 Add typed chat event/state contracts for request lifecycle, streaming updates, tool lifecycle, and terminal outcomes.
- [x] 1.4 Add unit tests for command parsing and runtime initialization paths in `packages/cli/sisu/test/`.

## 2. Interactive terminal UI experience

- [x] 2.1 Implement interactive prompt/composer and timeline renderer supporting streaming token updates.
- [x] 2.2 Implement explicit message/run statuses (`pending`, `streaming`, `completed`, `failed`, `cancelled`) in chat state and UI.
- [x] 2.3 Implement keyboard-first controls for submit, cancel, history navigation, and branch action triggers.
- [x] 2.4 Implement color/theme capability detection with readable fallback behavior for limited terminals.
- [x] 2.5 Add UI-focused tests/snapshots for streaming updates, status transitions, and color fallback behavior.

## 3. Agent automation execution flow

- [x] 3.1 Implement multi-step automation loop in `chat/runtime.ts` that can plan, execute dependent actions, and emit progress events.
- [x] 3.2 Integrate provider adapter streaming so incremental deltas update active assistant messages in real time.
- [x] 3.3 Implement deterministic cancellation propagation via `AbortSignal` for active provider/tool operations.
- [x] 3.4 Implement terminal run summaries that link outcomes to the initiating user request.
- [x] 3.5 Add integration tests for successful multi-step completion, failure reporting, and cancelled runs.

## 4. Tool execution controls and safety policies

- [x] 4.1 Implement tool policy engine (`packages/cli/sisu/src/chat/tool-policy.ts`) to classify allow/deny/confirm decisions.
- [x] 4.2 Implement high-impact action confirmation prompts with action previews before execution.
- [x] 4.3 Implement user-denied handling that records non-executed actions with structured reasons.
- [x] 4.4 Persist tool lifecycle records (pending/running/terminal + timestamps/outcome metadata) to session state.
- [x] 4.5 Add tests for policy enforcement, confirmation flows, denied actions, and auditable lifecycle records.

## 5. Session persistence, search, and branching

- [x] 5.1 Implement local session store (`packages/cli/sisu/src/chat/session-store.ts`) for messages, tool records, and run metadata.
- [x] 5.2 Implement resume workflow that reconstructs chat state deterministically after CLI restart.
- [x] 5.3 Implement session history search and retrieval with stable session identifiers and contextual previews.
- [x] 5.4 Implement branch-from-message workflow that creates new linked sessions and stores parent-child lineage.
- [x] 5.5 Add tests for restart recovery, search result stability, and branch lineage integrity.

## 6. Configuration profiles

- [x] 6.1 Implement profile schema and loader for global and project-local settings in `packages/cli/sisu/src/chat/profiles.ts`.
- [x] 6.2 Implement precedence rules so project overrides global values deterministically.
- [x] 6.3 Implement startup validation for provider/model/tool-policy fields with structured field-level errors.
- [x] 6.4 Wire profile-derived defaults into chat session initialization and tool policy resolution.
- [x] 6.5 Add tests for precedence, invalid profile handling, and startup initialization behavior.

## 7. Documentation and quality gates

- [x] 7.1 Update `packages/cli/sisu/README.md` with `sisu chat` usage, safety model, profile configuration, and session workflows.
- [x] 7.2 Add example commands and expected UX flows for automation, confirmation prompts, resume, search, and branching.
- [x] 7.3 Run `pnpm lint` and resolve issues introduced by CLI chat changes.
- [x] 7.4 Run `pnpm build` and ensure all workspace packages compile successfully.
- [x] 7.5 Run `pnpm test` and ensure new + existing tests pass.
