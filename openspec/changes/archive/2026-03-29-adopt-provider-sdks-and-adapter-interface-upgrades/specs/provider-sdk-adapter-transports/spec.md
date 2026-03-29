## ADDED Requirements

### Requirement: OpenAI adapter uses official SDK transport
`@sisu-ai/adapter-openai` SHALL execute model requests through the official `openai` SDK transport path while preserving Sisu message and tool normalization behavior.

#### Scenario: OpenAI adapter executes generation request
- **WHEN** `openAIAdapter(...).generate(messages, opts)` is called
- **THEN** the adapter MUST send the request through the `openai` SDK client rather than direct custom HTTP fetch logic

### Requirement: Anthropic adapter uses official SDK transport
`@sisu-ai/adapter-anthropic` SHALL execute model requests through the official `@anthropic-ai/sdk` transport path while preserving Sisu message and tool normalization behavior.

#### Scenario: Anthropic adapter executes generation request
- **WHEN** `anthropicAdapter(...).generate(messages, opts)` is called
- **THEN** the adapter MUST send the request through the `@anthropic-ai/sdk` client rather than direct custom HTTP fetch logic

### Requirement: Ollama adapter uses official SDK transport
`@sisu-ai/adapter-ollama` SHALL execute model requests through the official `ollama` client transport path while preserving Sisu message and tool normalization behavior.

#### Scenario: Ollama adapter executes generation request
- **WHEN** `ollamaAdapter(...).generate(messages, opts)` is called
- **THEN** the adapter MUST send the request through the `ollama` client rather than direct custom HTTP fetch logic

### Requirement: Adapter transport migration preserves LLM contract
SDK-backed adapters MUST preserve Sisu `LLM` contract behavior for non-streaming and streaming invocation modes.

#### Scenario: Non-stream contract preserved
- **WHEN** `generate(..., { stream: false })` is called
- **THEN** the adapter MUST return a `ModelResponse` compatible with existing middleware behavior

#### Scenario: Stream contract preserved
- **WHEN** `generate(..., { stream: true })` is called
- **THEN** the adapter MUST return `AsyncIterable<ModelEvent>` with token and final assistant message events

### Requirement: Tool-calling transport compatibility is preserved
SDK-backed transports MUST continue to support Sisu tool schemas, tool choice controls, and normalized assistant tool calls.

#### Scenario: Tool schema and tool calls round-trip
- **WHEN** tools are provided in `GenerateOptions` and the provider returns tool calls
- **THEN** adapter output MUST include normalized tool calls `{ id, name, arguments }` consumable by Sisu tool-calling middleware

### Requirement: Cancellation is propagated through SDK requests
Adapters MUST propagate Sisu cancellation signals through SDK request execution and any adapter-side preprocessing.

#### Scenario: Request is canceled during generation
- **WHEN** `GenerateOptions.signal` is aborted before or during SDK execution
- **THEN** the adapter MUST stop work as soon as practical and surface an abort-related error
