## Context

`@sisu-ai/tool-vec-chroma` currently exposes low-level vector primitives (`vector.upsert`, `vector.query`, `vector.delete`) and assumes callers provide embeddings as needed. `@sisu-ai/mw-rag` orchestrates retrieval in middleware pipelines but does not provide a model-callable retrieval tool that accepts plain query text.

This creates friction for tool-calling agents: developers must manually wire query embedding + vector search + response shaping before the model can perform retrieval. The `examples/openai-rag-chroma` flow also combines ingestion and retrieval in a single linear agent pipeline, which obscures operational boundaries.

Stakeholders are Sisu developers building RAG agents, maintainers of `tool-vec-chroma`, and example consumers learning recommended patterns.

## Goals / Non-Goals

**Goals:**
- Add a high-level retrieval tool in `@sisu-ai/tool-vec-chroma` that accepts query text and handles embedding + query internally.
- Add a separate high-level storage tool in `@sisu-ai/tool-vec-chroma` that accepts communication-derived content and persists it for future retrieval.
- Ensure provider adapters expose a normalized embeddings API so retrieval/storage tools can consume embeddings via a consistent contract.
- Keep tool contracts explicit, strongly typed, and Zod-validated.
- Return compact retrieval results that are immediately useful in prompts (chunks + citations/metadata).
- Update `examples/openai-rag-chroma` to separate ingestion and query-time retrieval into two agents.
- Use OpenAI embeddings in the example retrieval stack instead of toy embeddings.

**Non-Goals:**
- Remove or alter semantics of existing `vector.*` tools.
- Re-architect `@sisu-ai/mw-rag` middleware internals.
- Introduce unrelated vector-store abstractions beyond Chroma in this change.

## Decisions

### 1) Add a dedicated high-level retrieval tool API in `tool-vec-chroma`
**Decision:** Introduce a new exported retrieval tool factory (for example `retrieveContext`/`createRetrieveContextTool`) in `@sisu-ai/tool-vec-chroma` rather than overloading `vector.query`.

**Rationale:**
- Preserves backwards compatibility for existing low-level users.
- Makes agent-facing retrieval intent explicit at the API level.
- Keeps composability: low-level primitives remain available for advanced flows.

**Alternatives considered:**
- Add optional text-embedding behavior to `vector.query`: rejected due to ambiguous inputs and mixed abstraction levels.
- Put retrieval tool in a separate package: deferred to reduce immediate package sprawl.

### 2) Retrieval tool owns query embedding, then delegates to vector query
**Decision:** The retrieval tool receives `queryText` (+ optional `topK`, `filter`, namespace/collection options), calls an embedding function/provider, and then executes vector query.

**Rationale:**
- Matches developer mental model for semantic search from prompts.
- Minimizes boilerplate and repeated adapter glue code.
- Centralizes validation, defaults, and error handling.

**Alternatives considered:**
- Require pre-embedded query vectors from callers: rejected as poor DX for agent tool-calling.

### 3) Add a separate model-callable storage tool for communication-derived memory
**Decision:** Introduce a distinct storage tool that accepts user-communication content (for example notes, long-form dumps, facts), validates payloads, chunks/embeds text, and delegates writes to vector upsert primitives.

**Rationale:**
- Enables explicit model-driven memory capture without overloading retrieval behavior.
- Preserves clean separation of concerns: one tool stores, another retrieves.
- Keeps user-facing workflows simple for agents that need durable context.

**Alternatives considered:**
- Reuse ingestion-only flow for runtime communication capture: rejected because it is less natural for interactive tool-calling.
- Combine store and retrieve into one tool: rejected due to ambiguous behavior and larger failure surface.

### 4) Standardize embeddings capability in provider adapters
**Decision:** Define or adopt a normalized embeddings contract in provider adapters (for example, an `embed` API shape) and inject that dependency into `tool-vec-chroma` retrieval/storage tooling.

**Rationale:**
- Keeps `@sisu-ai/tool-vec-chroma` provider-agnostic while still enabling high-quality embeddings.
- Aligns with Sisu’s provider normalization model and reduces one-off provider-specific glue code.
- Enables reuse across middleware/tools beyond this change.

**Alternatives considered:**
- Call OpenAI embeddings directly from `tool-vec-chroma`: rejected because it violates provider-agnostic boundaries.
- Keep ad-hoc embedding functions in examples only: rejected as it weakens framework-level consistency.

### 5) Standardize compact retrieval result shape for prompt use
**Decision:** Tool returns a bounded, serializable payload with entries containing text chunk, score, and citation metadata (e.g., source/id).

**Rationale:**
- Reduces token bloat and keeps tool outputs model-friendly.
- Improves interoperability with prompt-building middleware and custom app logic.

