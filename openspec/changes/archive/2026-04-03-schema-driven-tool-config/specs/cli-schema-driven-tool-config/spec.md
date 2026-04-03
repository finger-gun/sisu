## ADDED Requirements

### Requirement: Tool configuration metadata contract
The CLI and runtime SHALL support an optional runtime tool configuration metadata contract that a tool can export, including schema, defaults, and optional UX hints/presets.

#### Scenario: Tool provides metadata
- **WHEN** a tool exports valid configuration metadata
- **THEN** the CLI runtime SHALL discover and register the metadata with the tool capability entry

#### Scenario: Tool omits metadata
- **WHEN** a tool does not export configuration metadata
- **THEN** the CLI SHALL keep the tool operational and SHALL expose fallback configuration mechanisms

### Requirement: Schema-driven settings rendering
For tools with metadata, the CLI SHALL render tool settings options from schema field types rather than hardcoded tool-specific UI logic.

#### Scenario: Boolean field
- **WHEN** the metadata includes a boolean field
- **THEN** the CLI SHALL provide an interactive toggle for that field

#### Scenario: String array field
- **WHEN** the metadata includes a string-array field
- **THEN** the CLI SHALL provide an interactive editor for array values

#### Scenario: Enum field
- **WHEN** the metadata includes an enum field
- **THEN** the CLI SHALL provide an interactive selector for allowed values

### Requirement: Unified schema validation
All persisted tool configuration updates SHALL be validated against the same tool metadata schema regardless of how the update is made.

#### Scenario: Interactive update
- **WHEN** a user updates tool config from settings menus
- **THEN** the CLI SHALL validate the config against the tool schema before persisting

#### Scenario: Command-based update
- **WHEN** a user updates tool config via CLI command input
- **THEN** the CLI SHALL validate the config against the same tool schema before persisting

#### Scenario: Invalid value rejection
- **WHEN** a config value violates schema constraints
- **THEN** the CLI SHALL reject the update and return a clear validation error

### Requirement: Backward compatibility and progressive adoption
The schema-driven system SHALL preserve compatibility with existing tools and profiles, and SHALL not require metadata adoption for tool functionality.

#### Scenario: Existing profile without metadata-driven config
- **WHEN** a profile is loaded that lacks metadata-derived tool configuration
- **THEN** runtime behavior SHALL continue with existing defaults and current compatibility behavior

#### Scenario: Community tool incremental adoption
- **WHEN** a community tool adds metadata in a later version
- **THEN** the CLI SHALL begin exposing schema-driven settings for that tool without requiring CLI code changes for that tool specifically

### Requirement: Discoverable applicable options
The CLI SHALL provide a user-facing way to list applicable configuration options derived from tool metadata.

#### Scenario: Option discovery command
- **WHEN** a user requests tool configuration options for a tool with metadata
- **THEN** the CLI SHALL list valid option paths, types, and descriptions derived from metadata

#### Scenario: No metadata available
- **WHEN** a user requests configuration options for a tool without metadata
- **THEN** the CLI SHALL return a clear message that typed options are unavailable and indicate fallback configuration paths

### Requirement: Capability installation workflow
The CLI SHALL provide a first-class capability installation workflow for tools and middleware from the official `@sisu-ai` namespace with project/global scope.

#### Scenario: CLI command install
- **WHEN** a user runs install command for tool or middleware with a valid official package name
- **THEN** the CLI SHALL install the package into the selected `.sisu` scope and register it for capability discovery

#### Scenario: Agent-driven install via built-in skill
- **WHEN** an agent invokes the built-in installer skill for an official tool or middleware package
- **THEN** the skill SHALL execute the same installation engine as the CLI command and return installation outcome details

#### Scenario: Invalid package/source rejected
- **WHEN** install input does not match allowed source and package naming constraints
- **THEN** the CLI SHALL reject installation with a clear validation error and SHALL NOT mutate capability registration

#### Scenario: Install failure rollback behavior
- **WHEN** package installation fails after command invocation
- **THEN** the CLI SHALL surface the error and SHALL avoid writing partial loader/config wiring changes

### Requirement: Installed capability discoverability
Successfully installed capabilities SHALL become discoverable and configurable through existing capability listing and schema-driven settings flows.

#### Scenario: Post-install listing
- **WHEN** installation succeeds
- **THEN** the capability SHALL appear in CLI capability listings for the corresponding category

#### Scenario: Post-install typed configuration
- **WHEN** an installed capability provides configuration metadata
- **THEN** the CLI SHALL expose typed option discovery and schema-driven config controls for that capability
