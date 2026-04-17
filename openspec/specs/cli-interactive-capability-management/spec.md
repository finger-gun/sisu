# cli-interactive-capability-management Specification

## Purpose
TBD - created by archiving change add-configurable-cli-capabilities. Update Purpose after archive.
## Requirements
### Requirement: CLI chat SHALL expose interactive capability management commands
The chat interface SHALL provide commands to list, inspect, enable, and disable tools, skills, and middleware during a session.

#### Scenario: User lists capabilities by category
- **WHEN** the user runs a capability listing command for tools, skills, or middleware
- **THEN** the CLI MUST render capability IDs, enabled state, source, and whether state is inherited or overridden

#### Scenario: User enables a disabled capability interactively
- **WHEN** the user executes an enable command for a disabled capability
- **THEN** the runtime MUST apply an effective session override and report the updated state immediately

### Requirement: Interactive capability updates SHALL be explicit about persistence target
When users change capability state interactively, the CLI SHALL support explicit selection of session-only updates or profile persistence.

#### Scenario: User selects session-only update
- **WHEN** the user chooses session-only while enabling or disabling a capability
- **THEN** the CLI MUST update only the in-memory session override and MUST NOT write profile files

#### Scenario: User selects profile-persisted update
- **WHEN** the user chooses to persist a capability change
- **THEN** the CLI MUST write the change to the selected profile scope and confirm the written path

### Requirement: Interactive command allow-list updates SHALL support session and profile scopes
When command allow-list entries are changed interactively, the CLI SHALL require explicit persistence scope selection and apply the result deterministically.

#### Scenario: User saves allow-list update to session scope
- **WHEN** the user approves or adds a command allow-list entry with session scope
- **THEN** the CLI MUST persist the update only to session state for the active chat

#### Scenario: User saves allow-list update to profile scope
- **WHEN** the user approves or adds a command allow-list entry with profile scope
- **THEN** the CLI MUST write the update to the selected global or project profile and confirm the target path

### Requirement: Runtime SHALL apply interactive updates safely across execution boundaries
Interactive capability changes SHALL affect future execution without corrupting in-flight runs.

#### Scenario: Capability update occurs during active run
- **WHEN** the user changes capability state while a provider or tool operation is running
- **THEN** the runtime MUST preserve in-flight behavior and apply the new capability state to subsequent operations only