**Alternatives considered:**
- Return raw DB payloads: rejected due to noisy provider-specific output.

### 6) Split `openai-rag-chroma` into ingestion and retrieval agents
**Decision:** The example will instantiate two agents:
- `ingestAgent`: handles corpus ingestion/indexing workflow.
- `queryAgent`: handles user prompt flow, with retrieval tool(s) registered for tool-calling.

**Rationale:**
- Clarifies lifecycle and responsibilities.
- Better reflects production deployment patterns where ingestion is separate from runtime querying.

**Alternatives considered:**
- Keep single agent with phased middleware: rejected because separation remains implicit and harder to learn from.

### 7) Use OpenAI embeddings in the example
**Decision:** Replace toy embedding usage in `examples/openai-rag-chroma` with OpenAI embedding integration.

**Rationale:**
- Demonstrates realistic semantic quality and expected setup.
- Aligns the example with user expectations for prompt-driven retrieval quality.

**Alternatives considered:**
- Keep toy embedding for zero-config demos: rejected for this example because it weakens retrieval realism.

## Data Flow and Integration

1. User asks query in `queryAgent`.
2. Model decides to call retrieval tool.
3. Retrieval tool validates input via Zod.
4. Retrieval tool invokes injected normalized embeddings API from configured provider adapter (OpenAI in example).
5. Retrieval tool calls underlying Chroma query primitive.
6. Retrieval tool compacts and returns chunks/citations.
7. Model receives tool result and produces final response.

Storage flow:
1. User provides substantial information in conversation.
2. Model decides selected content should be persisted for later usefulness.
3. Model calls storage tool with content payload + optional metadata.
4. Storage tool validates payload, chunks content, invokes injected normalized embeddings API, and writes vectors via upsert.
5. Tool returns acknowledgement with stored item/chunk counts and identifiers.

Integration points:
- `@sisu-ai/tool-vec-chroma`: new retrieval export + tests.
- provider adapters: normalized embeddings API surface consumed by retrieval/storage tool factories.
- `examples/openai-rag-chroma/src/index.ts`: split-agent orchestration and tool registration.
- Existing `vector.*` tools retained and reusable by ingestion flow.

Expected public exports:
- Existing exports remain unchanged.
- New retrieval-oriented export added and documented.
- New storage-oriented export added and documented.
- Provider adapters expose/standardize an embeddings API for composition.

## Error Handling and Cancellation

- Validate tool input schema and return actionable `Error` messages for invalid parameters.
- Surface embedding or query failures without catch-and-silence; let error boundary middleware handle them.
- Propagate `AbortSignal` to embedding and vector query operations where supported.
- Propagate `AbortSignal` to embedding and upsert operations in the storage flow.
- Keep output bounded (`topK` caps/defaults) to avoid oversized tool payloads.

## Risks / Trade-offs

- **[Risk]** Additional abstraction may duplicate functionality with custom app code. → **Mitigation:** Keep API minimal and composable over primitives.
- **[Risk]** Model may over-store noisy communication content. → **Mitigation:** require explicit tool description guidance, bounded payload sizes, and optional metadata filters.
- **[Risk]** Adapter embedding API drift across providers. → **Mitigation:** define a normalized embedding contract and adapter conformance tests.
- **[Risk]** OpenAI embedding dependency in example increases external requirements. → **Mitigation:** Document required env vars and keep ingestion/query setup explicit.
- **[Risk]** Result-shape choices may not satisfy every app. → **Mitigation:** Preserve low-level tools and allow customization at call sites.
- **[Risk]** Tool output size can grow with unbounded retrieval. → **Mitigation:** enforce defaults and max `topK`.

## Migration Plan

1. Add retrieval tool API and tests in `@sisu-ai/tool-vec-chroma` without removing existing APIs.
2. Add storage tool API and tests in `@sisu-ai/tool-vec-chroma` without removing existing APIs.
3. Add/standardize embeddings API in provider adapters and wire it into retrieval/storage tool construction.
4. Update example to split ingestion/query agents and use OpenAI adapter embeddings.
5. Update docs/readme snippets to reference new retrieval/storage tools and adapter embedding injection.
6. Validate with package-targeted and workspace checks.

Rollback strategy:
- Revert example updates and stop using new tool export while retaining existing primitives.
- Since change is additive, rollback impact is limited.

## Open Questions

- What final tool name should be exported (`retrieveContext` vs `vectorRetrieveContext` vs factory naming)?
- What final storage tool name should be exported (`storeContext` vs `storeMemory` vs factory naming)?
- Which adapter package(s) should define the shared TypeScript embedding contract for cross-provider consistency?
- Should citations include raw metadata passthrough or only selected fields by default?
- Should default `topK` be globally fixed or configurable at tool-construction time?
