## ADDED Requirements

### Requirement: Reusable RAG Mechanics Package
The repository SHALL provide a non-tool, non-middleware package named `@sisu-ai/rag-core` for reusable RAG mechanics.

#### Scenario: Developer needs backend-agnostic ingestion logic outside tool-calling
- **WHEN** application code needs to chunk, embed, prepare, or store content without exposing those operations as tools
- **THEN** it MUST be able to use `@sisu-ai/rag-core` directly

### Requirement: Direct Store Helper Reuses Tool Mechanics
`@sisu-ai/rag-core` SHALL provide direct helpers that apply the same chunking and embedding mechanics used by agent-facing store tooling.

#### Scenario: Startup ingestion seeds a vector store
- **WHEN** application code uses a direct store helper from `@sisu-ai/rag-core`
- **THEN** it MUST apply the same bounded chunking and record-shaping behavior used by the model-facing storage tool
