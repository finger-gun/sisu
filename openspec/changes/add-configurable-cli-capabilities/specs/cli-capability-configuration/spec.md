## ADDED Requirements

### Requirement: CLI SHALL resolve capability configuration with deterministic layered precedence
The runtime SHALL compute effective tool, skill, and middleware activation from layered configuration in this order: built-in defaults, global profile, project profile, then session overrides.

#### Scenario: Higher-precedence layer overrides lower layer
- **WHEN** a capability is enabled in global profile and disabled in project profile
- **THEN** the runtime MUST treat the capability as disabled for sessions in that project

#### Scenario: Session override takes precedence
- **WHEN** a capability is disabled by profile but enabled through an interactive session override
- **THEN** the runtime MUST treat the capability as enabled for the active session only

### Requirement: Middleware profile schema SHALL support ordered pipeline entries with settings
Profile configuration SHALL represent middleware as ordered entries with middleware identifiers, enablement state, and optional settings payload.

#### Scenario: Middleware entry omits optional settings
- **WHEN** a middleware pipeline entry includes an ID and enabled state without settings
- **THEN** profile validation MUST accept the entry and runtime MUST use middleware defaults

#### Scenario: Middleware pipeline contains duplicate enabled entries
- **WHEN** the profile contains duplicate middleware IDs in enabled pipeline entries
- **THEN** validation MUST fail with an error identifying the duplicate IDs and location

#### Scenario: Profile marks locked middleware as optional
- **WHEN** a profile attempts to represent locked core middleware as disabled or omitted
- **THEN** validation MUST fail and report the required locked middleware baseline

### Requirement: CLI SHALL validate capability configuration and reject conflicts explicitly
Capability configuration SHALL be schema-validated at startup and conflict-checked before chat runtime activation.

#### Scenario: Same-layer enable/disable conflict is detected
- **WHEN** a profile layer includes the same capability ID in both enabled and disabled lists
- **THEN** startup MUST fail with a structured validation error that identifies the conflicting capability and source layer

#### Scenario: Unknown capability identifier is configured
- **WHEN** a profile references a capability ID that is not present in the runtime registry
- **THEN** startup MUST report a validation error with the unknown ID and configuration path

#### Scenario: Official-package source policy is violated
- **WHEN** profile or interactive install settings request official-source install outside the `@sisu-ai` namespace
- **THEN** the CLI MUST reject the request with an explicit namespace policy error

### Requirement: CLI SHALL remain backward compatible for profiles without capability sections
If capability sections are absent, the runtime SHALL preserve current default behavior for tool policy, skills, and middleware activation.

#### Scenario: Legacy profile is loaded
- **WHEN** a user starts chat with a profile that omits new capability configuration fields
- **THEN** the runtime MUST initialize successfully with current default capability behavior
