## Context

Sisu currently implements OpenAI, Anthropic, and Ollama adapters with custom `fetch` transport logic, provider-specific payload mapping, and duplicated retry/stream parsing code. This gives fine-grained control, but it increases maintenance burden and creates feature lag risk as provider APIs evolve.

The change introduces provider SDKs as transport backends while preserving Sisu’s provider-agnostic `LLM` contract and middleware behavior. Existing middleware (`mw-tool-calling`, tracing, guardrails, error boundaries) should remain unchanged at integration boundaries.

Constraints:
- Keep adapter public APIs stable unless a change is explicitly justified.
- Preserve strict TypeScript typing and deterministic behavior.
- Keep provider dependencies scoped to each adapter package.

## Goals / Non-Goals

**Goals:**
- Use official provider SDKs for request transport in OpenAI, Anthropic, and Ollama adapters.
- Preserve `LLM.generate` semantics for non-stream and stream modes.
- Standardize adapter-level behavior for option normalization, tool calls, streaming events, cancellation, and error mapping.
- Improve reliability and feature adoption velocity with provider-maintained clients.

**Non-Goals:**
- Replacing Sisu middleware architecture with provider SDK frameworks.
- Redesigning core message types in `@sisu-ai/core` in this change.
- Shipping every provider-specific advanced feature in v1 migration.

## Decisions

### Decision 1: Keep Sisu adapter boundary unchanged; swap transport implementation only
All adapters will continue exposing the same `LLM` contract (`generate(messages, opts)`), while internal transport logic shifts from custom HTTP calls to official SDK client calls.

**Rationale:** Preserves user-facing ergonomics and existing middleware integration.

**Alternative considered:** Replace adapter layer with provider-native agent frameworks.  
**Rejected because:** It would break provider-agnostic architecture and deeply couple users to provider-specific runtime models.

### Decision 2: Implement provider-specific SDK transport modules behind existing adapter entry points
Each adapter package will encapsulate its SDK usage:
- OpenAI adapter uses `openai` SDK client.
- Anthropic adapter uses `@anthropic-ai/sdk`.
- Ollama adapter uses `ollama`.

The adapter still performs Sisu-side message/tool normalization before SDK invocation and response normalization afterward.

**Rationale:** Keeps ownership of cross-provider behavior while delegating transport robustness to provider SDKs.

**Alternative considered:** Add a single shared transport abstraction package for all SDK calls.  
**Rejected because:** Provider SDK APIs differ materially; over-abstraction at this layer would obscure behavior and increase complexity.

### Decision 3: Add a conformance layer for normalization and mapping guarantees
Define explicit adapter conformance requirements and tests for:
- `GenerateOptions` normalization (`toolChoice`, `stream`, `signal`, token/temperature bounds).
- tool schema conversion and tool-call result normalization.
- streaming event shape (`token`, final `assistant_message`) consistency.
- deterministic error surfaces across adapters.

**Rationale:** SDK migration must not introduce behavior drift between adapters.

**Alternative considered:** Rely on adapter-specific tests only.  
**Rejected because:** It misses cross-adapter parity regressions and makes behavior guarantees implicit.

### Decision 4: Keep cancellation and timeout behavior explicit in Sisu options
`GenerateOptions.signal` remains the canonical cancellation channel. Timeout/retry behavior will use provider SDK capabilities where available, with Sisu-owned fallback handling where required for parity.

**Rationale:** Maintains existing control semantics and avoids hidden cancellation behavior changes.

**Alternative considered:** Delegate all cancellation/retry semantics entirely to SDK defaults.  
**Rejected because:** Existing Sisu users depend on explicit behavior and deterministic failure handling.

## Data Flow and Middleware/Tool Interactions

1. Caller passes `messages` and `GenerateOptions` into adapter `generate`.
2. Adapter normalizes Sisu message/tool structures to provider request shape.
3. Adapter invokes provider SDK transport call.
4. Adapter maps SDK response/stream events back to Sisu `ModelResponse` or `ModelEvent`.
5. Existing middleware consumes normalized outputs unchanged (tool loop, tracing, usage tracking, guardrails).

Tool-calling interaction remains middleware-driven:
- adapters expose tool schemas and tool choices to provider SDK APIs,
- adapters normalize provider tool-call payloads to Sisu `{ id, name, arguments }`,
- middleware executes tools and appends `tool` messages as before.

## Integration Points and Public Exports

Primary code integration points:
- `packages/adapters/openai/src/index.ts`
- `packages/adapters/anthropic/src/index.ts`
- `packages/adapters/ollama/src/index.ts`
- adapter tests in each package plus shared conformance tests.

Expected exports:
- Existing adapter exports remain (`openAIAdapter`, `anthropicAdapter`, `ollamaAdapter`, embeddings helpers).
- Additive adapter option fields are allowed if required for SDK configuration; defaults remain backward-compatible.

## Error Handling and Cancellation

- Adapter errors MUST surface as actionable `Error` objects with provider context and bounded detail.
- No silent fallback from failed multimodal/tool payload mapping to plain text.
- `GenerateOptions.signal` MUST propagate to SDK request execution and any adapter-side preprocessing (e.g., image fetch normalization paths where applicable).
- Retry behavior SHOULD remain deterministic and documented per adapter.

## Risks / Trade-offs

- **[Risk] SDK behavior differs subtly from current transport semantics**  
  → **Mitigation:** Add cross-adapter conformance tests and targeted regression coverage.

- **[Risk] Added dependencies increase package size and update surface**  
  → **Mitigation:** Scope SDK dependency per adapter package and keep core packages dependency-neutral.

- **[Risk] Provider SDK breaking changes can affect adapter behavior**  
  → **Mitigation:** Pin compatible version ranges and validate via CI conformance tests before upgrades.

- **[Trade-off] Less low-level transport control in adapter internals**  
  → **Mitigation:** Keep Sisu-owned normalization and failure mapping at adapter boundary.

## Migration Plan

1. Add SDK dependencies and transport implementations behind existing adapter APIs.
2. Introduce conformance tests for parity (text, tools, streaming, multimodal as applicable).
3. Run package-level and repo-level lint/build/test gates.
4. Update adapter READMEs with SDK-backed behavior and migration notes.
5. Rollback strategy: revert adapter transport modules to previous custom transport implementation if regressions are discovered.

## Open Questions

- Should OpenAI adapter keep Chat Completions as the default transport for parity, or introduce optional Responses API mode in this change?
- Do we want a shared internal adapter error class in this change, or keep provider-specific messages normalized only at text level?
- Should SDK client injection hooks be exposed for advanced users/testing, or remain internal initially?
