## Purpose

Define requirements for the Vectra vector-store adapter integration.

## Requirements
### Requirement: Vectra Adapter Implements Vector Store Contract
`@sisu-ai/vector-vectra` SHALL provide a Vectra-backed implementation of the shared vector-store contract.

#### Scenario: Generic tools use Vectra adapter
- **WHEN** generic store/retrieve tools are wired with the Vectra adapter
- **THEN** upsert/query behavior MUST function through the shared `VectorStore` contract without backend-specific tool logic

### Requirement: Namespaces Map To Local Vectra Index Folders
The Vectra adapter MUST preserve `VectorStore` namespace semantics using file-backed local indexes.

#### Scenario: Developer queries distinct namespaces
- **WHEN** different namespaces are used with the same adapter instance
- **THEN** records MUST be isolated into separate local index folders

### Requirement: Missing Vectra Namespaces Query Safely
The Vectra adapter MUST return an empty query result for namespaces that have not yet been created.

#### Scenario: Query before any writes
- **WHEN** a query targets a namespace with no existing Vectra index
- **THEN** the adapter MUST return zero matches rather than throwing an index-not-created error
