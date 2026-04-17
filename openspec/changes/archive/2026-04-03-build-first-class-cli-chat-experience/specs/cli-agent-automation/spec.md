## ADDED Requirements

### Requirement: CLI agent SHALL execute multi-step automation within chat sessions
The chat runtime SHALL support multi-step agent behavior where the assistant can plan, execute tool-calling steps, and continue until completion or explicit stop.

#### Scenario: Agent completes a multi-step task
- **WHEN** a user asks for a task requiring multiple dependent actions
- **THEN** the agent MUST execute ordered steps, call required tools, and return a final summary of outcomes and artifacts

#### Scenario: Agent cannot complete a requested step
- **WHEN** a required step fails or is blocked
- **THEN** the agent MUST report the failure cause and present the current partial progress state

### Requirement: CLI agent SHALL provide progress transparency during automation
The runtime SHALL expose structured progress updates so users can follow ongoing automation decisions and actions.

#### Scenario: Agent starts execution
- **WHEN** the agent transitions from planning to execution
- **THEN** the UI MUST display a progress timeline that updates as steps start, complete, or fail

#### Scenario: Agent finishes execution
- **WHEN** the automation run reaches a terminal state
- **THEN** the UI MUST retain a concise run summary and link it to the originating user request in session history

### Requirement: CLI agent SHALL support deterministic cancellation of active automation
Users SHALL be able to cancel active automation and receive a canonical cancelled outcome.

#### Scenario: User cancels during execution
- **WHEN** the user invokes cancel while automation is running
- **THEN** the runtime MUST propagate cancellation to active provider/tool operations and produce an explicit cancelled terminal state
