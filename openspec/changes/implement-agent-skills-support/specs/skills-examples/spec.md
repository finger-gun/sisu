## ADDED Requirements

### Requirement: Provide OpenAI skills example

SISU SHALL provide an `examples/openai-skills/` example demonstrating skills usage with OpenAI models.

#### Scenario: Demonstrate basic skills setup

- **WHEN** running the OpenAI skills example
- **THEN** it SHALL show how to initialize the skills middleware with OpenAI adapter

#### Scenario: Use SISU skill packages

- **WHEN** the example runs
- **THEN** it SHALL install and use at least 2 SISU skill packages (e.g., `@sisu-ai/skill-code-review`, `@sisu-ai/skill-deploy`)

#### Scenario: Show skill discovery

- **WHEN** the example initializes
- **THEN** it SHALL demonstrate automatic skill discovery from `.sisu/skills` directory

#### Scenario: Show skill activation

- **WHEN** the LLM encounters a relevant task
- **THEN** the example SHALL demonstrate the LLM calling `use_skill` and using skill instructions

#### Scenario: Include trace output

- **WHEN** the example completes
- **THEN** it SHALL generate an HTML trace file showing skill discovery, activation, and usage

### Requirement: Provide Anthropic skills example

SISU SHALL provide an `examples/anthropic-skills/` example demonstrating skills usage with Anthropic models.

#### Scenario: Demonstrate Claude integration

- **WHEN** running the Anthropic skills example
- **THEN** it SHALL show how to use skills with Claude models via the Anthropic adapter

#### Scenario: Show cross-platform compatibility

- **WHEN** the example uses skills
- **THEN** it SHALL demonstrate that the same SKILL.md files work identically across different LLM providers

#### Scenario: Use ecosystem skills

- **WHEN** the example runs
- **THEN** it SHALL include at least one skill installed from the skills.sh ecosystem in addition to SISU skills

#### Scenario: Include trace output

- **WHEN** the example completes
- **THEN** it SHALL generate an HTML trace file showing skill operations with Anthropic models

### Requirement: Examples demonstrate tool aliases

Both examples SHALL show how to register tools with ecosystem-compatible aliases without modifying existing tools.

#### Scenario: Register read_file alias

- **WHEN** setting up tool calling in examples
- **THEN** the code SHALL demonstrate registering a tool with both original name and ecosystem alias (e.g., `{ ...readFile, name: 'read_file' }`)

#### Scenario: Document alias rationale

- **WHEN** viewing example code
- **THEN** comments SHALL explain why aliases are used (skills.sh compatibility, cross-platform naming conventions)

#### Scenario: Show opt-in nature

- **WHEN** viewing example code
- **THEN** it SHALL be clear that aliases are optional and no changes to original tools were required

### Requirement: Examples include package.json configuration

Both examples SHALL include complete package.json files with all necessary dependencies.

#### Scenario: Include core dependencies

- **WHEN** installing example dependencies
- **THEN** package.json SHALL include `@sisu-ai/core`, appropriate adapter, and required middleware

#### Scenario: Include skill packages

- **WHEN** installing example dependencies
- **THEN** package.json SHALL include at least 2 SISU skill packages as dependencies

#### Scenario: Include dev scripts

- **WHEN** viewing package.json scripts
- **THEN** it SHALL include `dev` and `start` scripts for running the example

### Requirement: Examples include README with setup instructions

Both examples SHALL include comprehensive README files explaining how to run and understand the example.

#### Scenario: Document prerequisites

- **WHEN** viewing the README
- **THEN** it SHALL list required API keys, Node.js version, and pnpm installation

#### Scenario: Provide step-by-step setup

- **WHEN** following the README
- **THEN** it SHALL include numbered steps: install dependencies, configure API keys, run example

#### Scenario: Explain what happens

- **WHEN** reading the README
- **THEN** it SHALL describe what the example demonstrates and what output to expect

#### Scenario: Link to trace viewer

- **WHEN** the README explains output
- **THEN** it SHALL mention the generated HTML trace file and how to open it

### Requirement: Examples demonstrate middleware composition

Both examples SHALL show how skills middleware composes with other SISU middleware.

#### Scenario: Compose with trace viewer

- **WHEN** examples initialize the agent
- **THEN** they SHALL include `traceViewer()` middleware alongside skills middleware

#### Scenario: Compose with error boundary

- **WHEN** examples initialize the agent
- **THEN** they SHALL include `errorBoundary()` middleware to handle errors gracefully

#### Scenario: Compose with tool calling

- **WHEN** examples initialize the agent
- **THEN** they SHALL include `toolCalling()` middleware to enable the `use_skill` tool

#### Scenario: Show middleware order

- **WHEN** viewing example code
- **THEN** comments SHALL explain the significance of middleware ordering

### Requirement: Examples use realistic scenarios

Both examples SHALL demonstrate skills with realistic, practical use cases rather than trivial "hello world" examples.

#### Scenario: OpenAI example uses deployment scenario

- **WHEN** running the OpenAI example
- **THEN** it SHALL simulate a deployment workflow using the deploy skill

#### Scenario: Anthropic example uses code review scenario

- **WHEN** running the Anthropic example
- **THEN** it SHALL simulate a code review workflow using the code-review skill

#### Scenario: Examples show multi-turn interaction

- **WHEN** examples execute
- **THEN** they SHALL demonstrate the LLM activating skills, reading resources, and completing multi-step workflows

### Requirement: Examples include TypeScript source

Both examples SHALL be written in TypeScript with proper type annotations.

#### Scenario: Type-safe configuration

- **WHEN** viewing example source code
- **THEN** middleware options and context setup SHALL use TypeScript types

#### Scenario: Include tsconfig.json

- **WHEN** viewing example directory
- **THEN** it SHALL include tsconfig.json configured for the example

#### Scenario: Compile successfully

- **WHEN** running `pnpm build` in the example directory
- **THEN** TypeScript SHALL compile without errors or warnings
