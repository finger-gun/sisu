## Purpose

Define backend-agnostic requirements for RAG tools across vector providers.

## Requirements
### Requirement: Generic RAG Tools Use Vector Store Contract
Agent-facing store/retrieve tools MUST consume a backend-agnostic vector store contract and MUST NOT directly call backend-specific SDK APIs.

#### Scenario: Tool composed with injected vector store
- **WHEN** a developer constructs store/retrieve tools with a vector-store implementation
- **THEN** tool behavior MUST execute through the contract without backend-conditional tool logic

### Requirement: Store Tool Orchestrates Text-to-Vector Persistence
Store tool SHALL validate input, chunk content, embed chunks, and persist via the vector-store contract.

#### Scenario: Store tool invoked with valid content
- **WHEN** the agent calls store tool with content
- **THEN** the tool MUST embed chunked content and upsert records through the vector-store contract

### Requirement: Retrieve Tool Orchestrates Query-to-Context Retrieval
Retrieve tool SHALL embed query text and retrieve matches via the vector-store contract, returning compact citation-ready items.

#### Scenario: Retrieve tool invoked with query text
- **WHEN** the agent calls retrieve tool with `queryText`
- **THEN** the tool MUST query through the vector-store contract and return bounded serializable result items

