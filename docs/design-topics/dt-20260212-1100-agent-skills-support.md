# DT 20260212-1100: Agent Skills Support

**Date:** 2026-02-12  
**Status:** Approved  
**Priority:** High  
**Related:** Anthropic Claude Skills Architecture, skills.sh ecosystem

## Executive Summary

**Agent Skills** are a proven pattern for packaging domain-specific instructions, code, and resources into reusable, filesystem-based modules. Introduced by Anthropic for Claude, the SKILL.md format has achieved ecosystem consensus with **54,000+ skills installed** across platforms like Claude Code, Cline, Windsurf, Roo Code, and more.

### Recommendation

SISU will adopt **plain file-based skills** using the standard SKILL.md format. This enables:

- ✅ Instant access to 54,000+ existing skills from skills.sh
- ✅ Zero conversion effort - use skills as published
- ✅ Familiar format for developers already using other AI coding tools
- ✅ Portable skills that work across multiple platforms

### Key Design Decision

After extensive research (see `docs/research/`), we're adopting a **Cline-inspired architecture**:

- **Single middleware package** (~330 lines of code)
- **Zero new dependencies** (custom YAML parser, reuses Zod)
- **LLM-native semantic matching** (no embeddings API)
- **Template-based script execution** (safe, observable, flexible)
- **Compatible with ecosystem** (skills.sh, GitHub repos)

---

## Context

### What Are Skills?

Skills differ from tools in both purpose and structure:

