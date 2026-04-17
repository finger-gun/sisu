## Purpose

Define delegation requirements for orchestration-driven multi-agent execution.

## Requirements
### Requirement: Orchestrator control surface is delegation-first
The orchestration middleware SHALL constrain orchestrator control actions to `delegateTask` and `finish` so delegated execution remains explicit and auditable.

#### Scenario: Orchestrator delegates specialized work
- **WHEN** the orchestrator determines a sub-problem requires specialized execution
- **THEN** it MUST call `delegateTask` with a complete 4-tuple (`instruction`, `context`, `tools`, `model`)

#### Scenario: Orchestrator completes run
- **WHEN** the orchestrator determines no further delegation is required
- **THEN** it MUST call `finish` to produce the final parent output

### Requirement: Delegation inputs are validated before child execution
The system SHALL validate delegation input shape and policy constraints before invoking any child executor.

#### Scenario: Delegation request is missing required tuple fields
- **WHEN** `delegateTask` is invoked without any required field from the 4-tuple
- **THEN** the system MUST reject the delegation and record a structured error result

#### Scenario: Delegation request violates policy
- **WHEN** `delegateTask` references a disallowed model or tool outside scope
- **THEN** the system MUST reject the delegation and prevent child execution

### Requirement: Child execution is pluggable
The orchestration middleware SHALL execute delegations through a pluggable child executor contract.

#### Scenario: Inline executor is configured
- **WHEN** no custom child executor is supplied
- **THEN** the system MUST execute delegation using the built-in inline child executor

#### Scenario: Custom executor is configured
- **WHEN** a custom child executor is supplied in middleware options
- **THEN** the system MUST invoke that executor and normalize the returned delegation result
