## ADDED Requirements

### Requirement: Require explicit directory configuration

The middleware SHALL require explicit configuration of skill directories with no implicit defaults, following SISU's principle of explicit over magic.

#### Scenario: Reject initialization without directories

- **WHEN** the middleware is initialized without `directories` or `directory` parameter
- **THEN** it SHALL throw an error requiring explicit directory configuration

#### Scenario: Accept single directory configuration

- **WHEN** the middleware is configured with `{ directory: '.sisu/skills' }`
- **THEN** it SHALL scan only that directory for SKILL.md files

#### Scenario: Accept multiple directories configuration

- **WHEN** the middleware is configured with `{ directories: ['.sisu/skills', '.claude/skills'] }`
- **THEN** it SHALL scan all specified directories for SKILL.md files

#### Scenario: User controls ecosystem compatibility

- **WHEN** user wants ecosystem skills from skills.sh
- **THEN** user MUST explicitly add `.claude/skills` or `.cline/skills` to the directories list

### Requirement: Discover skills from configured directories

The middleware SHALL discover skills only from explicitly configured filesystem directories following the SKILL.md format convention.

#### Scenario: Scan configured directories

- **WHEN** directories are explicitly configured
- **THEN** the middleware SHALL scan only those directories for SKILL.md files

#### Scenario: Handle missing directories gracefully

- **WHEN** a configured directory does not exist
- **THEN** the middleware SHALL log a warning and skip that directory without failing initialization

#### Scenario: Handle invalid SKILL.md files

- **WHEN** a SKILL.md file has invalid YAML frontmatter or malformed content
- **THEN** the middleware SHALL log a warning and skip that skill without failing initialization

#### Scenario: Resolve relative paths from cwd

- **WHEN** directories are specified as relative paths
- **THEN** they SHALL be resolved relative to the configured `cwd` option or `process.cwd()`

### Requirement: Parse SKILL.md frontmatter without external dependencies

The middleware SHALL parse YAML frontmatter from SKILL.md files using a custom parser with zero external dependencies.

#### Scenario: Parse simple key-value pairs

- **WHEN** frontmatter contains `name: deploy-staging` and `description: Deploy app`
- **THEN** the parser SHALL extract both fields correctly

#### Scenario: Parse array values

- **WHEN** frontmatter contains `tags: [deployment, staging, devops]`
- **THEN** the parser SHALL extract the array with all three items

#### Scenario: Parse multiline arrays

- **WHEN** frontmatter contains a YAML list with `- item1` and `- item2` on separate lines
- **THEN** the parser SHALL extract both items as an array

#### Scenario: Handle missing frontmatter

- **WHEN** a SKILL.md file has no YAML frontmatter delimiters
- **THEN** the parser SHALL treat the entire file as instructions with empty metadata

### Requirement: Validate skill metadata with Zod schemas

The middleware SHALL validate parsed skill metadata against strict type schemas before making skills available.

#### Scenario: Validate required fields

- **WHEN** skill metadata is missing the required `name` field
- **THEN** validation SHALL fail and the skill SHALL be skipped with a logged error

#### Scenario: Validate field types

- **WHEN** skill metadata has `tags` as a string instead of an array
- **THEN** validation SHALL fail and the skill SHALL be skipped with a logged error

#### Scenario: Accept valid metadata

- **WHEN** skill metadata contains `name`, `description`, and optional `version`, `author`, `tags` fields with correct types
- **THEN** validation SHALL succeed and the skill SHALL be available for use

### Requirement: Provide use_skill tool for LLM-native activation

The middleware SHALL register a `use_skill` tool that allows the LLM to activate skills by name using semantic matching.

#### Scenario: Activate skill by exact name

- **WHEN** LLM calls `use_skill({ skill_name: "deploy-staging" })`
- **THEN** the tool SHALL return the full skill instructions and list of available resources

#### Scenario: Handle non-existent skill

- **WHEN** LLM calls `use_skill({ skill_name: "unknown-skill" })`
- **THEN** the tool SHALL return an error message indicating the skill was not found

#### Scenario: Return skill resources list

- **WHEN** a skill contains bundled files like `scripts/deploy.sh` and `docs/checklist.md`
- **THEN** the tool's response SHALL list all available resources with their relative paths

