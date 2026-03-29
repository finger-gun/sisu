## ADDED Requirements

### Requirement: Core Generic Embeddings Client
`@sisu-ai/core` SHALL expose a provider-agnostic embeddings client factory that returns the normalized `EmbeddingsProvider` contract for explicit HTTP-based embeddings integrations.

#### Scenario: Application code constructs embeddings directly from core
- **WHEN** application code configures the core embeddings client with endpoint, authentication, and default model settings
- **THEN** the returned object MUST expose `embed(input, opts?)` and produce embeddings through the shared normalized contract without requiring a model adapter package

### Requirement: Configurable OpenAI-Compatible Request Flow
The core embeddings client MUST support explicit configuration for OpenAI-compatible embeddings APIs, including request URL, headers/authentication, and default model behavior.

#### Scenario: Core client targets a compatible `/v1/embeddings` endpoint
- **WHEN** the client is configured for an OpenAI-compatible embeddings endpoint and `embed(["a", "b"])` is called
- **THEN** it MUST send both inputs in one request and return vectors in the same logical order as the input array

#### Scenario: Call-time model overrides configured default
- **WHEN** the client is configured with a default model and `embed(input, { model: "other-model" })` is called
- **THEN** the request MUST use the call-time model override for that operation

### Requirement: Explicit Response Normalization
The core embeddings client MUST normalize successful provider responses into `number[][]` and MUST validate that the returned embedding count matches the requested input count.

#### Scenario: Provider returns expected embedding list
- **WHEN** the provider returns one embedding per input item
- **THEN** the client MUST return `number[][]` with one vector per input string in matching order

#### Scenario: Provider returns mismatched embedding count
- **WHEN** the provider response contains fewer or more embeddings than requested inputs
- **THEN** the client MUST fail with an actionable error and MUST NOT return partial success as full success

### Requirement: Shared Error and Cancellation Semantics
The core embeddings client MUST propagate transport failures, parse failures, and cancellation through the normalized embeddings error path.

#### Scenario: Request is canceled before completion
- **WHEN** `embed(..., { signal })` receives an aborted `AbortSignal`
- **THEN** the client MUST stop work as soon as practical and propagate an abort-related error

#### Scenario: Provider returns a non-success response
- **WHEN** the embeddings endpoint responds with a non-2xx status
- **THEN** the client MUST throw an actionable error that includes provider failure context

#### Scenario: Provider returns invalid JSON
- **WHEN** the embeddings endpoint responds with malformed or unexpected JSON
- **THEN** the client MUST throw a parse/normalization error rather than silently returning empty embeddings