| Aspect         | Tools (SISU's existing system) | Skills (proposed)                                 |
| -------------- | ------------------------------ | ------------------------------------------------- |
| **Purpose**    | Execute specific functions     | Provide workflow guidance and domain expertise    |
| **Content**    | Handler + schema               | Instructions + code + resources                   |
| **Loading**    | All registered at startup      | Progressive (metadata → instructions → resources) |
| **Invocation** | LLM function calls             | Triggered by semantic match or @-mention          |
| **Scope**      | Single operation               | Multi-step workflows                              |
| **Examples**   | `getWeather()`, `searchWeb()`  | "PDF Processing", "Sales Analysis", "Code Review" |

**Tools are best for**: Atomic operations, I/O-bound tasks, deterministic functions.  
**Skills are best for**: Complex workflows, domain expertise, best practices, procedural knowledge.

### The SKILL.md Format

The standard format used across the ecosystem:

```markdown
---
name: deploy-to-staging
description: Deploy application to staging environment with safety checks
version: 1.0.0
author: team-devops
---

# Deployment to Staging

## Pre-deployment Checklist

1. Run test suite: `npm test`
2. Check code coverage > 80%
3. Review security scan results

## Deployment Steps

1. Build application: `npm run build`
2. Sync to staging server
3. Restart application
4. Verify health checks pass

See `./scripts/deploy.sh` for reference implementation.

## Rollback Procedure

If deployment fails, run `./scripts/rollback.sh`
```

### Why File-Based Skills?

**Ecosystem Network Effects** - The decision comes down to:

> _Should SISU create a new, incompatible skill ecosystem, or tap into the existing 54,000+ skill install ecosystem?_

**The ecosystem value far outweighs any philosophical purity concerns:**

1. **Massive Value**: 54,143 skill installs for React, Next.js, Vercel, Design, SEO, Testing, etc.
2. **Proven Pattern**: Battle-tested in production across multiple platforms
3. **Developer Familiarity**: Markdown is universal, no TypeScript required
4. **Portability**: Skills work across Claude Code, Cline, Cursor, Windsurf, SISU, etc.
5. **Lower Barrier**: Anyone can create skills, network effects compound
6. **Standard Tooling**: `npx skills add owner/repo` works out of the box

---

## Recommended Architecture

### Single Package Design (Cline-Inspired)

After analyzing Cline's production implementation (57.8K GitHub stars), we discovered skills can be implemented in **~330 lines with zero new dependencies**:

```
@sisu-ai/mw-skills
├─ src/
│  ├─ index.ts          # Main middleware (~50 lines)
│  ├─ discover.ts       # Filesystem scanning (~100 lines)
│  ├─ frontmatter.ts    # Custom YAML parser (~50 lines)
│  ├─ tool-handler.ts   # use_skill tool (~80 lines)
│  ├─ types.ts          # TypeScript types (~30 lines)
│  └─ schemas.ts        # Zod validation (~20 lines)
└─ package.json
    dependencies: { "zod": "^3.x" }  # Already in SISU ✅
```

### Key Implementation Details

#### 1. YAML Parsing (Dependency-Free)

Custom simple parser for frontmatter (sufficient for skills):

```typescript
// Handles only simple key: value pairs
export function parseSimpleYamlFrontmatter(markdown: string): {
  data: Record<string, string>;
  body: string;
} {
  const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = markdown.match(regex);
  if (!match) return { data: {}, body: markdown };

  const [, yamlContent, body] = match;
  const data: Record<string, string> = {};

  // Parse simple key: value pairs (no nested objects/arrays)
  // Sufficient for skills: name, description, author, version, tags
}
```

**Why not use `js-yaml` or `gray-matter`?**

- Skills only use simple frontmatter (no complex YAML needed)
- Zero dependencies aligns with SISU's philosophy
- Can add full YAML library later if actually needed

#### 2. Activation: LLM-Native Matching

**No embeddings or vector similarity** - rely on LLM's natural language understanding:

```typescript
export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // Validate explicit configuration
    if (!options.directories && !options.directory) {
      throw new Error(
        "skills middleware requires explicit directory configuration",
      );
    }

    // Discover skills once from configured directories
    if (!ctx.skills) {
      ctx.skills = await discoverSkills(options);
    }

    // Add use_skill tool
    ctx.tools.push(useSkillTool(ctx.skills));

    // Level 1: Inject skill metadata into system prompt
    if (ctx.skills.length > 0) {
      const skillsList = ctx.skills
        .map((s) => `  - "${s.name}": ${s.description}`)
        .join("\n");

      ctx.systemPrompt += `\n\nSKILLS\n\nAvailable skills:\n${skillsList}\n\nTo use a skill, call the use_skill tool with the skill name.`;
    }

    await next();
  };
}
```

**Why this works without embeddings:**

- Modern LLMs excel at semantic understanding naturally
- Skill descriptions already optimized for LLM understanding
- Scales to ~100 skills before context limits
- Zero cost, zero latency, zero dependencies for matching

#### 3. Tool-Based Activation

Single tool handles skill activation:

```typescript
const useSkillTool = {
  name: "use_skill",
  description: "Activate a skill to load its full instructions and resources",
  schema: z.object({
    skill_name: z.string(),
  }),
  handler: async (ctx, args) => {
    const skill = ctx.skills.get(args.skill_name);
    if (!skill) {
      return `Skill "${args.skill_name}" not found.`;
    }

    // Level 2: Return full instructions
    return `
Skill: ${skill.name}

${skill.instructions}

Available resources:
${skill.resources.map((r) => `- ${r.relativePath}`).join("\n")}
    `;
  },
};
```

#### 4. Script Execution: Template Pattern

Scripts are **read as text** and **adapted by the LLM**, not executed directly:

```markdown
---
name: deploy-staging
description: Deploy to staging environment
---

# Deployment

See `./deploy.sh` for reference script. Adapt for your environment:

- Change server address
- Update build command
- Modify restart procedure
```

**LLM Behavior:**

1. Skill activated, sees reference to `./deploy.sh`
2. LLM calls `read_file('./deploy.sh')` using existing tool
3. Reads script content, understands it
4. Adapts commands for current project
5. Proposes execution via `bash` tool
6. User reviews and approves
7. Commands execute via existing tool

**Why Template Pattern?**

- ✅ **Safe**: User reviews before execution
- ✅ **Flexible**: LLM adapts to environment
- ✅ **Observable**: Every command visible
- ✅ **Aligns with SISU**: Explicit, composable
- ✅ **No new code**: Reuses existing tools

#### 5. Resource Loading: Lazy

Resources loaded on-demand when LLM requests them:

```typescript
// Extend existing read_file tool (small modification)
async function readFile(ctx, args) {
  // NEW: Check if path refers to active skill resource
  if (ctx.state.activeSkills) {
    for (const skill of ctx.state.activeSkills) {
      if (args.path.startsWith("./")) {
        const resource = skill.resources.find(
          (r) => r.relativePath === args.path.replace("./", ""),
        );
        if (resource) {
          return fs.readFile(resource.path, "utf-8");
        }
      }
    }
  }

  // Existing: Normal file read
  return fs.readFile(args.path, "utf-8");
}
```

### Usage Example

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { skillsMiddleware } from "@sisu-ai/mw-skills";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { toolCalling } from "@sisu-ai/mw-tool-calling";

const agent = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(
    skillsMiddleware({
      directories: [".sisu/skills"], // Explicit directory configuration
    }),
  )
  .use(toolCalling);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Deploy the app to staging",
  systemPrompt: "You are a helpful assistant.",
});