### Requirement: Inject skill metadata into system prompt

The middleware SHALL add discovered skill metadata to the system prompt for LLM awareness without requiring embeddings.

#### Scenario: List skills in system prompt

- **WHEN** 3 skills are discovered with names and descriptions
- **THEN** the system prompt SHALL include a formatted list showing all skill names and one-line descriptions

#### Scenario: Include usage instructions

- **WHEN** skills are available
- **THEN** the system prompt SHALL include instructions on how to activate skills using the `use_skill` tool

#### Scenario: Handle zero skills gracefully

- **WHEN** no skills are discovered in any directory
- **THEN** the system prompt SHALL NOT include any skills section

### Requirement: Implement progressive disclosure strategy

The middleware SHALL minimize context usage by loading skill content progressively in three levels.

#### Scenario: Level 1 - Always load metadata

- **WHEN** the middleware initializes
- **THEN** only skill names and descriptions SHALL be loaded into the system prompt

#### Scenario: Level 2 - Load instructions on activation

- **WHEN** LLM calls `use_skill` for a specific skill
- **THEN** the full instruction content SHALL be loaded and returned in the tool response

#### Scenario: Level 3 - Load resources on demand

- **WHEN** LLM reads a skill resource file via `read_file` or similar tool
- **THEN** the resource content SHALL be loaded only at that moment

### Requirement: Support skill resource bundling

The middleware SHALL discover and track bundled resources (scripts, templates, references) alongside each skill.

#### Scenario: Discover resources in skill directory

- **WHEN** a skill's directory contains files like `deploy.sh`, `template.yaml`, `checklist.md`
- **THEN** all files SHALL be tracked as available resources for that skill

#### Scenario: Classify resource types

- **WHEN** resources have extensions `.sh`, `.bash`, `.py`
- **THEN** they SHALL be classified as type `script`

#### Scenario: Exclude SKILL.md from resources

- **WHEN** discovering resources in a skill directory
- **THEN** the SKILL.md file itself SHALL NOT be listed as a resource

### Requirement: Provide configuration options

The middleware SHALL accept configuration options for directories, file size limits, and caching behavior.

#### Scenario: Configure custom working directory

- **WHEN** initialized with `{ cwd: '/custom/path' }`
- **THEN** skill discovery SHALL use that path as the base for relative directory scanning

#### Scenario: Configure file size limits

- **WHEN** initialized with `{ maxFileSize: 50000 }`
- **THEN** resource files larger than 50KB SHALL be rejected with a logged warning

#### Scenario: Configure skill inclusion filter

- **WHEN** initialized with `{ include: ['deploy-staging', 'run-tests'] }`
- **THEN** only skills with those names SHALL be made available

#### Scenario: Configure skill exclusion filter

- **WHEN** initialized with `{ exclude: ['legacy-deploy'] }`
- **THEN** skills with those names SHALL be skipped during discovery

### Requirement: Integrate with existing SISU middleware stack

The middleware SHALL work seamlessly with all existing SISU middleware without requiring modifications to core or adapters.

#### Scenario: Compose with tracing middleware

- **WHEN** used alongside `@sisu-ai/mw-trace-viewer`
- **THEN** skill discovery, activation, and resource loading SHALL be traced and visible in trace outputs

#### Scenario: Compose with error boundary

- **WHEN** used alongside `@sisu-ai/mw-error-boundary`
- **THEN** errors during skill operations SHALL be caught and handled gracefully without crashing the agent

#### Scenario: Compose with tool calling

- **WHEN** used alongside `@sisu-ai/mw-tool-calling`
- **THEN** the `use_skill` tool SHALL be registered and callable like any other tool

### Requirement: Maintain type safety with TypeScript

The middleware SHALL provide fully typed APIs with no use of `any` type.

#### Scenario: Export typed interfaces

- **WHEN** developers import the middleware
- **THEN** TypeScript SHALL provide autocomplete and type checking for all configuration options

#### Scenario: Type skill objects

- **WHEN** working with discovered skills in context
- **THEN** skill objects SHALL have typed fields for `metadata`, `instructions`, `resources`, etc.

#### Scenario: Type tool handlers

- **WHEN** the `use_skill` tool is called
- **THEN** its input schema and return type SHALL be fully typed
