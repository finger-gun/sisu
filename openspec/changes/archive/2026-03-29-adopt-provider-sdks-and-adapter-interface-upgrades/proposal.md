## Why

Sisu’s OpenAI, Anthropic, and Ollama adapters are currently hand-rolled against HTTP APIs. That keeps dependency footprint low, but it also creates ongoing feature lag risk, duplicated transport logic, and higher maintenance cost versus provider-maintained SDK behavior.

Now is the right time to move to SDK-backed transports because all three providers have mature TypeScript clients and Sisu already has a strong provider-agnostic adapter boundary that can preserve current user workflows while improving reliability and feature velocity.

## Goals

- Adopt official provider SDKs for OpenAI, Anthropic, and Ollama adapter transport layers.
- Preserve Sisu’s existing provider-agnostic `LLM` contract and middleware/tool-calling behavior.
- Improve adapter interface consistency for cancellation, retries/timeouts, streaming events, tool-call normalization, and error mapping.
- Keep migration additive where possible and avoid unnecessary breaking API changes.
- Maintain or improve test coverage and conformance across all provider adapters.

## Non-goals

- Replacing Sisu orchestration, middleware, or tool-calling architecture with provider SDK frameworks.
- Making Sisu adapter behavior provider-specific at call sites.
- Introducing audio/video/realtime abstractions in this change.
- Implementing every provider-edge feature in a single release.

## What Changes

- Introduce SDK-backed transport implementations for:
  - `@sisu-ai/adapter-openai` using the official `openai` SDK.
  - `@sisu-ai/adapter-anthropic` using `@anthropic-ai/sdk`.
  - `@sisu-ai/adapter-ollama` using `ollama`.
- Define and apply a shared adapter interface hardening layer to standardize:
  - request option normalization (`toolChoice`, `stream`, `signal`, `maxTokens`, temperature),
  - tool schema conversion and tool-call result normalization,
  - deterministic error taxonomy and propagated failure metadata,
  - streaming event mapping to Sisu `ModelEvent`.
- Add cross-adapter conformance tests for parity across text-only, tool-calling, streaming, and multimodal message mapping.
- Add/update docs describing SDK-backed behavior, dependency model, and compatibility guarantees.
- Keep current adapter APIs intact where possible; if any incompatible behavior is required, mark and gate explicitly.

## Target Audience and Use Cases

- Sisu users building production agents on OpenAI, Anthropic, or Ollama who want stable, well-tested provider behavior.
- Teams requiring faster support for new provider capabilities without rewriting adapter transport code.
- Contributors maintaining adapters who need clearer, shared contracts and lower duplication.

Primary use cases:
- Tool-calling agents requiring consistent behavior across providers.
- Streaming chat agents with explicit cancellation and retry semantics.
- Multimodal agents (especially vision) requiring provider-accurate payload handling.

## Capabilities

### New Capabilities
- `provider-sdk-adapter-transports`: Adapters use official provider SDK clients as transport backends while preserving Sisu’s `LLM` contract.
- `adapter-interface-conformance`: A formal cross-provider adapter contract for options normalization, errors, streaming, and tool-call mapping.
- `adapter-sdk-migration-compat`: Documented and tested compatibility guarantees for migrating existing Sisu adapter usage to SDK-backed internals.

### Modified Capabilities
- None.

## Impact

- **Affected code**:
  - `packages/adapters/openai/*`
  - `packages/adapters/anthropic/*`
  - `packages/adapters/ollama/*`
  - shared adapter tests/utilities and relevant examples/docs.
- **API surface**:
  - Core `LLM` interface remains unchanged.
  - Adapter option interfaces may gain additive provider-sdk configuration fields.
  - No planned breaking changes in default user-facing adapter initialization.
- **Dependencies**:
  - New per-adapter runtime dependencies on official SDK packages (`openai`, `@anthropic-ai/sdk`, `ollama`).
  - Dependency increase is scoped to each adapter package, not global core runtime.
- **Systems/process**:
  - Expanded conformance testing to enforce behavior parity and prevent regressions.

## Success Metrics / Acceptance Criteria

- All three adapters are implemented on official SDK transports behind the same Sisu `LLM` interface.
- Existing text-only, tool-calling, and streaming workflows pass regression tests.
- Cross-adapter conformance tests verify consistent behavior for normalized options/events.
- Documentation clearly states compatibility, dependency tradeoffs, and migration expectations.
- No unintentional breaking changes in adapter public APIs.