await agent.handler()(ctx);
// Skills discovered from configured directories, matched, and used
```

### Installing Skills from Ecosystem

```bash
# Install from skills.sh
npx skills add vercel-labs/agent-skills/web-design-guidelines

# Creates: ./.claude/skills/web-design-guidelines/SKILL.md
```

**To use ecosystem skills, explicitly configure the directory:**

```typescript
const agent = new Agent().use(
  skillsMiddleware({
    directories: [
      ".sisu/skills", // SISU skills
      ".claude/skills", // Ecosystem skills (opt-in)
    ],
  }),
);
```

**Why explicit?** User controls which skill sources to use. No surprises, better performance, clear behavior.

---

## Progressive Disclosure

Skills use a two-level loading strategy to minimize context usage:

### Level 1: Metadata (Always in Context)

```
Available skills:
  - "deploy-staging": Deploy application to staging environment
  - "run-tests": Execute test suite with coverage reporting
  - "code-review": Perform security and quality code review
```

**Behavior**: Always injected in system prompt, minimal tokens.

### Level 2: Full Instructions (On Activation)

When LLM calls `use_skill('deploy-staging')`:

```markdown
Skill: deploy-staging

# Deployment to Staging

## Pre-deployment Checklist

1. Run test suite
2. Check coverage > 80%
3. Review security scan

## Deployment Steps

...

Available resources:

- scripts/deploy.sh
- scripts/rollback.sh
- docs/checklist.md
```

**Behavior**: Full instructions loaded into context when skill is used.

### Level 3: Resources (On Demand)

When LLM reads `./scripts/deploy.sh`:

- File content loaded lazily
- Cached for session (5min TTL)
- Size limited (100KB per file, 500KB per skill)

---

## Compatibility with SISU Philosophy

### Explicit ✅

- Directories explicitly configured (required parameter)
- No implicit scanning of default paths
- Skills explicitly activated via tool call
- Execution explicit (user approval of bash commands)
- Configuration explicit (paths, limits)

### Composable ✅

- Single middleware, works with all existing middleware
- Reuses existing tools (read_file, bash)
- No changes to core or adapters
- Can mix skills with tools

### Observable ✅

- Skill loading logged
- Activation traced
- Tool calls visible
- All commands shown to user before execution

### Type-Safe ✅

- Skill types defined
- Zod validation for frontmatter
- Tool schemas enforced
- Parsed into typed objects internally

---

## Alternative Approaches Considered

### Option A: In-Memory Skills (TypeScript-Only)

```typescript
// Define skills in code
const pdfSkill: Skill = {
  name: "pdf-processing",
  description: "Extract text from PDFs",
  instructions: `...`,
  tools: [extractPdfText],
};

