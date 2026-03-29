## Context

`@sisu-ai/adapter-openai` already exposes `openAIEmbeddings(...)`, and the request shape it uses is generic enough to work with many OpenAI-compatible embedding providers. At the same time, the implementation currently lives inside the OpenAI adapter and duplicates types that now also exist in `@sisu-ai/core`, which makes embeddings feel provider-owned even when the behavior is really a shared transport concern.

Anthropic complicates that boundary further: Anthropic does not provide its own embeddings API, but Anthropic users still need an ergonomic way to configure embeddings for RAG pipelines. Ollama adds another requirement because it supports embeddings through `/api/embed`, which is close to the normalized contract but not wire-compatible with OpenAI's `/v1/embeddings` response shape.

The stakeholders are package maintainers for `@sisu-ai/core` and adapter packages, plus application developers building RAG flows that should be able to swap embedding backends without rewriting middleware or tool code.

## Goals / Non-Goals

**Goals:**
- Move the typed embeddings contract and generic HTTP embedding client into `@sisu-ai/core`.
- Keep adapter-level convenience functions so provider packages remain ergonomic and discoverable.
- Ensure `openAIEmbeddings(...)` and `anthropicEmbeddings(...)` can share the same OpenAI-compatible core implementation path.
- Add `ollamaEmbeddings(...)` with Ollama-specific transport mapping while preserving the same `EmbeddingsProvider` contract.
- Preserve explicit configuration, stable ordering, actionable errors, and cancellation propagation.

**Non-Goals:**
- Implement a Voyage-specific helper in this change.
- Introduce automatic provider detection from arbitrary URLs or API keys.
- Change middleware or vector-store APIs that already consume `EmbeddingsProvider`.
- Add a new dependency for HTTP requests or schema validation.

## Decisions

### 1) Put the reusable embeddings client in `@sisu-ai/core`
**Decision:** Add a generic embeddings factory to `@sisu-ai/core` and treat adapter helpers as presets over that core implementation.

**Rationale:**
- The shared contract already belongs in core, so the transport abstraction should live beside it.
- This prevents adapter packages from re-declaring shared types and HTTP behavior.
- Application code that already knows its endpoint/provider can depend directly on core without importing a model adapter package just for embeddings.

**Alternatives considered:**
- Keep embeddings fully inside provider adapters: rejected because Anthropic would still need a non-Anthropic transport story and OpenAI-compatible providers would duplicate logic.
- Add a separate embeddings package: deferred because the core contract is already established in `@sisu-ai/core`.

### 2) Model the core client as an explicit transport + mapping configuration
**Decision:** The core export accepts explicit options for base URL/path, authentication/header behavior, default model, and response extraction so it can support OpenAI-compatible endpoints and similar JSON APIs without hidden assumptions.

**Rationale:**
- Keeps behavior explicit and testable.
- Supports direct use with hosted OpenAI-compatible services, self-hosted gateways, and future providers that only differ in defaults.
- Leaves room for a custom response mapper where wire format differs.

**Alternatives considered:**
- Hard-code only the OpenAI `/v1/embeddings` shape in core: rejected because it does not help Ollama or other near-compatible endpoints.
- Expose a very low-level `fetch` callback instead of structured options: rejected because it pushes too much boilerplate to adapters and users.

### 3) Keep adapter helpers as thin presets, even for Anthropic
**Decision:** `openAIEmbeddings(...)` and new `anthropicEmbeddings(...)` remain public adapter exports that call the core client with package-appropriate environment variables, naming, and defaults.

**Rationale:**
- Preserves discoverability for users who look for embeddings support in the adapter they already use.
- Lets Anthropic users configure third-party embeddings without the adapter pretending Anthropic hosts embeddings itself.
- Maintains backward compatibility for existing `openAIEmbeddings(...)` usage.

**Alternatives considered:**
- Expose only the core helper and remove adapter presets: rejected because it makes common usage less ergonomic and breaks expectations.
- Add an Anthropic-specific HTTP implementation: rejected because Anthropic has no native embeddings API to target.

### 4) Treat Ollama as a provider-specific wrapper over the same contract
**Decision:** Implement `ollamaEmbeddings(...)` in `@sisu-ai/adapter-ollama` against Ollama's `/api/embed` endpoint and normalize its response to the shared `EmbeddingsProvider` contract.

**Rationale:**
- Ollama is valuable for local-first RAG flows and deserves a first-class helper.
- The transport differs enough from OpenAI that a dedicated wrapper is clearer than over-generalizing the first core iteration.
- The normalized contract means middleware/tools still do not branch on provider.

**Alternatives considered:**
- Force Ollama through the generic OpenAI-compatible client: rejected because the endpoint and response format differ.
- Delay Ollama support until a later change: rejected because the user need is immediate and the contract naturally accommodates it.

### 5) Centralize tests around contract behavior, then add wrapper coverage
**Decision:** Add core tests for ordering, parse failures, provider errors, and cancellation, then add focused adapter tests to verify wrapper defaults and endpoint selection.

**Rationale:**
- Reduces duplicated behavior tests across packages.
- Keeps wrapper tests small and stable.
- Makes it clear which guarantees come from the shared contract versus provider presets.

**Alternatives considered:**
- Test each adapter independently end-to-end only: rejected because it duplicates contract assertions and obscures root-cause failures.

## Risks / Trade-offs

- **Option sprawl in the core helper** → Keep the first version narrowly focused on HTTP embeddings use cases that current adapters need, and avoid premature support for every vendor-specific option.
- **Anthropic naming could imply native Anthropic embeddings** → Document clearly that `anthropicEmbeddings(...)` is a convenience preset for Anthropic-centered apps and requires a compatible third-party embeddings endpoint.
- **Wrapper drift between packages** → Share core types and helper internals so wrappers only provide defaults and small transport mappings.
- **Ollama may expose additional embedding metadata not preserved by the normalized contract** → Return only normalized vectors for now and defer richer telemetry unless a concrete consumer needs it.

## Migration Plan

1. Add the generic embeddings factory and supporting types to `@sisu-ai/core`.
2. Refactor `@sisu-ai/adapter-openai` to consume core exports instead of maintaining local embeddings transport/types.
3. Add `anthropicEmbeddings(...)` as a core-backed preset and document required configuration for third-party providers.
4. Add `ollamaEmbeddings(...)` with request/response normalization for `/api/embed`.
5. Update READMEs/examples to show direct core usage and adapter convenience usage.
6. Add or update tests for the core client and all three adapter helpers.
7. If issues appear, rollback by restoring adapter-local embeddings implementations while keeping the public helper names unchanged.

## Open Questions

- What should the core export be named: `createEmbeddingsClient`, `httpEmbeddings`, or another explicit name aligned with existing Sisu naming?
- Should `anthropicEmbeddings(...)` require an explicit `baseUrl`/`apiKey` to avoid implying Anthropic-hosted defaults, or should it support environment-variable presets for common third-party providers?
- Should the first core helper support optional request-body extensions such as provider-specific dimensions/input types now, or defer them until a concrete consumer requires them?
