## ADDED Requirements

### Requirement: Orchestration emits explicit delegation trace events
The tracing surface SHALL capture delegation lifecycle events at the parent run level.

#### Scenario: Delegation lifecycle is traced
- **WHEN** a delegation starts and completes
- **THEN** trace events MUST include at least `delegate.start` and `delegate.result` with delegation identifiers

### Requirement: Parent and child runs are linkable in trace output
The system SHALL include parent-child linkage metadata so child traces can be discovered from the parent run.

#### Scenario: Child trace is generated
- **WHEN** a child run emits trace output
- **THEN** the parent orchestration state and/or trace metadata MUST include child run id and parent run id linkage
