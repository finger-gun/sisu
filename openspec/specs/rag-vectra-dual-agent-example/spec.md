## Purpose

Define requirements for the dual-agent RAG example using Vectra storage.

## Requirements
### Requirement: Vectra Example Mirrors Layered RAG Composition
The `examples/openai-rag-vectra` example SHALL demonstrate the same layered RAG architecture as the Chroma example.

#### Scenario: Developer reads the example
- **WHEN** a developer inspects the example implementation
- **THEN** it MUST use `@sisu-ai/rag-core`, `@sisu-ai/tool-rag`, and `@sisu-ai/vector-vectra`

### Requirement: Vectra Example Runs Without External Vector Infrastructure
The Vectra example MUST use a local file-backed index folder instead of requiring a running vector database server.

#### Scenario: Developer runs the example locally
- **WHEN** the example starts
- **THEN** it MUST be able to seed and query a local Vectra index using filesystem configuration alone
