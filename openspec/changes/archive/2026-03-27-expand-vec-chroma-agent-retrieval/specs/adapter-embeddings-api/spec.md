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
The OpenAI adapter SHALL implement the normalized embeddings contract and support configuration used by the `openai-rag-chroma` example.

#### Scenario: OpenAI adapter is used in example retrieval/storage tools
- **WHEN** `openai-rag-chroma` composes retrieval/storage tools with OpenAI adapter embeddings
- **THEN** embeddings MUST be produced through the normalized contract and consumed without tool-level OpenAI-specific logic

