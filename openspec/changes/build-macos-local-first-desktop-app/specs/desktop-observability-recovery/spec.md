## ADDED Requirements

### Requirement: Runtime requests SHALL be trace-correlated
The system SHALL assign a trace correlation identifier to each runtime request and stream session.

#### Scenario: Request trace id is created
- **WHEN** a chat or metadata request is accepted
- **THEN** the runtime MUST include a trace correlation identifier in structured logs and terminal event metadata

### Requirement: Failures SHALL surface structured diagnostics
The system SHALL expose structured error details suitable for user messaging and operator diagnostics without leaking sensitive provider secrets.

#### Scenario: Provider request fails
- **WHEN** a provider integration returns an error
- **THEN** the runtime MUST emit a typed error payload with stable error code, user-safe message, and diagnostic context

### Requirement: Runtime SHALL recover incomplete sessions on restart
The runtime SHALL reconcile incomplete or interrupted message sessions on startup and expose canonical terminal state.

#### Scenario: Restart after interruption
- **WHEN** the runtime starts after a prior abrupt termination
- **THEN** it MUST mark previously in-progress messages as recoverable terminal states and make them queryable by the client

### Requirement: Health monitoring SHALL expose degraded mode
The runtime SHALL report degraded health when required dependencies are unavailable while still serving non-blocked endpoints when possible.

#### Scenario: Local provider dependency unavailable
- **WHEN** a dependency check for a configured provider fails
- **THEN** the runtime health endpoint MUST report degraded status and include affected capability identifiers
