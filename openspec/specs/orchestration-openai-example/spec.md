## Purpose

Define requirements for the OpenAI orchestration reference example.

## Requirements
### Requirement: OpenAI orchestration example demonstrates delegated execution
The repository SHALL include an `examples/openai-orchestration` example that demonstrates orchestration middleware with delegated child execution using OpenAI-compatible adapters.

#### Scenario: Developer runs orchestration example
- **WHEN** a developer executes the OpenAI orchestration example command
- **THEN** the run MUST execute an orchestrator flow that performs at least one `delegateTask` before `finish`

### Requirement: Example surfaces orchestration observability
The OpenAI orchestration example SHALL produce trace artifacts and logs that make parent-child delegation visible.

#### Scenario: Trace inspection
- **WHEN** the example runs with tracing enabled
- **THEN** generated trace artifacts MUST include delegation lifecycle visibility and parent-child run linkage metadata

### Requirement: Example documents setup and expected behavior
The OpenAI orchestration example SHALL include a README with prerequisites, run command, and expected orchestration behavior.

#### Scenario: Developer follows README
- **WHEN** a developer reads the example README
- **THEN** they MUST have clear instructions for environment variables, invocation, and what delegation behavior to expect
