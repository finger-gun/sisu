## 1. Package Setup

- [ ] 1.1 Create `packages/middleware/skills/` directory structure
- [ ] 1.2 Create `package.json` with dependencies (zod only)
- [ ] 1.3 Create `tsconfig.json` extending base config
- [ ] 1.4 Create `vitest.config.ts` with ≥80% coverage threshold
- [ ] 1.5 Add package to workspace in root `pnpm-workspace.yaml`

## 2. Core Types and Schemas

- [ ] 2.1 Create `src/types.ts` with Skill, SkillMetadata, SkillResource interfaces
- [ ] 2.2 Create `src/schemas.ts` with Zod schema for SkillMetadata validation
- [ ] 2.3 Define SkillsOptions interface with directories, directory, cwd, maxFileSize, maxSkillSize, cacheTtl, include, exclude
- [ ] 2.4 Define SkillDiscoveryResult interface

## 3. YAML Frontmatter Parser

- [ ] 3.1 Create `src/parser.ts` with parseFrontmatter function
- [ ] 3.2 Implement regex-based frontmatter extraction (--- delimiters)
- [ ] 3.3 Implement simple YAML parsing for key: value pairs
- [ ] 3.4 Implement array parsing (inline [item1, item2] and multiline - item)
- [ ] 3.5 Handle missing frontmatter gracefully (return empty metadata)
- [ ] 3.6 Write unit tests for parser (valid frontmatter, arrays, missing frontmatter, edge cases)

## 4. Filesystem Discovery

- [ ] 4.1 Create `src/discover.ts` with discoverSkills function
- [ ] 4.2 Validate that directories or directory option is provided (throw if missing)
- [ ] 4.3 Normalize directory paths (handle both single directory and directories array)
- [ ] 4.4 Resolve relative paths using cwd option or process.cwd()
- [ ] 4.5 Scan configured directories for SKILL.md files recursively
- [ ] 4.6 Parse each SKILL.md file using frontmatter parser
- [ ] 4.7 Validate metadata with Zod schema (skip invalid with warning)
- [ ] 4.8 Discover bundled resources in skill directories (exclude SKILL.md itself)
- [ ] 4.9 Classify resource types (script, template, reference, other) by extension
- [ ] 4.10 Apply include/exclude filters if configured
- [ ] 4.11 Handle missing directories gracefully (log warning, skip)
- [ ] 4.12 Handle file read errors gracefully (log warning, skip skill)
- [ ] 4.13 Write unit tests for discovery (valid skills, invalid files, missing dirs, filters)

## 5. use_skill Tool Handler

- [ ] 5.1 Create `src/tool-handler.ts` with createUseSkillTool function
- [ ] 5.2 Define tool schema with skill_name parameter (Zod string)
- [ ] 5.3 Implement tool handler to find skill by name
- [ ] 5.4 Return full skill instructions when skill found
- [ ] 5.5 Return list of available resources with relative paths
- [ ] 5.6 Return error message when skill not found
- [ ] 5.7 Write unit tests for tool handler (success, not found, resources list)

## 6. Main Middleware

- [ ] 6.1 Create `src/index.ts` with skillsMiddleware function
- [ ] 6.2 Validate directories/directory option (throw if neither provided)
- [ ] 6.3 Call discoverSkills on first middleware execution (cache in ctx.state)
- [ ] 6.4 Register use_skill tool via ctx.tools
- [ ] 6.5 Inject skill metadata into system prompt (Level 1 progressive disclosure)
- [ ] 6.6 Format skills list with names and descriptions
- [ ] 6.7 Add usage instructions to system prompt
- [ ] 6.8 Handle zero skills gracefully (no system prompt modification)
- [ ] 6.9 Export all types and interfaces
- [ ] 6.10 Write integration tests (middleware composition, skill activation flow)

## 7. Skills Packages

