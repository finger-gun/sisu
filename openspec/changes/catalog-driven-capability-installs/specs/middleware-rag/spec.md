## MODIFIED Requirements

### Requirement: Middleware RAG Uses VectorStore Contract
The `@sisu-ai/mw-rag` package SHALL compose ingestion and retrieval against an injected `VectorStore` contract and SHALL support guided install defaults that provide a ready vector backend.

#### Scenario: Middleware ingests records through vector store
- **WHEN** `ragIngest` is configured with a `VectorStore`
- **THEN** it MUST upsert prepared records through that store and persist the result in `ctx.state.rag.ingested`

#### Scenario: Middleware retrieves through vector store
- **WHEN** `ragRetrieve` is configured with a `VectorStore`
- **THEN** it MUST query through that store and persist the result in `ctx.state.rag.retrieval`

#### Scenario: Guided install applies default backend wiring
- **WHEN** a user installs RAG through the recommended guided install flow
- **THEN** middleware configuration MUST reference a default working vector store backend without requiring manual config authoring

### Requirement: Middleware RAG Does Not Require Registered Vector Tools
`@sisu-ai/mw-rag` MUST NOT require registered `vector.*` tools for its core ingestion or retrieval flow.

#### Scenario: App uses middleware without low-level tool registration
- **WHEN** application code provides a `VectorStore` directly to middleware options
- **THEN** the middleware MUST function without any `vector.upsert` or `vector.query` tool being registered
