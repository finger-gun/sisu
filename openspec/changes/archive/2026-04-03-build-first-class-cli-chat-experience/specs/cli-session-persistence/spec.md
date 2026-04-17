## ADDED Requirements

### Requirement: CLI chat SHALL persist session history locally
The chat runtime SHALL persist conversations and execution metadata to local storage so sessions can be resumed across process restarts.

#### Scenario: Session is resumed after restart
- **WHEN** a user restarts the CLI and reopens a prior session
- **THEN** the runtime MUST restore conversation messages, tool lifecycle records, and terminal statuses from persisted state

### Requirement: CLI chat SHALL support session search and retrieval
The CLI SHALL allow users to search persisted session history and open matching sessions deterministically.

#### Scenario: User searches session history
- **WHEN** a user submits a history search query
- **THEN** the CLI MUST return matching sessions with stable identifiers and enough context for selection

#### Scenario: User opens a search result
- **WHEN** a user selects a session from search results
- **THEN** the CLI MUST load that session in the chat interface as the active context

### Requirement: CLI chat SHALL support branch-from-message workflows
Users SHALL be able to start a new branch session from a prior message while preserving lineage metadata.

#### Scenario: User branches from a prior message
- **WHEN** a user invokes branch action on an existing session message
- **THEN** the runtime MUST create a new session linked to the source message and preserve parent-child lineage metadata
