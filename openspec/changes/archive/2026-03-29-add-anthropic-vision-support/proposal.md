## Why

Sisu currently demonstrates and supports vision workflows for OpenAI and Ollama adapters, but Anthropic vision support is not yet represented as a first-class capability. Adding this now closes a provider parity gap and allows teams using Claude models to build consistent multimodal agents without custom one-off wiring.

## Goals

- Add clear, documented Anthropic image-input support in Sisu examples and adapter usage guidance.
- Ensure Anthropic vision behavior is explicit and aligned with existing OpenAI/Ollama vision patterns.
- Define expected request/response behavior for Anthropic multimodal prompts at the spec level.
- Preserve existing text-only Anthropic behavior and avoid breaking adapter APIs.

## Non-goals

- Building a new cross-provider abstraction that changes existing adapter contracts.
- Adding video or audio multimodal support in this change.
- Introducing provider-specific OCR or computer vision post-processing features.

## What Changes

- Add an OpenSpec change that introduces Anthropic vision capability requirements.
- Define new capability spec(s) for Anthropic image input handling and expected behavior.
- Add or update examples to show Anthropic multimodal usage (text + image) end-to-end.
- Add/adjust tests validating Anthropic adapter handling of image content blocks.
- Update relevant docs to include Anthropic in the vision support matrix and usage examples.

## Capabilities

### New Capabilities
- `anthropic-vision-support`: Anthropic adapter can accept image content alongside text prompts and produce valid multimodal responses using Claude vision-capable models.

### Modified Capabilities
- None.

## API Surface (Expected)

- No breaking API changes.
- Additive behavior in Anthropic adapter handling of message content blocks for image inputs.
- Potential additive helper typing updates for Anthropic multimodal message construction, if needed.

## Target Audience

- Sisu users building multimodal agents on Anthropic Claude models.
- Teams seeking provider parity across OpenAI, Ollama, and Anthropic for image-enabled interactions.
- Contributors maintaining examples and adapter integrations.

## Success Metrics / Acceptance Criteria

- Anthropic adapter accepts valid image + text inputs for supported Claude models.
- A runnable example demonstrates Anthropic vision usage and produces expected multimodal output.
- Adapter tests cover happy path and invalid image-input scenarios.
- Documentation explicitly states Anthropic vision support and usage constraints.
- Existing Anthropic text-only flows remain unaffected.

## Impact

**Affected code (planned):**

- Anthropic adapter package source and tests.
- Example(s) demonstrating Anthropic vision usage.
- Documentation pages mentioning vision support and adapter capabilities.

**Dependencies:**

- Existing Anthropic SDK integration and model capabilities.
- No new external runtime dependencies expected.

**Breaking changes:**

- None (additive only).
