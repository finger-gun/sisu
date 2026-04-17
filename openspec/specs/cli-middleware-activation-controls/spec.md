# cli-middleware-activation-controls Specification

## Purpose
TBD - created by archiving change add-configurable-cli-capabilities. Update Purpose after archive.
## Requirements
### Requirement: CLI SHALL activate middleware from a vetted catalog only
Middleware activation in CLI chat SHALL be limited to middleware identifiers registered in a runtime-maintained vetted catalog.

#### Scenario: Profile references cataloged middleware
- **WHEN** the profile enables a middleware ID present in the vetted catalog
- **THEN** the runtime MUST initialize that middleware with validated options and include it in the execution pipeline

#### Scenario: Profile references non-catalog middleware
- **WHEN** the profile enables a middleware ID not present in the vetted catalog
- **THEN** startup MUST fail with a structured error describing the unknown middleware ID

### Requirement: CLI SHALL enforce a non-disableable core middleware baseline
The runtime SHALL maintain a required set of core middleware that cannot be disabled, removed, or reordered beyond defined constraints.

#### Scenario: Profile attempts to disable core middleware
- **WHEN** profile configuration marks a core middleware entry as disabled
- **THEN** startup MUST fail with a validation error that identifies the locked middleware and required baseline behavior

#### Scenario: Interactive setup attempts to remove core middleware
- **WHEN** a user attempts to disable or remove a locked core middleware entry in interactive setup
- **THEN** the CLI MUST block the action, explain that the middleware is required, and keep it enabled

### Requirement: CLI SHALL support profile-defined middleware ordering and settings
The profile middleware configuration SHALL allow users to define pipeline order and per-middleware settings using a schema-validated structure.

#### Scenario: User defines explicit middleware order
- **WHEN** the profile specifies a middleware pipeline order
- **THEN** the runtime MUST compose middleware in exactly that order after validation

#### Scenario: User defines per-middleware settings
- **WHEN** the profile provides settings for a middleware entry
- **THEN** the runtime MUST validate and apply those settings during middleware initialization

#### Scenario: User reorders middleware around locked constraints
- **WHEN** profile or interactive config reorders middleware in a way that violates locked core ordering constraints
- **THEN** validation MUST fail with a constraint error that identifies the incompatible ordering

### Requirement: Middleware options SHALL be schema-validated before activation
Each cataloged middleware with configurable options SHALL define a schema and activation SHALL fail fast when options are invalid.

#### Scenario: Middleware options are invalid
- **WHEN** configured middleware options fail schema validation
- **THEN** startup MUST fail with a field-level validation error for that middleware configuration

#### Scenario: Middleware options are omitted
- **WHEN** configurable middleware is enabled without explicit options
- **THEN** the runtime MUST apply documented defaults and continue startup

### Requirement: CLI SHALL surface effective middleware pipeline at startup
The runtime SHALL provide a startup-visible summary of enabled middleware and ordering.

#### Scenario: Chat starts with middleware configuration
- **WHEN** the runtime finalizes middleware activation
- **THEN** the CLI MUST present the effective middleware list and order in startup diagnostics or status output

### Requirement: CLI SHALL offer interactive middleware setup and manual editor workflow
The chat interface SHALL provide a guided setup menu for middleware configuration and a quick action to open the profile config in the user's configured editor.

#### Scenario: User configures middleware in guided menu
- **WHEN** the user opens interactive middleware setup
- **THEN** the CLI MUST allow enable/disable, reorder, and settings updates with validation feedback before save

#### Scenario: User selects open-config action
- **WHEN** the user triggers the open-config workflow from middleware management
- **THEN** the CLI MUST launch the selected profile file in the configured editor and report the opened path

