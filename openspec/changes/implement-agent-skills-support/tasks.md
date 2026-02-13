## 1. Package Setup

- [x] 1.1 Create `packages/middleware/skills/` directory structure
- [x] 1.2 Create `package.json` with dependencies (zod only)
- [x] 1.3 Create `tsconfig.json` extending base config
- [x] 1.4 Create `vitest.config.ts` with ≥80% coverage threshold
- [x] 1.5 Add package to workspace in root `pnpm-workspace.yaml`

## 2. Core Types and Schemas

- [x] 2.1 Create `src/types.ts` with Skill, SkillMetadata, SkillResource interfaces
- [x] 2.2 Create `src/schemas.ts` with Zod schema for SkillMetadata validation
- [x] 2.3 Define SkillsOptions interface with directories, directory, cwd, maxFileSize, maxSkillSize, cacheTtl, include, exclude
- [x] 2.4 Define SkillDiscoveryResult interface

## 3. YAML Frontmatter Parser

- [x] 3.1 Create `src/parser.ts` with parseFrontmatter function
- [x] 3.2 Implement regex-based frontmatter extraction (--- delimiters)
- [x] 3.3 Implement simple YAML parsing for key: value pairs
- [x] 3.4 Implement array parsing (inline [item1, item2] and multiline - item)
- [x] 3.5 Handle missing frontmatter gracefully (return empty metadata)
- [x] 3.6 Write unit tests for parser (valid frontmatter, arrays, missing frontmatter, edge cases)

## 4. Filesystem Discovery

- [x] 4.1 Create `src/discover.ts` with discoverSkills function
- [x] 4.2 Validate that directories or directory option is provided (throw if missing)
- [x] 4.3 Normalize directory paths (handle both single directory and directories array)
- [x] 4.4 Resolve relative paths using cwd option or process.cwd()
- [x] 4.5 Scan configured directories for SKILL.md files recursively
- [x] 4.6 Parse each SKILL.md file using frontmatter parser
- [x] 4.7 Validate metadata with Zod schema (skip invalid with warning)
- [x] 4.8 Discover bundled resources in skill directories (exclude SKILL.md itself)
- [x] 4.9 Classify resource types (script, template, reference, other) by extension
- [x] 4.10 Apply include/exclude filters if configured
- [x] 4.11 Handle missing directories gracefully (log warning, skip)
- [x] 4.12 Handle file read errors gracefully (log warning, skip skill)
- [x] 4.13 Write unit tests for discovery (valid skills, invalid files, missing dirs, filters)

## 5. use_skill Tool Handler

- [x] 5.1 Create `src/tool-handler.ts` with createUseSkillTool function
- [x] 5.2 Define tool schema with skill_name parameter (Zod string)
- [x] 5.3 Implement tool handler to find skill by name
- [x] 5.4 Return full skill instructions when skill found
- [x] 5.5 Return list of available resources with relative paths
- [x] 5.6 Return error message when skill not found
- [x] 5.7 Write unit tests for tool handler (success, not found, resources list)

## 6. Main Middleware

- [x] 6.1 Create `src/index.ts` with skillsMiddleware function
- [x] 6.2 Validate directories/directory option (throw if neither provided)
- [x] 6.3 Call discoverSkills on first middleware execution (cache in ctx.state)
- [x] 6.4 Register use_skill tool via ctx.tools
- [x] 6.5 Inject skill metadata into system prompt (Level 1 progressive disclosure)
- [x] 6.6 Format skills list with names and descriptions
- [x] 6.7 Add usage instructions to system prompt
- [x] 6.8 Handle zero skills gracefully (no system prompt modification)
- [x] 6.9 Export all types and interfaces
- [x] 6.10 Write integration tests (middleware composition, skill activation flow)

## 7. Skills Packages

