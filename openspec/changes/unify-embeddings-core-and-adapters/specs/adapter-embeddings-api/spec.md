## MODIFIED Requirements

### Requirement: OpenAI Adapter Conformance
The OpenAI adapter SHALL implement the normalized embeddings contract through its public `openAIEmbeddings(...)` helper, MAY delegate transport behavior to shared core embeddings utilities, and SHALL preserve OpenAI-compatible configuration used by retrieval/storage examples.

#### Scenario: Existing OpenAI helper usage remains valid
- **WHEN** application code calls `openAIEmbeddings(...)` for an OpenAI or OpenAI-compatible endpoint
- **THEN** the helper MUST continue to return the normalized embeddings contract without requiring provider-specific logic in RAG tools or middleware

#### Scenario: OpenAI helper uses shared core behavior
- **WHEN** `openAIEmbeddings(...)` executes an embeddings request
- **THEN** request construction, error propagation, cancellation handling, and embedding-count validation MAY come from a shared core implementation while preserving observable contract behavior

## ADDED Requirements

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
