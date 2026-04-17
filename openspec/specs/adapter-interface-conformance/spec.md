## Purpose

Define cross-adapter conformance requirements for normalized generation behavior and error semantics.

## Requirements
### Requirement: Generate options are normalized consistently across adapters
All first-party adapters SHALL apply consistent normalization semantics for shared `GenerateOptions` fields (`toolChoice`, `stream`, `signal`, `maxTokens`, `temperature`) before invoking provider transport.

#### Scenario: Shared options are interpreted consistently
- **WHEN** the same logical `GenerateOptions` are passed to OpenAI, Anthropic, and Ollama adapters
- **THEN** each adapter MUST apply equivalent normalization intent for supported fields and MUST document unsupported fields explicitly

### Requirement: Tool choice semantics are deterministic
Adapters MUST implement deterministic mapping for `toolChoice` values that preserves Sisu behavior even when provider SDKs use different tool-choice enums or payload shapes.

#### Scenario: Specific tool choice requested
- **WHEN** caller sets `toolChoice` to a specific tool constraint
- **THEN** adapter MUST map that constraint to the closest provider-supported form or fail with actionable error if unsupported

### Requirement: Streaming event mapping conforms to ModelEvent contract
Adapters SHALL normalize SDK streaming events into Sisu `ModelEvent` output with predictable event order and final message emission.

#### Scenario: Streamed response completes
- **WHEN** provider SDK emits a successful streamed completion
- **THEN** adapter MUST emit token events for text deltas and a final `assistant_message` event containing accumulated content and normalized tool calls if present

### Requirement: Error mapping is actionable and non-silent
Adapters MUST map provider SDK failures into actionable errors without silent fallback or false-success responses.

#### Scenario: Provider SDK request fails
- **WHEN** provider SDK throws or returns a failed response
- **THEN** adapter MUST propagate an `Error` with provider context and failure reason and MUST NOT return synthetic success output

### Requirement: Cross-adapter conformance tests exist
The repository SHALL include conformance tests that validate common adapter behavior independent of provider-specific internals.

#### Scenario: Conformance suite runs
- **WHEN** adapter conformance tests are executed
- **THEN** tests MUST verify at least option normalization, tool-call normalization, streaming event mapping, and error propagation behavior across all first-party adapters