agent.use(registerSkills([pdfSkill]));
```

**Rejected because:**

- ❌ Cannot use existing ecosystem skills
- ❌ High barrier to skill creation (requires TypeScript)
- ❌ Poor portability (SISU-specific)
- ❌ Must publish to npm for sharing

### Option B: Skills as Tool Factories

```typescript
const skill = {
  name: "deployment",
  generateTools: (ctx) => [deployTool, rollbackTool],
};
```

**Rejected because:**

- ❌ Loses the "guidance" aspect of skills
- ❌ Doesn't match ecosystem pattern
- ❌ Can't leverage existing skills

### Option C: Middleware-First Design

```typescript
// Each skill is custom middleware
agent.use(pdfSkillMiddleware());
agent.use(deploymentSkillMiddleware());
```

**Rejected because:**

- ❌ Requires middleware expertise for skill authors
- ❌ No standardization
- ❌ Can't use ecosystem skills
- ❌ Too low-level

### Why File-Based Skills Won

**The filesystem approach provides the best combination of:**

- Ecosystem access (54K+ skills)
- Developer familiarity (markdown)
- Portability (works across tools)
- Simplicity (just files)
- Network effects (more skills = more value)

**And still aligns with SISU:**

- Explicit (configured in code)
- Observable (all logged/traced)
- Composable (one middleware)
- Type-safe (parsed to typed objects)

---

## Implementation Plan

### Phase 1: Core Package (Week 1)

**Deliverables:**

- `@sisu-ai/mw-skills` package structure
- Custom YAML parser (dependency-free)
- Filesystem discovery (scan .sisu, .claude, .cline directories)
- `use_skill` tool handler
- Core types and Zod schemas
- Unit tests (≥80% coverage)

**Files:**

- `packages/middleware/mw-skills/src/index.ts`
- `packages/middleware/mw-skills/src/discover.ts`
- `packages/middleware/mw-skills/src/frontmatter.ts`
- `packages/middleware/mw-skills/src/tool-handler.ts`
- `packages/middleware/mw-skills/src/types.ts`
- `packages/middleware/mw-skills/src/schemas.ts`
- `packages/middleware/mw-skills/test/*.test.ts`

### Phase 2: Skills Packages, Integration & Examples (Week 2)

**Deliverables:**

1. **SISU Skills Packages** (`packages/skills/`)
   - Create 5+ installable skill packages: `@sisu-ai/skill-code-review`, `@sisu-ai/skill-deploy`, `@sisu-ai/skill-test-gen`, `@sisu-ai/skill-debug`, `@sisu-ai/skill-explain`
   - Each skill follows SKILL.md format (compatible with skills.sh)
   - Installable via npm/pnpm alongside middleware and tools
   - High-quality reference implementations

2. **Tool Alias Documentation**
   - Document how to register tools with ecosystem-compatible aliases
   - No changes to existing tools required (uses opt-in alias system)
   - Example: `{ ...readFile, name: 'read_file' }` for skills.sh compatibility

3. **Integration Tests**
   - Test with SISU's own built skills (no external dependencies on skills.sh)
   - Ensures reliable, controlled test environment

4. **Documentation**
   - README, API reference, skill authoring guide
   - Performance benchmarks

**Skill Packages Structure:**

```
packages/skills/
├── skill-code-review/
│   ├── SKILL.md
│   ├── package.json
│   └── checklist.md
├── skill-deploy/
├── skill-test-gen/
├── skill-debug/
└── skill-explain/
```

**Examples:**

- `examples/openai-skills/` - Skills with OpenAI models
- `examples/anthropic-skills/` - Skills with Anthropic models

### Total Timeline: 2 Weeks

---

## Configuration Options

```typescript
interface SkillsOptions {
  /**
   * Skill directories to scan. REQUIRED - no defaults.
   * Can be absolute or relative to cwd.
   * Example: ['.sisu/skills'] or ['.sisu/skills', '.claude/skills']
   */
  directories?: string[];

  /**
   * Single directory shorthand (alternative to directories array).
   * Example: '.sisu/skills'
   */
  directory?: string;

  /** Working directory for resolving relative paths. Default: process.cwd() */
  cwd?: string;

  /** Max file size to load (bytes). Default: 100KB */
  maxFileSize?: number;

  /** Max total skill size (bytes). Default: 500KB */
  maxSkillSize?: number;

  /** Cache TTL (ms). Default: 5 minutes */
  cacheTtl?: number;

  /** Skill names to include (whitelist). Default: all */
  include?: string[];

  /** Skill names to exclude (blacklist). Default: none */
  exclude?: string[];
}
```

**Design Rationale:**

- **Explicit directories:** User must specify where to look (no implicit scanning)
- **Performance:** Only scan configured paths, avoid checking non-existent directories
- **No surprises:** User knows exactly which skill sources are active
- **Ecosystem opt-in:** To use `.claude/skills` or `.cline/skills`, user explicitly adds them

---

## Size Limits & Performance

### File Limits

- **Max file size**: 100KB (typical skill file: 5-20KB)
- **Max skill total**: 500KB (all resources combined)
- **Max cache**: 10MB (across all skills)

**Rationale**:

- Prevents accidentally loading huge files
- Keeps context manageable
- Industry standard (Claude, Windsurf use same limits)

### Performance Targets

- **Skill discovery**: < 100ms for 10 skills
- **Skill activation**: < 10ms (read from cache)
- **Resource loading**: < 50ms (with cache)
- **Memory overhead**: < 10MB for 20 skills with resources

---

## Security Considerations

### Path Validation

```typescript
// Only allow skill-relative paths
function validateResourcePath(skillDir: string, path: string): void {
  if (path.startsWith("/") || path.startsWith("~")) {
    throw new Error("Absolute paths not allowed");
  }

  const resolved = resolve(skillDir, path);
  if (!resolved.startsWith(skillDir)) {
    throw new Error("Path traversal detected");
  }
}
```

### Secret File Exclusion

```typescript
const SECRET_PATTERNS = [/\.env$/, /secrets\./, /credentials\./];

