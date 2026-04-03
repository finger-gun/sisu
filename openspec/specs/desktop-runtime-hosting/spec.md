# desktop-runtime-hosting Specification

## Purpose
TBD - created by archiving change build-macos-local-first-desktop-app. Update Purpose after archive.
## Requirements
### Requirement: Desktop runtime process lifecycle SHALL be deterministic
The system SHALL provide explicit start, ready, degraded, and stop lifecycle states for the bundled local runtime process used by the macOS client.

#### Scenario: Runtime starts successfully
- **WHEN** the desktop app launches and starts the bundled runtime process
- **THEN** the runtime MUST transition to `ready` only after transport listeners and provider initialization checks complete

#### Scenario: Runtime stop is requested
- **WHEN** the desktop app exits or requests runtime shutdown
- **THEN** the runtime MUST stop accepting new chat requests, complete cleanup, and transition to `stopped`

### Requirement: Runtime transport SHALL be localhost-bound
The runtime SHALL expose its API only on loopback interfaces and SHALL reject non-localhost access attempts.

#### Scenario: Runtime binds transport
- **WHEN** runtime transport listeners are created
- **THEN** the runtime MUST bind to `127.0.0.1` and/or `::1` and MUST NOT bind to public interfaces

#### Scenario: Non-local request is attempted
- **WHEN** a request does not originate from localhost
- **THEN** the runtime MUST reject the request and emit a structured security log entry

### Requirement: Runtime SHALL support streaming generation sessions
The runtime SHALL expose a streaming interface for incremental response events and terminal completion/failure events.

#### Scenario: Streaming response emits token deltas
- **WHEN** a chat generation request is accepted in streaming mode
- **THEN** the runtime MUST emit ordered token delta events followed by exactly one terminal event

#### Scenario: Client cancels a stream
- **WHEN** the client sends a cancellation request for an active stream
- **THEN** the runtime MUST propagate cancellation to the orchestration path and emit a `message.cancelled` terminal event

### Requirement: Runtime SHALL expose health and version introspection
The runtime SHALL provide a health endpoint with version and capability metadata for client compatibility checks.

#### Scenario: Client performs startup health check
- **WHEN** the client queries runtime health during app startup
- **THEN** the runtime MUST return process state, protocol version, and feature capability flags

