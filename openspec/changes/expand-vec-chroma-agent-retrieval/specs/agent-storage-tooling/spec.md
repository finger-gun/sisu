## ADDED Requirements

### Requirement: Communication-Aware Storage Tool
The `@sisu-ai/tool-vec-chroma` package SHALL expose a separate high-level storage tool that allows agents to persist communication-derived content for future semantic retrieval.

#### Scenario: Agent stores user-provided information
- **WHEN** an agent calls the storage tool with text content extracted from user communication
- **THEN** the tool MUST process and persist that content into the configured vector store

### Requirement: Provider-Agnostic Embedding Integration
The storage tool MUST consume embeddings through an injected normalized embeddings API and SHALL NOT hard-code provider-specific embedding calls.

#### Scenario: Storage tool is configured with adapter embeddings capability
- **WHEN** the storage tool is constructed with a provider adapter embeddings implementation
- **THEN** storage MUST execute through the normalized embedding contract without requiring tool-level provider branching

### Requirement: Validated Storage Contract
The storage tool MUST define and enforce a Zod schema for input payloads and MUST reject invalid storage calls with actionable errors.

#### Scenario: Storage call has invalid input
- **WHEN** a caller provides invalid input (for example empty content or invalid metadata shape)
- **THEN** the tool MUST fail validation and return an error indicating the invalid field

### Requirement: Embedding and Upsert Orchestration
The storage tool SHALL embed accepted content and write vectors/metadata via existing vector upsert primitives.

#### Scenario: Storage succeeds
- **WHEN** valid content is provided and embedding/upsert operations complete
- **THEN** the tool MUST return a serializable acknowledgment including stored chunk count and identifiers

### Requirement: Safe and Bounded Storage Behavior
The storage tool MUST apply bounded behavior for large payloads and MUST avoid unbounded writes in a single tool call.

#### Scenario: Very large content is provided
- **WHEN** the content exceeds configured single-call limits
- **THEN** the tool MUST chunk and/or cap processing according to documented limits and report the applied behavior

### Requirement: Cancellation and Error Propagation
The storage implementation MUST propagate cancellation and underlying embedding/upsert failures.

#### Scenario: Request is aborted during storage
- **WHEN** the provided `AbortSignal` is aborted before storage completes
- **THEN** the tool MUST stop work as soon as practical and propagate an abort-related error

#### Scenario: Vector upsert fails
- **WHEN** vector persistence fails due to backend or connectivity error
- **THEN** the tool MUST return an error and MUST NOT report successful storage
