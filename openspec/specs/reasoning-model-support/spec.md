## Purpose

Define cross-layer requirements for reasoning-model support in Sisu, including request options, response preservation, streaming behavior, and multi-turn continuity.

## Requirements

### Requirement: Generate options support reasoning controls
Sisu generation options SHALL support an optional reasoning control that can be passed as a boolean or provider-specific object.

#### Scenario: Boolean reasoning flag is provided
- **WHEN** a caller sets `GenerateOptions.reasoning` to `true` or `false`
- **THEN** adapters MUST treat it as an explicit reasoning enable/disable request for providers that support reasoning controls

#### Scenario: Object reasoning configuration is provided
- **WHEN** a caller sets `GenerateOptions.reasoning` to an object
- **THEN** adapters MUST pass through provider-specific reasoning options without schema-breaking transformations

### Requirement: Assistant messages preserve opaque reasoning details
Assistant messages SHALL allow provider-specific reasoning payloads to be preserved as opaque data.

#### Scenario: Provider returns reasoning payload
- **WHEN** an adapter receives provider reasoning metadata in an assistant response
- **THEN** it MUST attach that metadata to the normalized assistant message as `reasoning_details` without lossy transformation

### Requirement: OpenAI adapter forwards reasoning request parameters
The OpenAI adapter SHALL forward normalized reasoning controls in chat-completions requests when configured.

#### Scenario: Reasoning is enabled for an OpenAI request
- **WHEN** `openAIAdapter(...).generate(messages, { reasoning: ... })` is called
- **THEN** the adapter MUST include a `reasoning` field in the provider request body with normalized semantics

### Requirement: Reasoning details are preserved in non-streaming responses
Adapters that receive reasoning metadata in non-streaming completions SHALL return it in the final assistant message.

#### Scenario: Non-streaming completion returns reasoning details
- **WHEN** a provider non-streaming completion includes reasoning metadata
- **THEN** the adapter MUST include `reasoning_details` on the returned `ModelResponse.message`

### Requirement: Reasoning details are preserved in streaming final messages
Adapters that support streaming SHALL preserve reasoning metadata in the emitted terminal assistant message event.

#### Scenario: Streamed completion includes reasoning metadata
- **WHEN** a streaming response provides reasoning metadata during or at completion
- **THEN** the adapter MUST emit an `assistant_message` event whose message includes `reasoning_details`

### Requirement: Reasoning context survives multi-turn replay
When prior assistant messages are replayed into later turns, reasoning metadata SHALL be preserved for compatible adapters.

#### Scenario: Multi-turn conversation reuses prior assistant message
- **WHEN** a caller includes an earlier assistant message containing `reasoning_details` in a subsequent `generate()` input
- **THEN** adapter message conversion MUST preserve `reasoning_details` so provider-side reasoning context can continue across turns

### Requirement: Reasoning support remains backward compatible
Reasoning support SHALL be additive and MUST NOT require non-reasoning callers to change behavior.

#### Scenario: Caller does not use reasoning
- **WHEN** a caller omits `GenerateOptions.reasoning`
- **THEN** generation behavior MUST remain compatible with existing non-reasoning model flows
