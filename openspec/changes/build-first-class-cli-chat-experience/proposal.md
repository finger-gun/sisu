## Why

Sisu already has a strong framework and a useful CLI for discovery/scaffolding, but it does not yet provide a first-class interactive CLI agent experience for daily engineering automation. Building this now turns Sisu into a practical day-to-day assistant surface while aligning with the broader desktop product direction.

## What Changes

- Introduce an interactive `sisu chat` command with a modern, colorful terminal UI focused on high signal and fast feedback.
- Add an agentic execution loop that can plan, call tools, run commands, and continue multi-step automation within the same chat session.
- Add explicit tool execution controls (preview, confirmation gates, policy enforcement, cancellation, and traceability).
- Add local conversation/session persistence with resume, search, and branch-from-message workflows.
- Add profile-based configuration for provider/model defaults, tool policies, and UX preferences per user and per project.
- Expand CLI docs and examples to position the CLI as a first-class automation product, not only package discovery.

### Goals

- Deliver a CLI chat UX that feels polished, responsive, and dependable for real engineering work.
- Preserve Sisu principles: explicit behavior, composable middleware, typed contracts, and observable execution.
- Make automation safe by default with clear permissions and user control over impactful actions.
- Enable continuity through durable local session state and reusable profiles.

### Non-goals

- Replacing the planned desktop app; this change focuses on CLI experience only.
- Shipping a cloud service requirement for core chat/automation workflows.
- Reworking unrelated framework internals not needed for CLI chat capability.

## Capabilities

### New Capabilities

- `cli-chat-interface`: Interactive terminal chat UX with streaming responses, status indicators, keyboard-first controls, and accessible color/theming behavior.
- `cli-agent-automation`: Multi-step automation behavior where the agent can reason across turns, invoke tools, and summarize progress/results.
- `cli-tool-execution-controls`: Safety and governance for tool execution including policy checks, explicit previews, confirmation for risky actions, and cancellation semantics.
- `cli-session-persistence`: Local persistence for conversations/tool traces with resume, search, and branch-from-message workflows.
- `cli-configuration-profiles`: Configurable provider/model/tool-policy/UI profiles with global defaults and project-level overrides.

### Modified Capabilities

- None.

## Impact

- **Target audience**: developers and operators using Sisu for day-to-day coding, debugging, automation, and repository operations.
- **Intended use cases**: interactive coding assistance, terminal automation, test/build triage, codebase exploration, and repeatable workflow execution.
- **User-facing changes**: new `sisu chat` workflow, richer terminal interface, safer tool invocation UX, session history controls, and profile switching.
- **API surface changes**: new CLI command surface and internal runtime contracts for chat state, tool execution events, persistence, and configuration resolution.
- **Affected systems**: `packages/cli/sisu` command parser/UI runtime, tool orchestration integration, local storage/indexing for sessions, and docs/examples.
- **Dependencies**: terminal UI libraries and local persistence/indexing components (exact packages finalized in design).
- **Breaking changes**: none expected; existing `sisu list|info|create|install` commands remain supported.

## Success Metrics

- Users can complete core flows (`start chat`, `run automation`, `approve/deny tool action`, `resume/search session`) without leaving the CLI.
- Median first visible response time and streaming smoothness meet CLI UX expectations for supported providers.
- Tool executions are auditable and policy-enforced with no silent high-impact actions.
- Session resume and profile selection behave deterministically across restarts.

## Acceptance Criteria

- Proposal-aligned specs are created for all listed capabilities with testable requirements and scenarios.
- Design and tasks document implementation path without unresolved scope ambiguity for v1.
- CLI chat behavior, safety controls, persistence behavior, and profile semantics are explicit enough to begin implementation.
