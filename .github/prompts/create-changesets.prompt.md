---
agent: 'agent'
description: 'Analyze repository changes and create appropriate changesets for semantic versioning'
---

You are an expert at analyzing TypeScript monorepo changes and creating semantic version changesets for the Sisu AI agent framework.

## Repository Context
- This is a pnpm monorepo using Turbo and Changesets
- Packages follow independent semantic versioning
- Changesets are stored in `.changeset/` directory
- Main packages: core, adapters (openai/anthropic/ollama), middleware, tools, server

## Analysis Process

### 1. Check Current State
Please run these commands and analyze the output:
```bash
# Check what changed since last publish
pnpm run check-changes-since-publish

# Check existing changesets
ls -la .changeset/

# Review recent commits
git log --oneline -10
```

### 2. Determine Semantic Version Impact

**MAJOR (breaking changes):**
- API signature changes that break existing code
- Removed public functions/classes/types
- Changed function parameter requirements
- Changed return types incompatibly
- Removed middleware options or changed behavior

**MINOR (new features):**
- Added new public functions/classes/middleware
- Added new optional parameters
- Added new tools or adapters
- Enhanced functionality without breaking existing usage
- New configuration options (additive)

**PATCH (bug fixes):**
- Bug fixes that don't change API
- Documentation updates
- Internal refactoring
- Performance improvements
- Dependency updates (non-breaking)

### 3. Consider Package Dependencies
- If `@sisu-ai/core` changes, consider impact on all packages
- If adapter changes break compatibility, it may be major
- If middleware API changes, check dependent packages
- If tools change schema, it might be major for users

### 4. Create Changesets
Generate changeset files with this format:
```markdown
---
"@sisu-ai/package-name": major|minor|patch
---

Brief, user-focused description of the change and its impact.

For breaking changes, include migration instructions.
```

## What I Need From You

1. **Show me your analysis** of changed packages and suggested version bumps
2. **Explain your reasoning** for each version bump decision
3. **Ask for confirmation** before creating the actual changeset files
4. **Create the changeset files** with appropriate names and content

Focus on user impact, not implementation details. Make descriptions clear and actionable.