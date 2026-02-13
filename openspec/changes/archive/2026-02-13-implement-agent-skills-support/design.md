## Context

SISU currently provides tools (atomic operations like `searchWeb`, `readFile`) and middleware (composable functionality). However, there's no way to package multi-step workflows, domain expertise, and best practices into reusable modules.

The Agent Skills pattern, introduced by Anthropic for Claude, has achieved ecosystem consensus with 54,000+ skills installed across platforms. The SKILL.md format (YAML frontmatter + markdown instructions) is the de facto standard used by Claude Code, Cline, Windsurf, Roo Code, and the skills.sh registry.

**Current State:**

- Tools: 12+ packages for atomic operations
- Middleware: 20+ packages for composable functionality
- No workflow packaging mechanism
- No ecosystem compatibility for skills

**Constraints:**

- Must maintain SISU's philosophy: explicit, composable, observable, type-safe
- Cannot add heavy dependencies (maintain small bundle size)
- Must work with existing middleware without modifications
- Zero breaking changes to existing APIs

**Stakeholders:**

- SISU users wanting access to ecosystem skills
- Skill authors wanting SISU compatibility
- SISU maintainers ensuring architectural consistency

## Goals / Non-Goals

**Goals:**

- Enable SISU to discover and use skills in SKILL.md format
- Provide instant access to 54,000+ existing skills from skills.sh ecosystem
- Implement with ~330 lines of code and zero new dependencies
- Maintain explicit configuration (no implicit directory scanning)
- Support progressive disclosure to minimize context usage
- Create 5+ high-quality reference skill packages
- Demonstrate usage across OpenAI and Anthropic adapters

**Non-Goals:**

- Creating a new skill format (use existing SKILL.md standard)
- Building a skill marketplace (use skills.sh)
- Automatic skill execution without user approval (maintain safety)
- Full YAML spec support (only parse simple frontmatter subset)
- Embedding-based skill matching (LLM-native matching sufficient for 100+ skills)
- Modifying existing tools (use alias system instead)

## Decisions

### Decision 1: Single Middleware Package vs. Multi-Package

**Chosen:** Single `@sisu-ai/mw-skills` package (~330 lines)

**Rationale:**

- Cline's production implementation proves this scale works (57.8K stars)
- Skills are tightly coupled (discovery → parsing → validation → activation)
- Simpler to maintain and document
- Avoids premature abstraction

**Alternatives Considered:**

- Multi-package (mw-skills-core, mw-skills-discovery, mw-skills-loader): Too complex for 330 lines, over-engineering
- Skills as core feature: Breaks SISU's modular philosophy, forces all users to have skills support

### Decision 2: Custom YAML Parser vs. External Dependency

**Chosen:** Custom parser for simple frontmatter subset

**Rationale:**

- Skills only use simple YAML (key: value, arrays)
- Avoids adding `js-yaml` or `gray-matter` dependency
- ~50 lines of code vs. 100KB+ dependency
- Can upgrade to full parser if needed later

**Alternatives Considered:**

- `js-yaml` (73KB): Overkill for simple frontmatter, adds dependency
- `gray-matter` (48KB): Designed for this use case but still adds dependency
- No parsing: Impossible to extract metadata from SKILL.md format

**Trade-off:** Custom parser won't support complex YAML features (anchors, aliases, block styles), but skills don't use these.

### Decision 3: LLM-Native Matching vs. Embedding-Based

**Chosen:** LLM-native semantic matching (list skills in system prompt)

**Rationale:**

- Modern LLMs excel at semantic understanding naturally
- Scales to ~100 skills before context limits become an issue
- Zero cost, zero latency, zero dependencies
- Skill descriptions already optimized for LLM understanding

**Alternatives Considered:**

- Embedding-based pre-filtering: Adds embeddings API dependency, extra latency, only needed at scale (100+ skills)
- Keyword matching: Too brittle, misses semantic similarity

**Migration Path:** If users hit 100+ skills, can add optional embedding-based pre-filtering in a future release.

### Decision 4: Explicit Directory Configuration vs. Auto-Discovery

**Chosen:** Require explicit `directories` or `directory` parameter (no defaults)

**Rationale:**

- Aligns with SISU's "explicit over magic" philosophy
- Avoids scanning non-existent directories (performance)
- No surprise skill loading (user controls sources)
- Clear behavior from reading code

**Alternatives Considered:**

- Auto-scan `.sisu/skills`, `.claude/skills`, `.cline/skills`: Implicit behavior, performance hit, violates SISU principles
- Single hardcoded default: Limits ecosystem compatibility

**Usage Pattern:**

```typescript
// SISU skills only
skills({ directory: ".sisu/skills" });

// Opt into ecosystem
skills({ directories: [".sisu/skills", ".claude/skills"] });
```

### Decision 5: Progressive Disclosure Strategy

**Chosen:** Three-level loading (metadata → instructions → resources)

**Rationale:**

- Level 1 (metadata): Always in context, minimal tokens (~10 per skill)
- Level 2 (instructions): Loaded on activation, full guidance (~1-2KB per skill)
- Level 3 (resources): Loaded on demand, heavy content (varies)
- Scales to many skills without context explosion

