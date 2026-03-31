## Purpose

Define core RAG mechanics requirements for chunking, indexing, and retrieval flow.

## Requirements
### Requirement: Reusable RAG Mechanics Package
The repository SHALL provide a non-tool, non-middleware package named `@sisu-ai/rag-core` for reusable RAG mechanics.

#### Scenario: Developer needs backend-agnostic ingestion logic outside tool-calling
- **WHEN** application code needs to chunk, embed, prepare, or store content without exposing those operations as tools
- **THEN** it MUST be able to use `@sisu-ai/rag-core` directly

### Requirement: Chunking and Preparation Stay Backend-Agnostic
`@sisu-ai/rag-core` MUST provide backend-agnostic chunking and content-to-record preparation behavior.

#### Scenario: Content is prepared for vector persistence
- **WHEN** a caller prepares content for storage through `@sisu-ai/rag-core`
- **THEN** chunking, embedding, metadata shaping, and identifier generation MUST not depend on backend-specific SDK APIs

### Requirement: Direct RAG Store/Retrieve Helpers
`@sisu-ai/rag-core` SHALL provide direct helper functions for store and retrieve orchestration over the shared vector-store contract.

#### Scenario: Developer seeds a vector store at startup
- **WHEN** application code uses a direct store helper from `@sisu-ai/rag-core`
- **THEN** the helper MUST apply the same chunking and embedding mechanics used by agent-facing store tools
