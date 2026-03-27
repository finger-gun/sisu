## ADDED Requirements

### Requirement: Chroma Adapter Implements Vector Store Contract
`@sisu-ai/vector-chroma` SHALL provide a Chroma-backed implementation of the shared vector-store contract.

#### Scenario: Generic tools use Chroma adapter
- **WHEN** generic store/retrieve tools are wired with the Chroma adapter
- **THEN** upsert/query behavior MUST function with parity to existing Chroma-backed behavior

### Requirement: Low-Level Chroma Primitives Remain Available
`vector.upsert`, `vector.query`, and `vector.delete` MUST remain available for developer-controlled ingestion and maintenance flows.

#### Scenario: Developer performs controlled ingestion
- **WHEN** app code invokes low-level Chroma primitives directly
- **THEN** records MUST be persisted/retrieved/deleted without requiring model tool-calling
