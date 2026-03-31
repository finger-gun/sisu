## Purpose

Capture compatibility expectations and migration safety requirements when adapter transports move to official provider SDKs.

## Requirements
### Requirement: Existing adapter initialization remains compatible
SDK migration MUST preserve existing adapter constructor ergonomics for common usage paths.

#### Scenario: Existing adapter construction code is reused
- **WHEN** application code creates adapters with existing required options (for example model and API key/base URL patterns)
- **THEN** adapters MUST continue to initialize without mandatory new options for baseline usage

### Requirement: Migration-related behavior changes are explicit
Any behavior changes introduced by SDK transport adoption MUST be documented with compatibility notes and migration guidance.

#### Scenario: Observable behavior differs after migration
- **WHEN** a transport behavior differs from legacy adapter behavior in a user-observable way
- **THEN** documentation MUST describe the change, rationale, and recommended migration path

### Requirement: Adapter package dependencies are scoped
Official SDK dependencies MUST be scoped to their corresponding adapter packages and SHALL NOT be introduced as core framework dependencies.

#### Scenario: Installing a single adapter package
- **WHEN** a consumer installs one provider adapter package
- **THEN** only that adapter’s SDK dependency chain MUST be required for runtime operation

### Requirement: Regression coverage protects existing workflows
Adapter tests SHALL cover pre-existing workflows to ensure migration compatibility for text prompts, tool calling, and streaming.

#### Scenario: Existing workflow tests run post-migration
- **WHEN** adapter test suites execute after SDK migration
- **THEN** baseline text-only, tool-calling, and streaming scenarios MUST pass without requiring user code changes
