## ADDED Requirements

### Requirement: Non-streaming execution SHALL return a typed result contract
The non-streaming execution API MUST return a typed result object that includes the final assistant message payload and execution metadata needed by callers.

#### Scenario: Access final output without message scraping
- **WHEN** a non-streaming execution completes successfully
- **THEN** the caller SHALL be able to read final assistant output from the returned result contract without traversing `ctx.messages`

### Requirement: Streaming execution SHALL emit a stable event contract
The streaming execution API MUST emit typed lifecycle events that include token output, tool execution lifecycle, final assistant message emission, completion, and error signaling.

#### Scenario: Tool lifecycle visibility in streaming
- **WHEN** a streaming run triggers one or more tool calls
- **THEN** the event stream SHALL include explicit tool lifecycle events that bracket each tool execution

### Requirement: Completion and error signaling SHALL be explicit
Both execution modes MUST provide explicit completion and error signaling and MUST propagate cancellation through the runtime without silent fallbacks.

#### Scenario: Cancellation propagation
- **WHEN** a caller aborts execution via `AbortSignal`
- **THEN** execution SHALL terminate with explicit cancellation signaling and SHALL NOT continue emitting normal completion output

