## ADDED Requirements

### Requirement: Orchestration runtime state is namespaced and explicit
The system SHALL maintain orchestration runtime data under `ctx.state.orchestration` with stable top-level fields for run metadata, steps, child records, totals, and policy.

#### Scenario: Orchestration state is initialized
- **WHEN** orchestration middleware starts a run
- **THEN** it MUST initialize `ctx.state.orchestration` with run identity, status, and policy configuration

### Requirement: Delegation lifecycle is recorded in state
The system SHALL append step-level lifecycle entries for each delegate and finish action.

#### Scenario: Delegation starts and completes
- **WHEN** a child delegation is executed
- **THEN** the system MUST record a step entry with timestamps, action type, delegation id, and terminal status

### Requirement: Child status and totals are aggregated
The system SHALL maintain per-child status records and update orchestration totals as children complete.

#### Scenario: Child succeeds
- **WHEN** a child returns a successful delegation result
- **THEN** the system MUST update child status to `ok` and increment success/totals counters

#### Scenario: Child fails or times out
- **WHEN** a child returns `error`, `cancelled`, or `timeout`
- **THEN** the system MUST persist failure details and increment failure/totals counters
