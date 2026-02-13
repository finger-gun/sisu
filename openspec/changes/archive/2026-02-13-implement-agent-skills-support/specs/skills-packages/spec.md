## ADDED Requirements

### Requirement: Provide installable skill packages

SISU SHALL provide a collection of high-quality skill packages that can be installed via npm/pnpm alongside middleware and tools.

#### Scenario: Install skill via package manager

- **WHEN** developer runs `pnpm add @sisu-ai/skill-code-review`
- **THEN** the skill SHALL be installed as a standard npm package with SKILL.md and bundled resources

#### Scenario: Skill packages follow monorepo structure

- **WHEN** skills are published
- **THEN** they SHALL be located under `packages/skills/skill-*/` in the SISU monorepo

#### Scenario: Skills work without installation

- **WHEN** a skill package is installed
- **THEN** the SKILL.md file SHALL be usable by copying to `.sisu/skills` or discovered via package path

### Requirement: Follow skills.sh SKILL.md format

All SISU skill packages SHALL use the standard SKILL.md format for ecosystem compatibility.

#### Scenario: Compatible with skills.sh ecosystem

- **WHEN** a SISU skill is copied to a Claude Code, Cline, or Windsurf project
- **THEN** it SHALL work without modification in those environments

#### Scenario: Include YAML frontmatter

- **WHEN** a SISU skill is opened
- **THEN** it SHALL have YAML frontmatter with `name`, `description`, and optional `version`, `author`, `tags` fields

#### Scenario: Use markdown body for instructions

- **WHEN** a SISU skill is activated
- **THEN** the content after frontmatter SHALL provide clear, actionable instructions for the LLM

### Requirement: Provide code-review skill

SISU SHALL provide a `@sisu-ai/skill-code-review` package for performing security and quality code reviews.

#### Scenario: Package includes review checklist

- **WHEN** the code-review skill is installed
- **THEN** it SHALL include a bundled checklist covering security, performance, maintainability, and testing concerns

#### Scenario: Skill guides systematic review

- **WHEN** activated by an LLM
- **THEN** the skill SHALL provide step-by-step instructions for conducting a thorough code review

#### Scenario: Addresses TypeScript projects

- **WHEN** used in a TypeScript codebase
- **THEN** the skill SHALL include TypeScript-specific review considerations

### Requirement: Provide deploy skill

SISU SHALL provide a `@sisu-ai/skill-deploy` package for deployment workflows with safety checks.

#### Scenario: Package includes deployment script template

- **WHEN** the deploy skill is installed
- **THEN** it SHALL include reference deployment scripts for common scenarios

#### Scenario: Skill includes pre-deployment checklist

- **WHEN** activated by an LLM
- **THEN** the skill SHALL guide through pre-deployment verification steps (tests, builds, health checks)

#### Scenario: Skill includes rollback procedure

- **WHEN** deployment issues occur
- **THEN** the skill SHALL provide clear rollback instructions and recovery steps

### Requirement: Provide test-gen skill

SISU SHALL provide a `@sisu-ai/skill-test-gen` package for generating comprehensive test suites.

#### Scenario: Skill guides unit test creation

- **WHEN** activated for a function or module
- **THEN** the skill SHALL provide instructions for creating unit tests with edge cases

#### Scenario: Skill enforces coverage targets

- **WHEN** generating tests
- **THEN** the skill SHALL guide toward ≥80% coverage target aligned with SISU standards

#### Scenario: Skill supports Vitest framework

- **WHEN** generating tests for SISU projects
- **THEN** the skill SHALL use Vitest syntax and conventions

### Requirement: Provide debug skill

SISU SHALL provide a `@sisu-ai/skill-debug` package for systematic debugging workflows.

#### Scenario: Skill guides problem reproduction

- **WHEN** activated for a bug report
- **THEN** the skill SHALL guide through steps to reproduce the issue reliably

#### Scenario: Skill includes debugging techniques

- **WHEN** investigating an issue
- **THEN** the skill SHALL suggest appropriate debugging approaches (logging, breakpoints, tracing, binary search)

#### Scenario: Skill guides root cause analysis

- **WHEN** symptoms are identified
- **THEN** the skill SHALL help trace back to underlying causes using systematic investigation

### Requirement: Provide explain skill

SISU SHALL provide a `@sisu-ai/skill-explain` package for explaining complex code and concepts.

#### Scenario: Skill structures explanations

- **WHEN** activated for a code module
- **THEN** the skill SHALL guide creation of explanations covering purpose, architecture, key concepts, and examples

#### Scenario: Skill adapts to audience level

- **WHEN** explaining code
- **THEN** the skill SHALL include guidance for adjusting explanation depth based on audience expertise

#### Scenario: Skill emphasizes documentation standards

- **WHEN** creating explanations
- **THEN** the skill SHALL encourage clear, maintainable documentation following SISU conventions

### Requirement: Package skills with proper npm metadata

All skill packages SHALL include proper package.json with metadata, keywords, and repository links.

#### Scenario: Include discovery keywords

- **WHEN** a skill package is published
- **THEN** package.json SHALL include keywords like `sisu`, `ai-agent`, `skill`, and domain-specific tags

#### Scenario: Link to monorepo source

- **WHEN** a skill package is published
- **THEN** package.json SHALL include repository links pointing to the SISU monorepo with correct directory path

#### Scenario: Specify Apache-2.0 license

- **WHEN** a skill package is published
- **THEN** it SHALL use Apache-2.0 license consistent with SISU framework

### Requirement: Provide README documentation for each skill

Each skill package SHALL include a README explaining its purpose, usage, and bundled resources.

#### Scenario: Explain skill purpose

- **WHEN** viewing a skill's README
- **THEN** it SHALL clearly describe what problem the skill solves and when to use it

#### Scenario: Show installation instructions

- **WHEN** viewing a skill's README
- **THEN** it SHALL include `pnpm add @sisu-ai/skill-<name>` installation command

#### Scenario: List bundled resources

- **WHEN** viewing a skill's README
- **THEN** it SHALL document what additional files (scripts, templates, checklists) are included
