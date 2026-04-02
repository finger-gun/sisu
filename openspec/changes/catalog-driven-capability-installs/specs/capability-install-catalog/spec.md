## ADDED Requirements

### Requirement: Discovery Package Provides Deterministic Official Catalog
The system SHALL provide an official capability catalog through `@sisu-ai/discovery` as the primary source for official capability listings.

#### Scenario: CLI loads official catalog from discovery package
- **WHEN** the CLI starts capability discovery
- **THEN** it MUST read official capability metadata from `@sisu-ai/discovery` instead of relying on live npm search results

### Requirement: Catalog Entries Are Structured And Validated
The discovery catalog MUST define stable structured entries for each official capability, including package identity, category, and display metadata required by install/setup UX.

#### Scenario: Invalid catalog entry is detected
- **WHEN** the CLI loads a catalog entry missing required fields
- **THEN** it MUST treat the entry as invalid, skip it, and surface a clear validation error for diagnostics

### Requirement: Discovery Remains Usable During Catalog Source Issues
The CLI SHALL preserve a usable install path even when official catalog loading fails.

#### Scenario: Discovery package cannot be loaded
- **WHEN** `@sisu-ai/discovery` metadata loading fails
- **THEN** the CLI MUST keep custom package install available and present an actionable error message
