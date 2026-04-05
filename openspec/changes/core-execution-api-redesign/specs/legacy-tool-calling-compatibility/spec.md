## ADDED Requirements

### Requirement: Existing tool-calling middleware integrations SHALL remain operational
The framework MUST preserve existing middleware-based tool-calling behavior for current users during migration to core execution APIs.

#### Scenario: Existing middleware flow still works
- **WHEN** an application uses `mw-tool-calling` with registered tools
- **THEN** tool-calling execution SHALL continue to function without mandatory code changes

### Requirement: Tool registration middleware SHALL remain compatible
The framework MUST keep `mw-register-tools` interoperable with the new core execution APIs and existing middleware paths.

#### Scenario: Registered tools available to core execution
- **WHEN** tools are registered through `mw-register-tools`
- **THEN** the core execution runtime SHALL discover and execute those tools under normal tool-calling flow

### Requirement: Migration guidance SHALL clearly mark primary and legacy paths
Documentation MUST identify core execution APIs as the primary recommended orchestration path and classify middleware-based orchestration as compatibility-focused guidance.

#### Scenario: Documentation signals migration path
- **WHEN** users read core and middleware tool-calling documentation
- **THEN** docs SHALL clearly distinguish the recommended core path from legacy compatibility middleware usage

