## ADDED Requirements

### Requirement: Core execution APIs SHALL provide non-streaming and streaming entry points
The core package MUST provide first-class turn execution APIs for non-streaming and streaming operation so callers can choose output transport without changing orchestration behavior.

#### Scenario: Non-streaming execution call
- **WHEN** a caller executes a turn through the non-streaming core API
- **THEN** the runtime SHALL complete orchestration and return a structured final result without requiring manual `ctx.messages` scraping

#### Scenario: Streaming execution call
- **WHEN** a caller executes a turn through the streaming core API
- **THEN** the runtime SHALL emit streaming events while preserving the same tool-calling orchestration semantics as non-streaming execution

### Requirement: Tool-calling orchestration SHALL be shared across execution modes
The runtime MUST use one shared orchestration loop for tool-calling in both non-streaming and streaming modes, including round limits, tool resolution, and message progression semantics.

#### Scenario: Same tool behavior in both modes
- **WHEN** the same prompt and tool set are executed once in non-streaming mode and once in streaming mode
- **THEN** both runs SHALL execute equivalent tool rounds and converge to equivalent final assistant state except for output transport differences

### Requirement: Execution defaults SHALL be production-safe
The non-streaming path MUST be the default execution behavior, and tool-calling MUST be enabled by default when tools are registered unless explicitly overridden by options.

#### Scenario: Default options with registered tools
- **WHEN** a caller invokes the non-streaming API without explicitly configuring stream or tool mode and tools are registered
- **THEN** the runtime SHALL run non-streaming execution with tool-calling enabled

