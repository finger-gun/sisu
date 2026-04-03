# cli-chat-interface Specification

## Purpose
TBD - created by archiving change build-first-class-cli-chat-experience. Update Purpose after archive.
## Requirements
### Requirement: CLI chat SHALL provide interactive streaming conversation UX
The `sisu chat` command SHALL provide an interactive terminal conversation interface with progressive assistant streaming, clear status indicators, and keyboard-first controls.

#### Scenario: User starts an interactive chat session
- **WHEN** a user runs `sisu chat`
- **THEN** the CLI MUST open an interactive chat interface that accepts prompts and renders assistant responses in a persistent session timeline

#### Scenario: Assistant response streams progressively
- **WHEN** the assistant begins generating a response
- **THEN** the CLI MUST render incremental token deltas and update the active assistant message until terminal completion

### Requirement: CLI chat SHALL expose explicit message and run statuses
The interface SHALL represent per-message and per-run states so users can understand progress and outcomes without ambiguity.

#### Scenario: Active generation state is visible
- **WHEN** a generation is in progress
- **THEN** the UI MUST display a visible active state for the current assistant response and related run identifier

#### Scenario: Generation reaches terminal state
- **WHEN** a generation finishes, fails, or is cancelled
- **THEN** the UI MUST mark the message with an explicit terminal status and retain it in session history

### Requirement: CLI chat SHALL support accessible modern theming behavior
The interface SHALL support modern colorized output while maintaining readable fallback behavior in limited terminal environments.

#### Scenario: Terminal supports color output
- **WHEN** the runtime detects color support
- **THEN** the UI MUST render status and semantic elements using a consistent color theme

#### Scenario: Terminal has limited color support
- **WHEN** the runtime detects limited or disabled color capabilities
- **THEN** the UI MUST fall back to readable non-color or reduced-color rendering without losing critical status information

