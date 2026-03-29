## ADDED Requirements

### Requirement: Ollama Embeddings Helper
`@sisu-ai/adapter-ollama` SHALL expose `ollamaEmbeddings(...)` that conforms to the normalized `EmbeddingsProvider` contract.

#### Scenario: Ollama helper is created for local RAG usage
- **WHEN** application code calls `ollamaEmbeddings({ model })`
- **THEN** the helper MUST return an object exposing `embed(input, opts?)` with the same contract shape used by other embeddings providers

### Requirement: Ollama `/api/embed` Transport Mapping
The Ollama embeddings helper MUST map the normalized embeddings contract to Ollama's `/api/embed` API shape.

#### Scenario: Ollama embeds multiple inputs
- **WHEN** `embed(["first", "second"])` is called
- **THEN** the helper MUST call Ollama's `/api/embed` endpoint with the configured model and input payload and MUST return the `embeddings` array in input order

#### Scenario: Custom base URL is configured
- **WHEN** the caller passes `baseUrl` or configures the Ollama base URL environment variable
- **THEN** the helper MUST target that base URL instead of the default local Ollama address

### Requirement: Ollama Error and Cancellation Semantics
The Ollama embeddings helper MUST preserve normalized error and cancellation behavior.

#### Scenario: Ollama request fails
- **WHEN** the Ollama embeddings endpoint responds with an error status or invalid response body
- **THEN** the helper MUST surface an actionable error and MUST NOT return partial success as full success

#### Scenario: Ollama embedding request is canceled
- **WHEN** the provided `AbortSignal` is aborted before the request completes
- **THEN** the helper MUST stop work as soon as practical and propagate an abort-related error
