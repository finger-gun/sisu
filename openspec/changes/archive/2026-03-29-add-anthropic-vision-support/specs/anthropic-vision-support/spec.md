## ADDED Requirements

### Requirement: Anthropic adapter SHALL accept multimodal user messages with images
The system SHALL allow `anthropicAdapter` to accept user messages that include text and image inputs in a single turn, and SHALL normalize them into valid Anthropic Messages API content blocks.

#### Scenario: Text and image parts are mapped to Anthropic content blocks
- **WHEN** a user message is provided with a content-parts array containing text and image entries
- **THEN** the adapter MUST send a request where message content preserves text and image order in Anthropic-compatible block format

#### Scenario: Convenience image fields are normalized for Anthropic requests
- **WHEN** a user message is provided with convenience image fields such as `image`, `image_url`, `images`, or `image_urls`
- **THEN** the adapter MUST normalize those fields into Anthropic image content blocks and include them in the outgoing request

### Requirement: Anthropic vision input normalization SHALL preserve existing text and tool semantics
The system SHALL keep existing Anthropic text-only and tool-calling behavior unchanged while adding multimodal image support.

#### Scenario: Text-only requests continue to work unchanged
- **WHEN** a user sends text-only Anthropic messages with no image content
- **THEN** the adapter MUST produce the same request semantics and response mapping behavior as before vision support

#### Scenario: Tool-calling remains compatible with vision support
- **WHEN** a request includes assistant tool calls and tool result messages in the same conversation as image inputs
- **THEN** the adapter MUST preserve existing `tool_use` and `tool_result` mapping behavior without regression

### Requirement: Anthropic vision support SHALL fail explicitly on invalid image inputs
The system SHALL reject invalid or unsupported image inputs with actionable errors rather than silently dropping image data.

#### Scenario: Invalid image payload is rejected
- **WHEN** a message contains an image input that cannot be normalized into a valid Anthropic image source payload
- **THEN** the adapter MUST throw an error that identifies image normalization failure

#### Scenario: Image retrieval failure is surfaced
- **WHEN** a remote image source cannot be fetched or processed for Anthropic request construction
- **THEN** the adapter MUST throw an explicit error and MUST NOT silently fall back to text-only execution

### Requirement: Anthropic vision support SHALL provide example and documentation parity
The system SHALL include runnable example and documentation updates so Anthropic vision usage is discoverable and testable.

#### Scenario: Runnable Anthropic vision example exists
- **WHEN** developers inspect repository examples for provider vision support
- **THEN** they MUST find an Anthropic vision example showing text-plus-image input usage end-to-end

#### Scenario: Adapter docs describe vision usage and constraints
- **WHEN** developers read Anthropic adapter documentation
- **THEN** documentation MUST describe supported image input forms and relevant usage constraints for vision-capable models
