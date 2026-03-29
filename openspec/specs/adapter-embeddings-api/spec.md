## ADDED Requirements

### Requirement: Normalized Adapter Embeddings Contract
Provider adapters SHALL expose a normalized embeddings API contract that tools and middleware can consume independent of provider-specific request/response shapes.

#### Scenario: Tool integrates with multiple providers
- **WHEN** a tool is composed with different provider adapters that support embeddings
- **THEN** the tool MUST call a consistent embeddings API shape without provider-specific branching in tool logic

### Requirement: Batch Text Embedding Support
The normalized embeddings contract MUST support embedding one or more text inputs in a single call and MUST return embeddings in the same logical order as input.

#### Scenario: Adapter embeds multiple inputs
- **WHEN** the caller passes an array of input strings
- **THEN** the adapter MUST return an embedding vector for each input in corresponding order

### Requirement: Error and Cancellation Semantics
The normalized embeddings API MUST propagate provider failures and cancellation through a standard error path.

#### Scenario: Embedding request is canceled
- **WHEN** the embedding call receives an aborted `AbortSignal`
- **THEN** the adapter MUST stop work as soon as practical and propagate an abort-related error

#### Scenario: Provider embedding request fails
- **WHEN** the underlying provider embedding operation fails
- **THEN** the adapter MUST surface an actionable error and MUST NOT return partial success as full success

### Requirement: OpenAI Adapter Conformance
The OpenAI adapter SHALL implement the normalized embeddings contract through its public `openAIEmbeddings(...)` helper, MAY delegate transport behavior to shared core embeddings utilities, and SHALL preserve OpenAI-compatible configuration used by retrieval/storage examples.

#### Scenario: Existing OpenAI helper usage remains valid
- **WHEN** application code calls `openAIEmbeddings(...)` for an OpenAI or OpenAI-compatible endpoint
- **THEN** the helper MUST continue to return the normalized embeddings contract without requiring provider-specific logic in RAG tools or middleware

#### Scenario: OpenAI helper uses shared core behavior
- **WHEN** `openAIEmbeddings(...)` executes an embeddings request
- **THEN** request construction, error propagation, cancellation handling, and embedding-count validation MAY come from a shared core implementation while preserving observable contract behavior

### Requirement: Anthropic Adapter Embeddings Helper
The Anthropic adapter SHALL expose `anthropicEmbeddings(...)` as a public helper that returns the normalized embeddings contract for apps that use Anthropic models alongside a compatible third-party embeddings provider.

#### Scenario: Anthropic application configures third-party embeddings
- **WHEN** application code calls `anthropicEmbeddings(...)` with compatible endpoint/authentication configuration
- **THEN** the helper MUST return embeddings through the same normalized contract used by other providers without requiring Anthropic-specific branching in tools or middleware

### Requirement: Core-Backed Adapter Helper Reuse
Adapter helpers targeting compatible HTTP embeddings APIs SHALL be able to reuse a shared core embeddings implementation rather than re-declaring the normalized transport contract independently in each package.

#### Scenario: OpenAI and Anthropic helpers share core path
- **WHEN** `openAIEmbeddings(...)` or `anthropicEmbeddings(...)` is invoked
- **THEN** both helpers MUST be able to rely on shared core embeddings behavior for batching, cancellation, and error normalization while exposing adapter-specific defaults and documentation