function isSecretFile(filename: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(filename));
}

// Secret files never loaded
```

### User Approval

- All bash commands require user approval (existing SISU behavior)
- Scripts read as text, not executed directly
- Full command visibility before execution

---

## Future Enhancements

### Phase 3: Advanced Features (Post-MVP)

**If demand arises:**

- Embedding-based matching (for 100+ skills)
- Skill dependency resolution
- Skill versioning and updates
- MCP server auto-start
- Skill marketplace/registry

**If enterprise needs:**

- Code signing for skills
- Permission system (network, filesystem)
- Container sandboxing
- Audit logging

---

## Success Criteria

### Functional Requirements

✅ **Skills load from filesystem** with standard SKILL.md format  
✅ **LLM activates skills** via `use_skill` tool call  
✅ **Skills work with all adapters** (OpenAI, Anthropic, Ollama)  
✅ **Compatible with ecosystem** (skills.sh skills work as-is)  
✅ **Scripts execute safely** (template pattern with approval)  
✅ **Resources load lazily** (on-demand, cached)  
✅ **Observable in traces** (all actions logged)

### Quality Metrics

- **Test Coverage**: ≥80% (SISU standard)
- **Ecosystem Compatibility**: ≥90% of top 50 skills work
- **Performance**: < 100ms startup overhead for 10 skills
- **Dependencies**: ZERO new dependencies (only Zod, already in SISU)
- **Code Size**: ~330 lines (comparable to Cline)

### Ecosystem Integration

✅ **Top 10 skills from skills.sh work**:

- vercel-labs/agent-skills/web-design-guidelines
- anthropics/skills/frontend-design
- browser-use/browser-use/browser-use
- remotion-dev/skills/remotion-best-practices
- supabase/agent-skills/supabase-postgres-best-practices

---

## Research References

Detailed research documents available in `docs/research/`:

1. **skills-cross-platform-analysis.md** - Analysis of 15+ platforms
2. **cline-implementation-analysis.md** - Deep dive into Cline's code
3. **skills-middleware-architecture.md** - Architecture evolution
4. **skills-script-execution.md** - Script execution patterns
5. **skills-resource-loading.md** - Resource loading strategies
6. **SUMMARY.md** - Comprehensive summary with contradictions resolved

**Key Finding**: File-based SKILL.md format is de facto standard with 90%+ adoption across platforms.

---

## Conclusion

SISU will adopt **plain file-based skills** using the proven SKILL.md format, implemented as a **single lightweight middleware package** (~330 lines, zero new dependencies). This decision:

- ✅ Provides immediate access to 54,000+ existing skills
- ✅ Aligns with SISU's philosophy (explicit, composable, observable)
- ✅ Minimizes complexity (reuses existing tools)
- ✅ Maintains portability (skills work across platforms)
- ✅ Lowers barrier to entry (markdown files, no coding required)

The template-based script execution pattern ensures safety while maintaining the flexibility and observability that SISU users expect. Skills complement SISU's existing tool system by providing workflow guidance and domain expertise, not by replacing atomic operations.

**Status**: Ready for implementation  
**Timeline**: 2 weeks  
**Risk**: Low (battle-tested pattern, simple implementation)
