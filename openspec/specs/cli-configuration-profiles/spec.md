# cli-configuration-profiles Specification

## Purpose
TBD - created by archiving change build-first-class-cli-chat-experience. Update Purpose after archive.
## Requirements
### Requirement: CLI SHALL support global and project-level chat profiles
The runtime SHALL support profile configuration that can be resolved from global defaults and project-local overrides.

#### Scenario: Project profile overrides global defaults
- **WHEN** both global and project profile values are defined for the same setting
- **THEN** the runtime MUST apply the project value for sessions launched in that project context

#### Scenario: Only global profile exists
- **WHEN** no project override is available
- **THEN** the runtime MUST apply global profile defaults to the session

### Requirement: Profiles SHALL define provider/model and safety defaults
Profiles SHALL include provider/model preferences and tool-safety settings used at session startup.

#### Scenario: Session starts with selected profile
- **WHEN** a chat session is created with a profile
- **THEN** the runtime MUST initialize provider/model selection and tool policy settings from that profile

### Requirement: CLI SHALL validate profile configuration deterministically
Invalid profile configuration SHALL produce actionable errors before session execution begins.

#### Scenario: Profile references unsupported provider/model
- **WHEN** profile validation runs at startup
- **THEN** the CLI MUST fail startup for that profile with a structured validation error that identifies the invalid field

