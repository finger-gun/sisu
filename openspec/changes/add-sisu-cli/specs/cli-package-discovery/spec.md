## ADDED Requirements

### Requirement: CLI Lists Maintained Sisu Capabilities
The `sisu` CLI SHALL list maintained Sisu packages and templates by category.

#### Scenario: Developer lists middleware packages
- **WHEN** a developer runs `sisu list middleware`
- **THEN** the CLI MUST return maintained middleware entries with stable identifiers and summaries

### Requirement: CLI Resolves Package Information By Name Or Alias
The `sisu` CLI SHALL expose detailed metadata for a maintained package or template through `info` lookup.

#### Scenario: Developer inspects a RAG package
- **WHEN** a developer runs `sisu info rag-core`
- **THEN** the CLI MUST return the package name, category, summary, docs path, and related examples when available
