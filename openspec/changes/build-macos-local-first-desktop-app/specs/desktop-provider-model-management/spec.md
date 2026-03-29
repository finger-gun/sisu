## ADDED Requirements

### Requirement: Provider and model catalogs SHALL be unified
The runtime SHALL expose a normalized provider/model catalog that includes capability metadata required by the desktop UI.

#### Scenario: Client requests model catalog
- **WHEN** the client queries available providers and models
- **THEN** the runtime MUST return normalized records including provider id, model id, display name, and capability flags

### Requirement: Capability metadata SHALL drive UI affordances
The client SHALL use runtime capability metadata to enable or disable model-dependent features.

#### Scenario: Tools or image capability unavailable
- **WHEN** the selected model lacks a capability required by a UI feature
- **THEN** the feature MUST be disabled and the user MUST receive a capability-specific explanation

### Requirement: Defaults and overrides SHALL be supported
The system SHALL support global default provider/model settings and per-thread overrides.

#### Scenario: Global defaults are configured
- **WHEN** a user sets default provider/model in settings
- **THEN** new threads MUST use the configured defaults unless explicitly overridden

#### Scenario: Per-thread override is applied
- **WHEN** a user changes provider/model for an active thread
- **THEN** subsequent requests in that thread MUST use the override without changing global defaults

### Requirement: Invalid model selection SHALL fail clearly
The system SHALL reject unavailable or incompatible model selections with machine-readable error codes and user-safe messages.

#### Scenario: Model no longer available
- **WHEN** a request references a model that is no longer available
- **THEN** runtime MUST reject the request with a deterministic error code and guidance to reselect a model
