## Why

Agent Skills are a proven pattern for packaging domain-specific instructions, code, and resources into reusable, filesystem-based modules. The SKILL.md format has achieved ecosystem consensus with **54,000+ skills installed** across platforms like Claude Code, Cline, Windsurf, and Roo Code. SISU currently lacks a way to leverage this massive ecosystem of pre-built workflows, domain expertise, and best practices. By adopting file-based skills, SISU users gain instant access to this ecosystem while maintaining SISU's philosophy of explicit, composable, and observable architecture.

## What Changes

- **New middleware package** `@sisu-ai/mw-skills` (~330 lines, zero new dependencies)
  - Custom YAML frontmatter parser (no `js-yaml` dependency)
  - Filesystem skill discovery (scans `.sisu/skills`, `.claude/skills`, `.cline/skills`)
  - `use_skill` tool for LLM-native semantic matching
  - Progressive disclosure (metadata → instructions → resources)
  - Type-safe with Zod validation

- **New skills packages** (`packages/skills/`)
  - 5+ installable skill packages: `@sisu-ai/skill-code-review`, `@sisu-ai/skill-deploy`, `@sisu-ai/skill-test-gen`, `@sisu-ai/skill-debug`, `@sisu-ai/skill-explain`
  - Each follows SKILL.md format (compatible with skills.sh ecosystem)
  - Installable via npm/pnpm alongside middleware and tools

- **New examples**
  - `examples/openai-skills/` - Demonstrates skills with OpenAI models
  - `examples/anthropic-skills/` - Demonstrates skills with Anthropic models

- **Documentation additions**
  - Tool alias usage guide (no changes to existing tools required)
  - Skill authoring guide
  - Integration with skills.sh ecosystem

## Capabilities

### New Capabilities

- `skills-middleware`: Middleware package that discovers, loads, and manages filesystem-based skills with progressive disclosure and LLM-native matching
- `skills-packages`: Collection of installable, high-quality reference skill implementations
- `skills-examples`: Example projects demonstrating skills usage across different LLM providers

### Modified Capabilities

_None - this is a purely additive change with zero breaking changes to existing SISU APIs_

## Impact

**Affected Code:**

- New: `packages/middleware/skills/` (new middleware package)
- New: `packages/skills/skill-*/` (5+ new skill packages)
- New: `examples/openai-skills/` and `examples/anthropic-skills/`
- Documentation: Tool alias usage patterns, skill authoring guide

**Dependencies:**

- Zero new dependencies (reuses existing `zod` dependency)
- No changes to existing tools or middleware

**Systems:**

- Compatible with skills.sh ecosystem (54,000+ existing skills)
- Works with existing SISU tool system via alias support
- Integrates with all existing middleware (tracing, error handling, etc.)

**Breaking Changes:**

- None - purely additive feature