- [ ] 7.1 Create `packages/skills/skill-code-review/` with SKILL.md and package.json
- [ ] 7.2 Create `packages/skills/skill-deploy/` with SKILL.md and package.json
- [ ] 7.3 Create `packages/skills/skill-test-gen/` with SKILL.md and package.json
- [ ] 7.4 Create `packages/skills/skill-debug/` with SKILL.md and package.json
- [ ] 7.5 Create `packages/skills/skill-explain/` with SKILL.md and package.json
- [ ] 7.6 Add bundled resources to each skill (checklists, scripts, templates)
- [ ] 7.7 Write README.md for each skill package
- [ ] 7.8 Add Apache-2.0 license to each package
- [ ] 7.9 Add proper npm keywords and repository links
- [ ] 7.10 Validate all SKILL.md files follow format correctly

## 8. OpenAI Skills Example

- [ ] 8.1 Create `examples/openai-skills/` directory
- [ ] 8.2 Create package.json with core, adapter-openai, mw-skills, and 2+ skill packages
- [ ] 8.3 Create tsconfig.json for the example
- [ ] 8.4 Create src/index.ts with agent setup using OpenAI adapter
- [ ] 8.5 Configure skills middleware with explicit directories
- [ ] 8.6 Register tools with ecosystem-compatible aliases (read_file, etc.)
- [ ] 8.7 Compose with traceViewer, errorBoundary, toolCalling middleware
- [ ] 8.8 Implement realistic deployment scenario using deploy skill
- [ ] 8.9 Create README.md with setup instructions and prerequisites
- [ ] 8.10 Add dev and start scripts to package.json
- [ ] 8.11 Test example runs and generates trace output

## 9. Anthropic Skills Example

- [ ] 9.1 Create `examples/anthropic-skills/` directory
- [ ] 9.2 Create package.json with core, adapter-anthropic, mw-skills, and 2+ skill packages
- [ ] 9.3 Create tsconfig.json for the example
- [ ] 9.4 Create src/index.ts with agent setup using Anthropic adapter
- [ ] 9.5 Configure skills middleware with explicit directories
- [ ] 9.6 Register tools with ecosystem-compatible aliases
- [ ] 9.7 Compose with traceViewer, errorBoundary, toolCalling middleware
- [ ] 9.8 Implement realistic code review scenario using code-review skill
- [ ] 9.9 Create README.md with setup instructions and prerequisites
- [ ] 9.10 Add dev and start scripts to package.json
- [ ] 9.11 Test example runs and generates trace output

## 10. Documentation

- [ ] 10.1 Write `packages/middleware/skills/README.md` with API reference
- [ ] 10.2 Document explicit directory configuration requirement
- [ ] 10.3 Document progressive disclosure strategy
- [ ] 10.4 Document tool alias usage for ecosystem compatibility
- [ ] 10.5 Create skill authoring guide in docs/
- [ ] 10.6 Document SKILL.md format requirements
- [ ] 10.7 Document how to bundle resources with skills
- [ ] 10.8 Add troubleshooting section (common errors, debugging)
- [ ] 10.9 Link to skills.sh ecosystem documentation
- [ ] 10.10 Document configuration options with examples

## 11. Testing and Quality

- [ ] 11.1 Ensure all unit tests pass with ≥80% coverage
- [ ] 11.2 Run integration tests with real SISU skill packages
- [ ] 11.3 Test with skills from skills.sh ecosystem (manual validation)
- [ ] 11.4 Run linting (eslint) and fix any issues
- [ ] 11.5 Run type checking (tsc --noEmit) and fix any errors
- [ ] 11.6 Test both examples run successfully
- [ ] 11.7 Verify trace outputs show skill discovery and activation
- [ ] 11.8 Performance benchmark: skill discovery <100ms for 10 skills
- [ ] 11.9 Test error handling (missing directories, invalid SKILL.md, etc.)

## 12. Build and Release

- [ ] 12.1 Run `pnpm build` to build all packages
- [ ] 12.2 Verify dist/ output for middleware package
- [ ] 12.3 Verify skill packages build correctly
- [ ] 12.4 Create changeset for @sisu-ai/mw-skills (minor version)
- [ ] 12.5 Create changesets for each skill package (initial version)
- [ ] 12.6 Update design document reference in docs/
- [ ] 12.7 Run full test suite across monorepo
- [ ] 12.8 Verify no breaking changes to existing packages
