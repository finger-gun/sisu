## ADDED Requirements

### Requirement: Memory middleware loads scoped memory before model execution
The system SHALL provide middleware that resolves memory identity (`agentId`, `scope`, optional `sessionId`) and loads scoped memory entries before downstream model execution.

#### Scenario: Session-scoped memory load
- **WHEN** memory middleware runs with `scope=session` and a valid `sessionId`
- **THEN** it MUST load memory entries for that exact session scope and expose them to downstream execution

#### Scenario: Invalid session identifier
- **WHEN** memory middleware receives an invalid `sessionId` for `scope=session`
- **THEN** it MUST reject the run (or apply an explicitly configured fallback policy) and emit a structured memory error

### Requirement: Memory middleware persists updates after run execution
The system SHALL persist memory writes after downstream middleware/model execution according to configured persistence policy.

#### Scenario: Assistant response is persisted
- **WHEN** persistence policy permits writes for the completed run
- **THEN** the middleware MUST persist memory updates through the configured store and record persisted metadata in runtime state

#### Scenario: Persistence policy skips writes
- **WHEN** configured persistence policy indicates no write for a run
- **THEN** middleware MUST skip storage writes and emit a structured skip event

### Requirement: Memory persistence is selective and policy-gated
The system SHALL evaluate candidate memory writes against deterministic policy rules so that durable memory is not created for every turn.

#### Scenario: Explicit user memory signal
- **WHEN** the user explicitly asks the agent to remember information
- **THEN** middleware MUST treat the candidate write as eligible for persistence, subject to scope and validation checks

#### Scenario: Inferred fact below confidence threshold
- **WHEN** a candidate memory write is inferred (not explicit) and confidence is below configured threshold
- **THEN** middleware MUST reject persistence and record a structured rejection reason

#### Scenario: Transient or sensitive content
- **WHEN** a candidate write is categorized as transient or sensitive content
- **THEN** middleware MUST reject persistence by default unless explicitly overridden by configuration

### Requirement: Memory operations are tool-mediated and auditable
The system SHALL support explicit memory tools/skills for read/write/delete/list operations, with traceable runtime events.

#### Scenario: Model chooses to store a user profile fact
- **WHEN** the model decides a user profile fact should be remembered
- **THEN** it MUST be able to call a memory write tool and middleware MUST apply policy gates before store persistence

#### Scenario: Model retrieves memory for response continuity
- **WHEN** the model needs prior context for continuity
- **THEN** it MUST be able to call a memory read tool that returns scoped, bounded memory entries

### Requirement: Memory middleware records explicit runtime state
The system SHALL maintain memory runtime bookkeeping under `ctx.state.memory`.

#### Scenario: Runtime state is populated
- **WHEN** memory middleware completes load/save lifecycle
- **THEN** `ctx.state.memory` MUST include scope/session identifiers and load/save counters

#### Scenario: Runtime state includes policy outcomes
- **WHEN** memory write candidates are evaluated
- **THEN** `ctx.state.memory` MUST include accepted/rejected counts and rejection reasons metadata