- [x] 7.1 Create `packages/skills/skill-code-review/` with SKILL.md and package.json
- [x] 7.2 Create `packages/skills/skill-deploy/` with SKILL.md and package.json
- [x] 7.3 Create `packages/skills/skill-test-gen/` with SKILL.md and package.json
- [x] 7.4 Create `packages/skills/skill-debug/` with SKILL.md and package.json
- [x] 7.5 Create `packages/skills/skill-explain/` with SKILL.md and package.json
- [x] 7.6 Add bundled resources to each skill (checklists, scripts, templates)
- [x] 7.7 Write README.md for each skill package
- [x] 7.8 Add Apache-2.0 license to each package
- [x] 7.9 Add proper npm keywords and repository links
- [x] 7.10 Validate all SKILL.md files follow format correctly

## 8. OpenAI Skills Example

- [x] 8.1 Create `examples/openai-skills/` directory
- [x] 8.2 Create package.json with core, adapter-openai, mw-skills, and 2+ skill packages
- [x] 8.3 Create tsconfig.json for the example
- [x] 8.4 Create src/index.ts with agent setup using OpenAI adapter
- [x] 8.5 Configure skills middleware with explicit directories
- [x] 8.6 Register tools with ecosystem-compatible aliases (read_file, etc.)
- [x] 8.7 Compose with traceViewer, errorBoundary, toolCalling middleware
- [x] 8.8 Implement realistic deployment scenario using deploy skill
- [x] 8.9 Create README.md with setup instructions and prerequisites
- [x] 8.10 Add dev and start scripts to package.json
- [x] 8.11 Test example runs and generates trace output

## 9. Anthropic Skills Example

- [x] 9.1 Create `examples/anthropic-skills/` directory
- [x] 9.2 Create package.json with core, adapter-anthropic, mw-skills, and 2+ skill packages
- [x] 9.3 Create tsconfig.json for the example
- [x] 9.4 Create src/index.ts with agent setup using Anthropic adapter
- [x] 9.5 Configure skills middleware with explicit directories
- [x] 9.6 Register tools with ecosystem-compatible aliases
- [x] 9.7 Compose with traceViewer, errorBoundary, toolCalling middleware
- [x] 9.8 Implement realistic code review scenario using code-review skill
- [x] 9.9 Create README.md with setup instructions and prerequisites
- [x] 9.10 Add dev and start scripts to package.json
- [x] 9.11 Test example runs and generates trace output

## 10. Documentation

- [x] 10.1 Write `packages/middleware/skills/README.md` with API reference
- [x] 10.2 Document explicit directory configuration requirement
- [x] 10.3 Document progressive disclosure strategy
- [x] 10.4 Document tool alias usage for ecosystem compatibility
- [x] 10.5 Create skill authoring guide in docs/
- [x] 10.6 Document SKILL.md format requirements
- [x] 10.7 Document how to bundle resources with skills
- [x] 10.8 Add troubleshooting section (common errors, debugging)
- [x] 10.9 Link to skills.sh ecosystem documentation
- [x] 10.10 Document configuration options with examples

## 11. Testing and Quality

- [x] 11.1 Ensure all unit tests pass with ≥80% coverage
- [x] 11.2 Run integration tests with real SISU skill packages
- [x] 11.3 Test with skills from skills.sh ecosystem (manual validation)
- [x] 11.4 Run linting (eslint) and fix any issues
- [x] 11.5 Run type checking (tsc --noEmit) and fix any errors
- [x] 11.6 Test both examples run successfully
- [x] 11.7 Verify trace outputs show skill discovery and activation
- [x] 11.8 Performance benchmark: skill discovery <100ms for 10 skills
- [x] 11.9 Test error handling (missing directories, invalid SKILL.md, etc.)

## 12. Build and Release

- [x] 12.1 Run `pnpm build` to build all packages
- [x] 12.2 Verify dist/ output for middleware package
- [x] 12.3 Verify skill packages build correctly
- [x] 12.4 Create changeset for @sisu-ai/mw-skills (minor version)
- [x] 12.5 Create changesets for each skill package (initial version)
- [x] 12.6 Update design document reference in docs/
- [x] 12.7 Run full test suite across monorepo
- [x] 12.8 Verify no breaking changes to existing packages
