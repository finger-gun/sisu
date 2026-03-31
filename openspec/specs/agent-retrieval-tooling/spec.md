## Purpose

Define retrieval tooling requirements for vector-backed agent memory workflows.

## Requirements
### Requirement: Query-Text Retrieval Tool
The `@sisu-ai/tool-rag` package SHALL expose a high-level retrieval tool that accepts plain query text and performs semantic retrieval without requiring callers to precompute embeddings.

#### Scenario: Agent invokes retrieval with query text
- **WHEN** an agent calls the retrieval tool with `queryText` and optional retrieval options
- **THEN** the tool MUST resolve its dependencies and delegate retrieval orchestration to backend-agnostic RAG mechanics, returning compact retrieval results

### Requirement: Provider-Agnostic Embedding Integration
The retrieval tool MUST consume embeddings through an injected normalized embeddings API and SHALL NOT hard-code provider-specific embedding calls.

#### Scenario: Retrieval tool is configured with adapter embeddings capability
- **WHEN** the retrieval tool is constructed with a provider adapter embeddings implementation
- **THEN** retrieval MUST execute through the normalized embedding contract without requiring tool-level provider branching

### Requirement: Validated Tool Contract
The retrieval tool MUST define and enforce a Zod schema for inputs and SHALL reject invalid tool calls with actionable errors.

#### Scenario: Invalid retrieval input is provided
- **WHEN** a caller provides invalid input (for example empty `queryText` or invalid `topK` type)
- **THEN** the tool MUST fail validation and return an error that indicates which input field is invalid

### Requirement: Bounded, Citation-Oriented Results
The retrieval tool SHALL return serializable and bounded output containing retrieved text chunks and citation metadata needed for prompt construction.

#### Scenario: Retrieval succeeds with matches
- **WHEN** the vector query returns matching results
- **THEN** the tool MUST return a compact result set including chunk text, relevance/score information, and citation metadata for each item

### Requirement: Cancellation and Error Propagation
The retrieval implementation MUST propagate cancellation and underlying provider/vector errors to the caller.

#### Scenario: Request is aborted during retrieval
- **WHEN** the provided `AbortSignal` is aborted before completion
- **THEN** embedding/query work MUST stop as soon as practical and the tool MUST propagate an abort-related error

#### Scenario: Embedding provider fails
- **WHEN** the embedding call fails due to provider or network error
- **THEN** the tool MUST return an error and MUST NOT silently return empty retrieval results
