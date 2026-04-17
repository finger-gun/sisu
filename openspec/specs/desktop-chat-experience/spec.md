# desktop-chat-experience Specification

## Purpose
TBD - created by archiving change build-macos-local-first-desktop-app. Update Purpose after archive.
## Requirements
### Requirement: Chat responses SHALL stream progressively in the UI
The system SHALL deliver assistant responses as incremental stream events so users see output begin before completion.

#### Scenario: Streaming begins promptly
- **WHEN** a user submits a chat message
- **THEN** the system MUST render streaming output from incremental events and update the message in place until terminal completion

#### Scenario: Stream completes
- **WHEN** the runtime emits a completion event
- **THEN** the system MUST finalize the message content, status, and usage metadata in the conversation timeline

### Requirement: Chat sessions SHALL support cancellation and retry
The system SHALL provide user controls to cancel in-progress generations and retry failed/cancelled requests.

#### Scenario: User cancels generation
- **WHEN** a user activates cancel on an active assistant response
- **THEN** the system MUST terminate the stream and mark the message state as cancelled

#### Scenario: User retries generation
- **WHEN** a user retries a failed or cancelled assistant response
- **THEN** the system MUST submit a new generation request with equivalent conversation context unless explicitly edited by the user

### Requirement: Chat composer SHALL support image attachments
The system SHALL allow users to attach image content to chat turns when the selected model advertises image-input capability.

#### Scenario: Model supports image input
- **WHEN** a user selects a model with image-input capability
- **THEN** the composer MUST allow image attachments and include them in the request payload

#### Scenario: Model does not support image input
- **WHEN** a user selects a model without image-input capability
- **THEN** the UI MUST disable image attachment actions and provide a capability-aware explanation

### Requirement: Message status SHALL be explicit and recoverable
The system SHALL track per-message statuses (`pending`, `streaming`, `completed`, `failed`, `cancelled`) and reconcile with runtime terminal events after reconnect.

#### Scenario: App reconnects during active conversation
- **WHEN** the client reconnects after interruption
- **THEN** it MUST query conversation state and reconcile message statuses to the latest canonical runtime state

