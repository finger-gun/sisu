## ADDED Requirements

### Requirement: CLI Scaffolds Maintained Starter Templates
The `sisu` CLI SHALL scaffold small maintained Sisu starter projects from built-in templates.

#### Scenario: Developer creates a chat starter
- **WHEN** a developer runs `sisu create chat-agent my-app`
- **THEN** the CLI MUST create a new project directory using the maintained `chat-agent` template assets

### Requirement: Template Scaffolding Uses Explicit Maintained Defaults
Scaffolded templates MUST use maintained Sisu package names and explicit setup instructions.

#### Scenario: Developer inspects generated project files
- **WHEN** the scaffold completes
- **THEN** generated files MUST reference maintained Sisu packages and include instructions for installing dependencies and running the project
