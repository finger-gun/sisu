## ADDED Requirements

### Requirement: LinkUp web search tool package is available
The system SHALL provide a new package `@sisu-ai/tool-web-search-linkup` that exports a model-callable tool named `webSearch`.

#### Scenario: Agent registers the LinkUp tool
- **WHEN** a developer imports `linkupWebSearch` and registers it via `registerTools`
- **THEN** the tool MUST be available to provider tool-calling middleware under the name `webSearch`

### Requirement: LinkUp tool validates request inputs
The LinkUp web search tool MUST validate tool-call inputs using a strict Zod schema before executing provider requests.

#### Scenario: Invalid query payload is submitted
- **WHEN** the tool is called with a missing or empty `query`
- **THEN** the tool MUST fail validation and MUST NOT execute a LinkUp API request

#### Scenario: Invalid date payload is submitted
- **WHEN** `fromDate` or `toDate` cannot be parsed into a valid date
- **THEN** the tool MUST reject the call with an actionable validation error

### Requirement: LinkUp tool resolves API key deterministically
The LinkUp tool MUST resolve API credentials with deterministic precedence to support both injected runtime dependencies and environment configuration.

#### Scenario: Dependency-injected key is present
- **WHEN** `ctx.deps.linkup.apiKey` or `ctx.deps.apiKey` is provided
- **THEN** the tool MUST use the injected key ahead of environment variables

#### Scenario: API key is unavailable
- **WHEN** no API key is provided via deps or recognized env vars
- **THEN** the tool MUST fail with an explicit missing-configuration error

### Requirement: LinkUp tool executes search with mapped options
The LinkUp tool SHALL call LinkUp SDK `search` with validated and mapped arguments for query, depth, output type, and optional filtering controls.

#### Scenario: Minimal request uses deterministic defaults
- **WHEN** the tool receives only `query`
- **THEN** it MUST execute search with default `depth=standard` and `outputType=searchResults`

#### Scenario: Optional controls are provided
- **WHEN** the tool call includes filters such as domains, date range, citation flags, images, or max results
- **THEN** the tool MUST forward those options to LinkUp search in the expected request shape

### Requirement: LinkUp provider failures are surfaced explicitly
The LinkUp tool MUST propagate provider failures as explicit errors and SHALL NOT silently return success-shaped fallback responses.

#### Scenario: LinkUp SDK call fails
- **WHEN** LinkUp returns an error or the SDK throws
- **THEN** the tool MUST throw a contextual error that includes the provider failure reason
