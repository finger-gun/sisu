## ADDED Requirements

### Requirement: File-backed memory storage persists serializable memory entries
The system SHALL provide a file-based memory storage adapter that reads and writes memory entries in a deterministic markdown format.

#### Scenario: Save memory to file
- **WHEN** middleware requests memory persistence for an agent scope
- **THEN** the file adapter MUST write entries to the deterministic file path for that scope

#### Scenario: Load memory from file
- **WHEN** middleware requests memory loading for an agent scope
- **THEN** the file adapter MUST parse the markdown file and return serializable memory entries

### Requirement: Stored memory entries include curation metadata
The system SHALL persist metadata needed for memory policy and future pruning.

#### Scenario: Save policy-tagged memory entry
- **WHEN** middleware persists an accepted memory write
- **THEN** the adapter MUST store category and source metadata (and confidence when provided) in deterministic markdown fields

#### Scenario: Parse metadata for retrieval
- **WHEN** memory entries are loaded from markdown
- **THEN** the adapter MUST return parsed metadata fields used by policy and retrieval filters

### Requirement: File paths are isolated by scope and identity
The system SHALL isolate memory files by `agentId`, scope, and scope identity (such as session id).

#### Scenario: Different sessions do not share files
- **WHEN** two distinct `sessionId` values are used for the same agent
- **THEN** the adapter MUST map them to different files and return isolated memory entries

### Requirement: File adapter supports bounded reads and cancellation
The system SHALL support bounded loading and honor `AbortSignal` during load/save operations.

#### Scenario: Load is cancelled
- **WHEN** the provided `AbortSignal` is aborted before or during file I/O
- **THEN** the adapter MUST stop and reject with cancellation error semantics
