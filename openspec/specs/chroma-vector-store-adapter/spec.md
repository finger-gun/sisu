## Purpose

Define requirements for the Chroma vector-store adapter integration.

## Requirements
### Requirement: Chroma Adapter Implements Vector Store Contract
`@sisu-ai/vector-chroma` SHALL provide a Chroma-backed implementation of the shared vector-store contract.

#### Scenario: Generic tools use Chroma adapter
- **WHEN** generic store/retrieve tools are wired with the Chroma adapter
- **THEN** upsert/query behavior MUST function with parity to existing Chroma-backed behavior

### Requirement: Direct VectorStore Operations Remain Available
The Chroma adapter MUST expose direct `upsert`, `query`, and optional `delete` operations through the shared `VectorStore` contract for developer-controlled ingestion and maintenance flows.

#### Scenario: Developer performs controlled ingestion
- **WHEN** app code invokes the Chroma-backed `VectorStore` directly
- **THEN** records MUST be persisted/retrieved/deleted without requiring model tool-calling
