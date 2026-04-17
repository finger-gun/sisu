# cli-tool-execution-controls Specification

## Purpose
TBD - created by archiving change build-first-class-cli-chat-experience. Update Purpose after archive.
## Requirements
### Requirement: CLI tool execution SHALL be policy-enforced before action
The runtime SHALL evaluate tool execution requests against configured policy rules before any tool is executed.

#### Scenario: Tool request is allowed by policy
- **WHEN** a tool call satisfies current policy constraints
- **THEN** the runtime MUST mark the tool request as approved and proceed to execution

#### Scenario: Tool request is denied by policy
- **WHEN** a tool call violates current policy constraints
- **THEN** the runtime MUST deny execution and return a structured denial reason to the session timeline

### Requirement: CLI SHALL require explicit confirmation for high-impact actions
High-impact tool actions SHALL require user confirmation with a clear action preview.

#### Scenario: High-impact action is requested
- **WHEN** a tool call is classified as high-impact by policy
- **THEN** the UI MUST present a preview and require explicit user approval before executing the tool call

#### Scenario: User rejects high-impact action
- **WHEN** the user denies the confirmation prompt
- **THEN** the runtime MUST not execute the tool and MUST record the action as user-denied

### Requirement: CLI SHALL provide auditable tool lifecycle records
Each tool execution attempt SHALL produce lifecycle records that can be reviewed in the current or resumed session.

#### Scenario: Tool lifecycle progresses
- **WHEN** a tool call transitions through pending, running, and terminal states
- **THEN** the session record MUST include state transitions, timestamps, and terminal outcome metadata