**Alternatives Considered:**

- Load everything upfront: Exhausts context window quickly
- Load on first use: Still loads unnecessary content
- Two-level (metadata + everything else): Less granular control

### Decision 6: Tool Aliases for Ecosystem Compatibility

**Chosen:** Document alias usage, no changes to existing tools

**Rationale:**

- SISU already has opt-in alias system for tools
- Skills.sh ecosystem uses snake_case names (`read_file`, `web_search`)
- Users explicitly choose to register tools with ecosystem aliases
- Zero breaking changes

**Alternatives Considered:**

- Modify existing tools to support both names: Breaking change, complicates tool code
- Create wrapper tools: Duplicate code, maintenance burden
- Ignore compatibility: Skills requiring ecosystem tool names won't work

**Usage Pattern:**

```typescript
toolCalling({
  tools: [
    { ...readFile, name: "read_file" }, // Ecosystem alias
    { ...webSearch, name: "web_search" },
  ],
});
```

### Decision 7: Skills Packages as npm Installables

**Chosen:** Create `packages/skills/skill-*/` as installable npm packages

**Rationale:**

- Consistent with SISU's package structure (middleware, tools, skills)
- Installable via `pnpm add @sisu-ai/skill-code-review`
- High-quality reference implementations
- Discoverable on npm registry
- Makes SISU a first-class skills provider

**Alternatives Considered:**

- Skills in examples only: Harder to discover, not installable
- Separate repo: Fragmentation, harder to maintain
- Single mega-package: All-or-nothing, bloats installs

## Risks / Trade-offs

### Risk: Custom YAML Parser Limitations

**Risk:** Custom parser won't handle complex YAML features (anchors, aliases, block scalars)

**Mitigation:**

- Skills.sh ecosystem only uses simple YAML (validated via research)
- Can upgrade to `js-yaml` if needed (low probability)
- Parser validated against 50+ real skills from ecosystem

### Risk: Context Window Limits (100+ Skills)

**Risk:** Listing 100+ skill names/descriptions might exhaust context window

**Mitigation:**

- Progressive disclosure keeps level 1 minimal (~10 tokens per skill)
- Most users have <20 skills (based on Cline usage patterns)
- Can add embedding-based pre-filtering in future release
- `include`/`exclude` filters allow manual control

### Risk: Skill Quality Varies in Ecosystem

**Risk:** Skills from skills.sh may have poor quality or malicious content

**Mitigation:**

- User explicitly configures which directories to scan (opt-in)
- Validation catches malformed SKILL.md files (skips with warning)
- No automatic execution (LLM reads skills as templates, user approves actions)
- SISU skills packages provide high-quality references

### Risk: Filesystem Dependency

**Risk:** Skills tied to filesystem, less portable than code-based approaches

**Trade-off Accepted:**

- Ecosystem value (54,000+ skills) outweighs portability concerns
- SKILL.md format is universal (markdown + simple YAML)
- Middleware remains explicit and observable (directories configured in code)
- Aligns with how skills.sh ecosystem works (industry standard)

### Risk: Performance (Directory Scanning)

**Risk:** Scanning directories on every agent initialization

**Mitigation:**

- Discovery happens once per middleware initialization (cached in context)
- Only scans explicitly configured directories (no wasteful checks)
- Skill metadata cached (5min TTL, configurable)
- Typical scan time: <100ms for 10 skills

## Migration Plan

**Phase 1: Core Package (Week 1)**

1. Create `packages/middleware/skills/` structure
2. Implement custom YAML parser
3. Implement filesystem discovery
4. Implement `use_skill` tool handler
5. Write unit tests (≥80% coverage)
6. Validate with real skills from skills.sh

**Phase 2: Skills Packages & Examples (Week 2)**

1. Create 5 skill packages in `packages/skills/`
2. Create `examples/openai-skills/` example
3. Create `examples/anthropic-skills/` example
4. Write documentation (README, API reference, authoring guide)
5. Integration tests using SISU skill packages

**Rollback Strategy:**

- Purely additive feature, no changes to existing code
- Can be removed by uninstalling `@sisu-ai/mw-skills` package
- No database migrations or persistent state
- No breaking changes to roll back

**Deployment:**

- Standard npm publish via changesets workflow
- Version: Start at 0.1.0 (experimental, gather feedback)
- Announce in docs with clear examples
- Blog post demonstrating ecosystem skills usage

## Open Questions

**Q1: Should skills packages be versioned independently?**

- Currently planned as separate npm packages with independent versions
- Allows users to install only needed skills
- Decision: Yes, follow same pattern as tools packages

**Q2: Should we provide a CLI for skill management?**

- Skills.sh provides `npx skills add owner/repo`
- Could provide `npx sisu-skills init` for project setup
- Decision: Defer to post-launch based on user feedback

**Q3: How to handle skill updates from ecosystem?**

- Skills.sh skills are git repos (users `git pull`)
- SISU skills are npm packages (users `pnpm update`)
- Decision: Document both patterns, no automatic updates

**Q4: Should we cache parsed skills across agent instances?**

- Current design: cache per agent instance
- Could add global cache (singleton pattern)
- Decision: Start with per-instance, optimize if needed based on telemetry
