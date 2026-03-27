## ADDED Requirements

### Requirement: Delegation results are structured and machine-consumable
The system SHALL return delegation outcomes using a structured result contract that includes status, output, telemetry, trace linkage, and error details.

#### Scenario: Child completes successfully
- **WHEN** a child run finishes without error
- **THEN** the result MUST include `status: ok`, a summarized output payload, telemetry, and trace linkage fields

#### Scenario: Child fails
- **WHEN** a child run terminates with error
- **THEN** the result MUST include a non-success status and structured error details with message and optional code

### Requirement: Result contract captures scope and usage metadata
The system SHALL include model identity, allowed tools, used tools, and usage metrics in result telemetry when available.

#### Scenario: Usage data is available
- **WHEN** child execution produces usage metrics
- **THEN** result telemetry MUST include token and cost fields when provided by the underlying adapter/middleware

### Requirement: Parent orchestration consumes normalized result statuses
The system SHALL treat child outcomes through a fixed status enum (`ok`, `error`, `cancelled`, `timeout`) for deterministic parent behavior.

#### Scenario: Parent handles timeout result
- **WHEN** a delegation result has `status: timeout`
- **THEN** the parent orchestrator MUST process it as a terminal child outcome without requiring provider-specific interpretation
