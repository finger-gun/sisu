## Why

Sisu currently splits core generation, streaming helpers, and tool-calling orchestration across different abstractions, which makes the main real-world flow (tool calls plus optional streaming) hard to discover and use consistently. We should make execution a first-class core capability now to reduce user confusion, align examples, and provide one clear path for production agents.

## What Changes

- Introduce a unified core execution API with distinct non-streaming and streaming entry points that share the same tool-calling orchestration behavior.
- Define a stable execution result contract so users can read final assistant output and metadata without manually scraping `ctx.messages`.
- Define a stable streaming event contract for tokens, tool-step lifecycle events, completion, and error events.
- Treat tool-calling middleware as compatibility-focused guidance rather than the primary orchestration path; promote core execution APIs as the default path.
- Keep `mw-register-tools` as the preferred registration mechanism for tools used by the new core execution APIs.
- User-facing change: examples and docs shift from middleware-first generation patterns to core execution-first patterns.
- API surface change: add new core execution interfaces and mark legacy middleware orchestration as deprecated guidance (not immediate removal).

## Goals

- Make non-streaming execution the default, with optional streaming as an explicit opt-in.
- Make tool-calling behavior consistent between streaming and non-streaming flows.
- Reduce boilerplate in examples and production code.
- Preserve middleware composability for registration, guardrails, and observability.

## Non-goals

- Replacing middleware as a concept in Sisu.
- Removing existing middleware packages immediately.
- Forcing provisional/early token streaming semantics by default.
- Introducing provider-specific behavior in the core execution contract.

## Success Metrics & Acceptance Criteria

- Developers can execute a full turn (with optional tools) using one core non-streaming API without manually scanning `ctx.messages`.
- Developers can execute a full turn with streaming using one core streaming API and receive well-defined events.
- Tool-calling behavior is documented as identical across both execution modes except for output transport (result object vs stream events).
- Legacy tool-calling middleware remains usable but is clearly documented as compatibility/legacy convenience.
- Core docs and key examples show the new APIs as the primary approach.

## Capabilities

### New Capabilities

- `core-execution-runtime`: Unified turn execution APIs in core for non-streaming and streaming runs with shared tool-calling orchestration.
- `execution-output-contracts`: Standard result and event contracts for non-streaming outputs and streaming lifecycle events.
- `legacy-tool-calling-compatibility`: Compatibility requirements that preserve existing middleware behavior while shifting primary guidance to core execution APIs.

### Modified Capabilities

- None.

## Impact

- **Affected code**: `@sisu-ai/core` execution utilities and types; middleware docs and examples that currently use middleware-first tool-calling patterns; selected CLI/example integration points.
- **Affected APIs**: new core execution APIs and typed output/event contracts; documentation-level deprecation guidance for middleware-first tool orchestration.
- **Dependencies/systems**: provider adapters must continue to work through existing generate/stream capabilities under the unified execution orchestration.
- **Target audience and use cases**: framework users building production agents (non-streaming backends, streaming CLIs/UIs, and tool-enabled assistants) and maintainers who need one consistent, testable execution model.
