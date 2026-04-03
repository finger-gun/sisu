# cli-skill-discovery-installation Specification

## Purpose
TBD - created by archiving change add-configurable-cli-capabilities. Update Purpose after archive.
## Requirements
### Requirement: CLI SHALL use `@sisu-ai` npm namespace as official discovery source
The CLI SHALL support package discovery and install workflows for Sisu-maintained capabilities from the `@sisu-ai` npm namespace.

#### Scenario: User searches official capabilities
- **WHEN** the user runs official capability discovery
- **THEN** the CLI MUST return matching `@sisu-ai` packages for tools, skills, and middleware with package metadata needed for installation

#### Scenario: Official package falls outside allowed namespace
- **WHEN** an install candidate is not in `@sisu-ai` namespace for official-mode install
- **THEN** the CLI MUST reject official install mode for that package and return a namespace validation error

### Requirement: CLI SHALL list official `@sisu-ai` capability packages by category
The CLI SHALL provide official package listing for middleware, tools, and skills using npm metadata and strict namespace-prefix filtering.

#### Scenario: User lists official middleware packages
- **WHEN** the user requests official middleware listing
- **THEN** the CLI MUST return packages matching the `@sisu-ai/mw-` prefix only

#### Scenario: User lists official tool packages
- **WHEN** the user requests official tool listing
- **THEN** the CLI MUST return packages matching the `@sisu-ai/tool-` prefix only

#### Scenario: User lists official skill packages
- **WHEN** the user requests official skill listing
- **THEN** the CLI MUST return packages matching the `@sisu-ai/skill-` prefix only

### Requirement: CLI SHALL discover skills from standard global and project directories
The runtime SHALL discover skills from `~/.sisu/skills` and `./.sisu/skills` using deterministic precedence and include discovered metadata in the capability registry.

#### Scenario: Same skill exists globally and in project
- **WHEN** a skill with the same identifier exists in both global and project directories
- **THEN** the project-local skill MUST take precedence for sessions launched in that project

#### Scenario: Skill directory contains invalid skill definition
- **WHEN** discovery encounters a malformed or incomplete skill package
- **THEN** the runtime MUST skip that skill, record a diagnostic entry, and continue loading valid skills

### Requirement: CLI SHALL support skill installation via command and script wrappers
The CLI SHALL provide a skill installation command that can target global or project directories, and script wrappers SHALL be able to call this command non-interactively.

#### Scenario: User installs a skill to global scope
- **WHEN** the user runs the install command with global scope
- **THEN** the CLI MUST place the skill assets under `~/.sisu/skills` and report success with installed skill ID and path

#### Scenario: Scripted installer invokes CLI install
- **WHEN** a wrapper script executes the install command with explicit arguments
- **THEN** the CLI MUST complete installation without interactive prompts unless required inputs are missing

### Requirement: Skill activation SHALL respect explicit enable and disable controls
Discovered skills SHALL not be invokable unless effective capability configuration permits them.

#### Scenario: Discovered skill is explicitly disabled
- **WHEN** a discovered skill is listed in effective disabled settings
- **THEN** the runtime MUST reject invocation attempts and return a structured disabled-capability message

#### Scenario: Skill is enabled and discovered
- **WHEN** a skill is both discovered and effectively enabled
- **THEN** the runtime MUST allow invocation through the chat skill pathway

