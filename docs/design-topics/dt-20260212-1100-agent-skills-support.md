# DT 20260212-1100: Agent Skills Support

**Date:** 2026-02-12  
**Status:** Proposal  
**Priority:** High  
**Related:** Anthropic Claude Skills Architecture

## Context

Agent Skills are a powerful pattern introduced by Anthropic for Claude that packages domain-specific instructions, code, and resources into reusable, filesystem-based modules. Skills use progressive disclosure—loading metadata at startup, instructions when triggered, and resources as needed—to provide specialized capabilities without consuming context upfront.

SISU Framework, built on explicit middleware composition and typed tools, could benefit from a Skills-like system that aligns with its philosophy: **small, explicit, composable**. While SISU already has excellent tool support, Skills offer a complementary capability focused on procedural knowledge and workflow guidance rather than atomic functions.

## Problem Statement

How can SISU Framework adopt the Skills pattern in a way that:

1. **Aligns with SISU's philosophy**: Explicit, composable, zero magic
2. **Respects SISU's architecture**: Middleware-based pipeline with typed context
3. **Provides value over existing tools**: Clear differentiation from the tool system
4. **Remains provider-agnostic**: Works across OpenAI, Anthropic, Ollama adapters
5. **Maintains backward compatibility**: No breaking changes to existing APIs

## Current State Analysis

### SISU's Existing Tool System

SISU has a mature tool system with:

- **Typed tool definitions** with Zod schemas (`Tool<TArgs>`)
- **Tool registry** accessible via `ctx.tools`
- **Tool-calling middleware** for automatic function execution loops
- **12+ pre-built tools** (web search, S3, GitHub, terminal, etc.)
- **Sandboxed tool context** (`ToolCtx`) preventing tools from accessing messages/state

**Strengths**: Type-safe, composable, explicit registration, clear boundaries.

**Tools are best for**: Atomic operations, I/O-bound tasks, deterministic functions.

### What Skills Would Add

Skills address a different need than tools:

| Aspect         | Tools (Current)               | Skills (Proposed)                                 |
| -------------- | ----------------------------- | ------------------------------------------------- |
| **Purpose**    | Execute specific functions    | Provide workflow guidance and domain expertise    |
| **Content**    | Handler + schema              | Instructions + code + resources                   |
| **Loading**    | All registered at startup     | Progressive (metadata → instructions → resources) |
| **Invocation** | LLM function calls            | Triggered by semantic match in system prompt      |
| **Scope**      | Single operation              | Multi-step workflows                              |
| **Examples**   | `getWeather()`, `searchWeb()` | "PDF Processing", "Sales Analysis", "Code Review" |

**Skills are best for**: Complex workflows, domain expertise, best practices, procedural knowledge.

## Design Principles for SISU Skills

Based on SISU's architecture and guidelines:

1. **Explicit over implicit**: Skills must be explicitly registered, just like tools
2. **Middleware-based**: Skills integrate as middleware in the pipeline
3. **Type-safe**: Skill definitions should be typed contracts
4. **Composable**: Skills can be mixed with tools and other middleware
5. **Observable**: Skill loading and usage should appear in traces
6. **Provider-agnostic**: Core concept works across all adapters
7. **No filesystem magic**: Unlike Claude's implementation, avoid hidden filesystem assumptions

## Proposed Solution

### Option A: Skills as Enhanced System Prompts (Recommended)

Treat Skills as **structured system prompt extensions** that load progressively based on context relevance.

#### Core Implementation

```typescript
// packages/core/src/types.ts
export interface Skill {
  name: string;
  description: string; // Used for semantic matching
  instructions: string; // Core workflow guidance (markdown)
  resources?: Record<string, string | (() => Promise<string>)>; // Lazy-loaded content
  tools?: Tool[]; // Optional: Skills can bundle tools
  schema?: z.ZodObject<any>; // Optional: Structured skill parameters
}

export interface SkillCtx {
  loadResource(name: string): Promise<string>;
  log: Logger;
  memory: Memory;
  signal?: AbortSignal;
}

// Add to main Ctx
export interface Ctx {
  // ... existing fields ...
  skills: {
    register(skill: Skill): void;
    get(name: string): Skill | undefined;
    list(): Skill[];
    trigger(name: string, ctx: SkillCtx): Promise<void>;
  };
}
```

#### Middleware Implementation

```typescript
// packages/middleware/register-skills/src/index.ts
import type { Middleware, Skill } from "@sisu-ai/core";

export const registerSkills =
  (skills: Skill[]): Middleware =>
  async (ctx, next) => {
    // Level 1: Register metadata (lightweight)
    for (const skill of skills) {
      ctx.log.debug(`Registering skill: ${skill.name}`, {
        skill: skill.name,
        description: skill.description,
      });
      ctx.skills.register(skill);
    }

    // Add skill metadata to system prompt
    const skillPrompts = skills
      .map((s) => `[SKILL: ${s.name}] ${s.description}`)
      .join("\n");

    if (ctx.systemPrompt) {
      ctx.systemPrompt += "\n\n## Available Skills\n" + skillPrompts;
    }

    await next();
  };

// packages/middleware/skill-activation/src/index.ts
export const skillActivation = (): Middleware => async (ctx, next) => {
  // Before LLM call: Check if any skill should be loaded
  const userIntent = ctx.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  for (const skill of ctx.skills.list()) {
    if (semanticMatch(userIntent, skill.description)) {
      ctx.log.info(`Activating skill: ${skill.name}`);

      // Level 2: Load instructions into system prompt
      const skillInstructions = `\n\n## ${skill.name}\n${skill.instructions}`;
      ctx.systemPrompt += skillInstructions;

      // Register bundled tools if present
      if (skill.tools) {
        skill.tools.forEach((t) => ctx.tools.register(t));
      }

      // Level 3: Resources loaded on-demand via skill context
      // (available but not yet in context)
    }
  }

  await next();
};

function semanticMatch(text: string, description: string): boolean {
  // Simple keyword matching initially
  // Could be enhanced with embedding similarity later
  const keywords = description.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  return keywords.some((kw) => textLower.includes(kw));
}
```

#### Example Usage

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { registerSkills, skillActivation } from "@sisu-ai/mw-skills";
import { openAIAdapter } from "@sisu-ai/adapter-openai";

// Define a skill
const pdfSkill: Skill = {
  name: "pdf-processing",
  description:
    "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files.",
  instructions: `
# PDF Processing

## Quick Start
Use pdfplumber to extract text from PDFs:

\`\`\`python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
\`\`\`

## Best Practices
- Always check page count before processing
- Handle encoding errors gracefully
- For large PDFs, process in chunks
  `,
  resources: {
    "forms-guide": async () => {
      // Lazy-loaded detailed guide
      return await fetch("/skills/pdf/forms.md").then((r) => r.text());
    },
    "api-reference": "/skills/pdf/api-reference.md",
  },
  tools: [
    // Optional: Bundle related tools
    {
      name: "extractPdfText",
      description: "Extract text from PDF file",
      schema: z.object({ filePath: z.string() }),
      handler: async ({ filePath }) => {
        // Implementation
      },
    },
  ],
};

// Build agent with skills
const agent = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerSkills([pdfSkill])) // Level 1: Register metadata
  .use(skillActivation()) // Level 2: Activate on match
  .use(
    registerTools([
      /* other tools */
    ]),
  )
  .use(inputToMessage)
  .use(conversationBuffer({ window: 8 }))
  .use(toolCalling);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Extract the summary from this PDF report",
  systemPrompt: "You are a helpful assistant.",
});

await agent.handler()(ctx);
// Skill automatically activated based on "PDF" keyword
```

#### Advantages of Option A

✅ **Aligns with SISU philosophy**: Explicit registration, middleware composition  
✅ **Works with all providers**: System prompt modification is universal  
✅ **Type-safe**: Full TypeScript typing with Zod validation  
✅ **Observable**: Skill loading appears in traces/logs  
✅ **Progressive disclosure**: Metadata → instructions → resources  
✅ **Composable**: Works alongside tools and other middleware  
✅ **No filesystem assumptions**: Resources are functions/strings  
✅ **Backward compatible**: Zero breaking changes

#### Disadvantages of Option A

❌ **Context consumption**: Instructions loaded into prompt consume tokens  
❌ **Semantic matching**: Simple keyword matching may have false positives/negatives  
❌ **No native code execution**: Unlike Claude, can't execute bundled scripts directly

---

### Option B: Skills as Tool Factories

Treat Skills as **generators that create tools on-demand** based on context.

```typescript
export interface Skill {
  name: string;
  description: string;
  generateTools(ctx: SkillCtx): Promise<Tool[]>;
}

export const skillActivation = (): Middleware => async (ctx, next) => {
  for (const skill of ctx.skills.list()) {
    if (semanticMatch(ctx.input, skill.description)) {
      const tools = await skill.generateTools({
        log: ctx.log,
        memory: ctx.memory,
        signal: ctx.signal,
      });
      tools.forEach((t) => ctx.tools.register(t));
    }
  }
  await next();
};
```

#### Advantages of Option B

✅ **No prompt overhead**: Tools only use context when called  
✅ **Dynamic tool generation**: Tools can be parameterized by context  
✅ **Leverages existing tool system**: Minimal new concepts

#### Disadvantages of Option B

❌ **No guidance layer**: Can't provide workflow instructions without tools  
❌ **Less like Skills**: Loses the "knowledge bundle" aspect  
❌ **All-or-nothing**: Either generate all tools or none

---

### Option C: Skills as Specialized Middleware

Each Skill is its own middleware with custom logic.

```typescript
export const createSkillMiddleware = (skill: Skill): Middleware => {
  return async (ctx, next) => {
    if (semanticMatch(ctx.input, skill.description)) {
      // Custom skill logic
      skill.onActivate?.(ctx);
    }
    await next();
  };
};

const agent = new Agent()
  .use(createSkillMiddleware(pdfSkill))
  .use(createSkillMiddleware(salesSkill))
  .use(toolCalling);
```

#### Advantages of Option C

✅ **Maximum flexibility**: Each skill has full middleware power  
✅ **Explicit composition**: Skills are visible in pipeline

#### Disadvantages of Option C

❌ **Too low-level**: Requires middleware expertise for skill authors  
❌ **No standardization**: Every skill implements differently  
❌ **Harder to trace**: No unified skill system to observe

---

### Option D: Filesystem-Based Skills (Claude-Compatible) ⭐

Load skills directly from the filesystem using Anthropic's SKILL.md format, enabling compatibility with the massive skills ecosystem (skills.sh, GitHub repos, etc.).

#### Core Implementation

```typescript
// packages/middleware/load-skills/src/index.ts
import type { Middleware, Skill } from "@sisu-ai/core";
import { readFile, readdir } from "fs/promises";
import { join, resolve } from "path";
import matter from "gray-matter"; // Parse YAML frontmatter

export interface LoadSkillsOptions {
  /** Path(s) to scan for skills. Default: './skills' */
  paths?: string | string[];
  /** Skill names to explicitly include (whitelist) */
  include?: string[];
  /** Skill names to explicitly exclude (blacklist) */
  exclude?: string[];
  /** Recursively scan subdirectories. Default: true */
  recursive?: boolean;
  /** Auto-activate skills on semantic match. Default: true */
  autoActivate?: boolean;
  /** Custom activation matcher */
  matcher?: (text: string, description: string) => boolean;
}

export const loadSkills = (opts: LoadSkillsOptions = {}): Middleware => {
  const {
    paths = "./skills",
    include,
    exclude = [],
    recursive = true,
    autoActivate = true,
    matcher = defaultMatcher,
  } = opts;

  return async (ctx, next) => {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    const loadedSkills: Skill[] = [];

    // Scan filesystem for SKILL.md files
    for (const basePath of pathArray) {
      const resolvedPath = resolve(basePath);
      const skills = await scanForSkills(resolvedPath, recursive);

      for (const skillPath of skills) {
        const skill = await parseSkillFile(skillPath);

        // Apply include/exclude filters
        if (include && !include.includes(skill.name)) continue;
        if (exclude.includes(skill.name)) continue;

        // Register in context
        ctx.skills.register(skill);
        loadedSkills.push(skill);
        ctx.log.debug(`Loaded skill from filesystem: ${skill.name}`, {
          path: skillPath,
          skill: skill.name,
        });
      }
    }

    // Level 1: Add metadata to system prompt
    const skillList = loadedSkills
      .map((s) => `[SKILL: ${s.name}] ${s.description}`)
      .join("\n");

    if (skillList) {
      ctx.systemPrompt =
        (ctx.systemPrompt || "") + "\n\n## Available Skills\n" + skillList;
    }

    ctx.log.info(`Loaded ${loadedSkills.length} skills from filesystem`);

    // Level 2: Auto-activate if enabled
    if (autoActivate) {
      const userMessages = ctx.messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" ");

      for (const skill of loadedSkills) {
        if (matcher(userMessages, skill.description)) {
          await activateSkill(ctx, skill);
        }
      }
    }

    await next();
  };
};

/** Scan directory for SKILL.md files */
async function scanForSkills(
  basePath: string,
  recursive: boolean,
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(basePath, entry.name);

      if (entry.isDirectory() && recursive) {
        // Recurse into subdirectories
        const subResults = await scanForSkills(fullPath, recursive);
        results.push(...subResults);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        // Found a skill file
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist or not readable - skip silently
  }

  return results;
}

/** Parse SKILL.md file into Skill object */
async function parseSkillFile(filePath: string): Promise<Skill> {
  const content = await readFile(filePath, "utf-8");
  const { data: frontmatter, content: instructions } = matter(content);

  // Validate required fields
  if (!frontmatter.name || typeof frontmatter.name !== "string") {
    throw new Error(
      `Invalid skill at ${filePath}: missing or invalid 'name' field`,
    );
  }
  if (!frontmatter.description || typeof frontmatter.description !== "string") {
    throw new Error(
      `Invalid skill at ${filePath}: missing or invalid 'description' field`,
    );
  }

  const skillDir = join(filePath, "..");

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    instructions: instructions.trim(),
    // Resources are loaded lazily from the skill directory
    resources: createResourceLoader(skillDir),
    // Skills can reference other files in their directory
    _metadata: {
      path: filePath,
      directory: skillDir,
    },
  };
}

/** Create lazy resource loader for skill directory */
function createResourceLoader(
  skillDir: string,
): Record<string, () => Promise<string>> {
  return new Proxy(
    {},
    {
      get: (target, prop: string) => {
        return async () => {
          const filePath = join(skillDir, prop);
          try {
            return await readFile(filePath, "utf-8");
          } catch (err) {
            throw new Error(`Resource not found: ${prop} in ${skillDir}`);
          }
        };
      },
    },
  );
}

/** Activate a skill by loading its instructions */
async function activateSkill(ctx: Ctx, skill: Skill): Promise<void> {
  ctx.log.info(`Activating skill: ${skill.name}`);

  // Load instructions into system prompt
  const instructions = `\n\n## ${skill.name}\n${skill.instructions}`;
  ctx.systemPrompt = (ctx.systemPrompt || "") + instructions;

  // Mark as activated in state
  ctx.state.activatedSkills = ctx.state.activatedSkills || [];
  ctx.state.activatedSkills.push(skill.name);
}

function defaultMatcher(text: string, description: string): boolean {
  const keywords = description.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  return keywords.some((kw) => textLower.includes(kw));
}
```

#### Example Usage

```typescript
import { Agent, createCtx } from "@sisu-ai/core";
import { loadSkills } from "@sisu-ai/mw-load-skills";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { toolCalling } from "@sisu-ai/mw-tool-calling";

const agent = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  // Load all skills from ./skills directory
  .use(loadSkills())
  .use(toolCalling);

// Or with options
const agentWithOptions = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(
    loadSkills({
      paths: ["./skills", "./team-skills"],
      exclude: ["pdf-reader"], // Skip specific skills
      include: ["browser-use", "web-design-guidelines"], // Only these
      autoActivate: true, // Auto-activate on match
    }),
  )
  .use(toolCalling);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Help me design a modern landing page",
  systemPrompt: "You are a helpful assistant.",
});

await agent.handler()(ctx);
```

#### Installing Skills from Ecosystem

```bash
# Install a skill from skills.sh
npx skills add vercel-labs/agent-skills/web-design-guidelines

# This creates: ./skills/web-design-guidelines/SKILL.md

# Or manually download from GitHub
git clone https://github.com/anthropics/skills.git temp-skills
cp -r temp-skills/pdf ./skills/
rm -rf temp-skills

# SISU will auto-discover on next run
```

#### Filesystem Structure

```
project/
├── skills/                           # Default scan path
│   ├── web-design-guidelines/        # Skill from skills.sh
│   │   ├── SKILL.md                  # Required: frontmatter + instructions
│   │   ├── examples.md               # Optional: reference material
│   │   └── templates/                # Optional: templates/assets
│   │       └── hero-template.html
│   ├── pdf-processing/               # Custom skill
│   │   ├── SKILL.md
│   │   └── api-reference.md
│   └── browser-use/                  # Skill from ecosystem
│       └── SKILL.md
├── team-skills/                      # Additional skill path
│   └── company-standards/
│       └── SKILL.md
└── src/
    └── index.ts
```

#### Example SKILL.md Format (Compatible)

```markdown
---
name: web-design-guidelines
description: Modern web design principles and best practices for creating beautiful, accessible UIs
---

# Web Design Guidelines

## Overview

This skill provides comprehensive guidance on modern web design...

## Layout Principles

1. Use whitespace effectively
2. Establish visual hierarchy
3. Maintain consistency

## Responsive Design

- Mobile-first approach
- Breakpoints: 640px, 768px, 1024px, 1280px

## Accessibility

- WCAG 2.1 AA compliance
- Color contrast ratios
- Keyboard navigation

## References

For detailed examples, see [examples.md](examples.md)
```

#### Advantages of Option D

✅ **Ecosystem compatibility**: Works with 54,000+ existing skills from skills.sh  
✅ **Zero conversion required**: Use skills as-is from repos  
✅ **Familiar format**: Developers already know SKILL.md pattern  
✅ **Easy skill sharing**: Copy folder, push to repo, done  
✅ **Standard tooling**: `npx skills add` works out of the box  
✅ **Explicit control**: Include/exclude lists, custom paths  
✅ **Still observable**: Skill loading appears in logs/traces  
✅ **Type-safe internally**: Parsed into typed Skill objects  
✅ **Progressive disclosure**: Same 3-level loading as Claude  
✅ **Composable**: Works with all other SISU middleware  
✅ **No lock-in**: Skills are portable across platforms

#### Disadvantages of Option D

⚠️ **Filesystem dependency**: Requires file I/O (but Node.js native)  
⚠️ **Less explicit than code**: Skills hidden in files vs. code  
⚠️ **Runtime file loading**: Small startup cost to scan directories  
⚠️ **Need validation**: Must validate SKILL.md format at runtime

#### Mitigations for Disadvantages

**Filesystem dependency:**

- Use Node's native `fs/promises` (zero dependencies)
- Provide fallback for environments without filesystem (browser)
- Cache parsed skills in production

**Less explicit:**

- Log all loaded skills at startup with paths
- Provide CLI command: `sisu skills list` to show loaded skills
- Trace viewer shows which skills are loaded and activated

**Runtime loading:**

- Cache skill registry after first load
- Option to precompile skills to JSON
- Lazy-load instructions only when activated

**Validation:**

- Strict schema validation with clear error messages
- Warn on invalid skills but don't crash
- Provide `sisu skills validate ./skills` command

---

## Comprehensive Options Comparison

### Summary Matrix

| Criterion            | Option A (In-Memory) | Option B (Tool Factories) | Option C (Per-Skill MW) | Option D (Filesystem) ⭐      |
| -------------------- | -------------------- | ------------------------- | ----------------------- | ----------------------------- |
| **Ecosystem Access** | ❌ No                | ❌ No                     | ❌ No                   | ✅ **54K+ skills**            |
| **Zero Conversion**  | ❌ Must rewrite      | ❌ Must rewrite           | ❌ Must rewrite         | ✅ **Use as-is**              |
| **Standard Format**  | ❌ TypeScript only   | ❌ TypeScript only        | ❌ TypeScript only      | ✅ **SKILL.md**               |
| **Explicit Control** | ✅ Code              | ⚠️ Dynamic                | ✅ Code                 | ✅ **Config + Files**         |
| **Type Safety**      | ✅ Compile-time      | ✅ Compile-time           | ✅ Compile-time         | ✅ Runtime validated          |
| **Observable**       | ✅ Yes               | ✅ Yes                    | ⚠️ Per-skill            | ✅ Yes                        |
| **Progressive Load** | ✅ Yes               | ❌ No                     | ⚠️ Custom               | ✅ **Yes (Claude-like)**      |
| **Skill Sharing**    | ⚠️ npm package       | ⚠️ npm package            | ⚠️ npm package          | ✅ **Copy folder**            |
| **Learning Curve**   | Medium               | Low                       | High                    | ✅ **Low (familiar)**         |
| **Portable Skills**  | ❌ SISU-specific     | ❌ SISU-specific          | ❌ SISU-specific        | ✅ **Cross-platform**         |
| **Setup Effort**     | High                 | Medium                    | High                    | ✅ **Low (`npx skills add`)** |
| **Production Ready** | ⚠️ Custom build      | ⚠️ Custom build           | ⚠️ Custom build         | ✅ **Proven pattern**         |

### Detailed Analysis

#### Option A: In-Memory Skills (Pure TypeScript)

**Best for:** SISU-native skills, maximum type safety, programmatic control

**Strengths:**

- Full compile-time type checking
- No runtime file I/O
- Perfect for code-first workflows

**Weaknesses:**

- ❌ **Cannot use existing ecosystem skills** - must rewrite all 54K+ skills
- ❌ **High barrier to skill creation** - requires TypeScript knowledge
- ❌ **Poor skill portability** - locked to SISU
- ❌ **Sharing friction** - need npm publish, semver, etc.

**Verdict:** Philosophically pure, but **impractical** given the massive existing ecosystem.

---

#### Option B: Skills as Tool Factories

**Best for:** Dynamic tool generation, minimal abstractions

**Strengths:**

- Leverages existing tool system
- No context overhead until tools called
- Simple mental model

**Weaknesses:**

- ❌ **No procedural knowledge** - loses the "guidance" aspect of skills
- ❌ **Cannot use ecosystem skills** - different paradigm entirely
- ❌ **Misses the point** - this is just "tools that register tools"

**Verdict:** Solves a different problem. Not really "skills" anymore.

---

#### Option C: Skills as Middleware

**Best for:** Maximum flexibility, power users

**Strengths:**

- Full middleware power per skill
- Ultimate control

**Weaknesses:**

- ❌ **Requires middleware expertise** - high skill floor
- ❌ **No standardization** - every skill is different
- ❌ **Cannot use ecosystem skills** - must write custom middleware
- ❌ **Poor observability** - no unified skill system

**Verdict:** Too low-level. Forces skill authors to be SISU experts.

---

#### Option D: Filesystem-Based Skills ⭐ **RECOMMENDED**

**Best for:** Leveraging existing ecosystem, rapid adoption, portability

**Strengths:**

- ✅ **Instant access to 54,000+ existing skills** from skills.sh, GitHub, etc.
- ✅ **Zero conversion effort** - use skills as published
- ✅ **Standard format** - SKILL.md is the de facto standard
- ✅ **Familiar to developers** - already used in Claude Code, Cline, Cursor, etc.
- ✅ **Easy sharing** - copy folder, push to repo, done
- ✅ **Standard tooling** - `npx skills add owner/repo` works
- ✅ **Portable** - skills work across multiple platforms
- ✅ **Progressive disclosure** - same 3-level loading as Claude
- ✅ **Low barrier to entry** - markdown files, no coding required
- ✅ **Still explicit** - configure paths, includes, excludes
- ✅ **Still observable** - logs and traces show loaded skills
- ✅ **Still composable** - middleware plays nice with others

**Weaknesses (and mitigations):**

- ⚠️ **Filesystem I/O** → Use Node native fs, cache parsed skills
- ⚠️ **Less explicit** → Log loaded skills, provide CLI tools
- ⚠️ **Runtime validation** → Clear errors, validation tooling

**Verdict:** This is the pragmatic choice. The ecosystem value far outweighs philosophical purity concerns.

---

## Recommended Approach: **Option D** (Filesystem-Based Skills) ⭐

**Primary Rationale: Ecosystem Network Effects**

The decision comes down to a fundamental question:

> _Should SISU create a new, incompatible skill ecosystem, or tap into the existing 54,000+ skill install ecosystem?_

**Option D wins because:**

### 1. **Massive Ecosystem Value** (Most Important)

- **54,143 skill installs** across hundreds of skills
- Skills for: React, Next.js, Vercel, Design, SEO, Testing, Marketing, etc.
- Active community contributing new skills daily
- Standard maintained by Anthropic (stability)
- Works in: Claude Code, Cline, Cursor, Windsurf, Kilo, etc.

**Impact:** Users get instant value. No "cold start" problem. Skills work day one.

### 2. **Proven Pattern**

- Already battle-tested in production
- Format is stable and documented
- Tooling ecosystem exists (`npx skills add`)
- Best practices established

**Impact:** Lower risk. We're adopting a working standard, not inventing one.

### 3. **Developer Familiarity**

- Developers already know SKILL.md format from other tools
- Markdown is universal - no TypeScript required
- Lower barrier to skill creation

**Impact:** More skills get created. Wider adoption. Network effects compound.

### 4. **Portability = Value**

- Skills written for SISU work in Claude Code
- Skills from Claude ecosystem work in SISU
- No vendor lock-in

**Impact:** Skills become more valuable because they're reusable. Users invest in skill creation.

### 5. **Still Aligns with SISU Principles**

- **Explicit**: Configure paths, includes, excludes in code
- **Composable**: It's middleware like everything else
- **Observable**: Logs show loaded skills, traces show activation
- **Type-safe**: Internally parsed into typed objects
- **Testable**: Mock filesystem, validate skills

**The filesystem is just an I/O detail** - we still have explicit registration, middleware composition, and observability.

### 6. **Hybrid Approach Possible**

We can support **both** filesystem and in-memory:

```typescript
// Option D: Load from filesystem
.use(loadSkills({ paths: './skills' }))

// Option A: Register in-memory (for SISU-specific skills)
.use(registerSkills([customTypedSkill]))
```

**Impact:** Best of both worlds. Ecosystem access + type safety when needed.

---

## Final Recommendation: Start with Option D, Add Option A Later

**Phase 1: Filesystem Skills (MVP)**

- Implement `loadSkills()` middleware (Option D)
- Full Claude SKILL.md compatibility
- Include/exclude filtering
- Auto-activation

**Phase 2: Hybrid Support**

- Add `registerSkills()` for in-memory skills (Option A)
- Both work together seamlessly
- Users choose based on use case

**Why this order?**

1. **Faster time-to-value**: Users get 54K skills immediately
2. **Validate demand**: See which approach users prefer
3. **Learn from usage**: Inform Option A design with real feedback
4. **Incremental complexity**: Add type-safe API only if needed

---

## Trade-Offs Accepted

1. **Filesystem dependency**: Worth it for ecosystem access. Node.js native, minimal overhead.
2. **Runtime validation**: Worth it for portability. Add good error messages and tooling.
3. **Less explicit registration**: Mitigated by explicit config and logging. Still more explicit than hidden magic.

The value of **54,000+ existing skills** far outweighs these concerns.

## Implementation Plan (Option D: Filesystem-Based)

### Phase 1: Core Types and Registry (Week 1)

**Packages:**

- `packages/core/src/types.ts` - Add `Skill` interface
- `packages/core/src/context.ts` - Add skills registry to context

**Files to modify:**

```typescript
// packages/core/src/types.ts
export interface Skill {
  name: string;
  description: string;
  instructions: string;
  resources?: Record<string, () => Promise<string>>;
  tools?: Tool[];
  _metadata?: {
    path?: string;
    directory?: string;
  };
}

export interface Ctx {
  // ... existing fields ...
  skills: {
    register(skill: Skill): void;
    get(name: string): Skill | undefined;
    list(): Skill[];
  };
}

// packages/core/src/context.ts
export function createCtx(config: CtxConfig): Ctx {
  const skillsRegistry = new Map<string, Skill>();

  return {
    // ... existing fields ...
    skills: {
      register: (skill: Skill) => skillsRegistry.set(skill.name, skill),
      get: (name: string) => skillsRegistry.get(name),
      list: () => Array.from(skillsRegistry.values()),
    },
  };
}
```

**Tests:**

- Unit tests for skill registration
- Tests for skill retrieval and listing
- Tests for duplicate skill names

**Deliverables:**

- ✅ Core types defined
- ✅ Skills registry in context
- ✅ 100% test coverage

---

### Phase 2: Filesystem Loader Middleware (Week 1-2)

**Packages:**

- `packages/middleware/load-skills/` - New package

**Dependencies:**

```json
{
  "dependencies": {
    "@sisu-ai/core": "workspace:*",
    "gray-matter": "^4.0.3"
  }
}
```

**Implementation:**

```typescript
// packages/middleware/load-skills/src/index.ts
import type { Middleware, Skill } from "@sisu-ai/core";
import { readFile, readdir } from "fs/promises";
import { join, resolve } from "path";
import matter from "gray-matter";

export interface LoadSkillsOptions {
  paths?: string | string[];
  include?: string[];
  exclude?: string[];
  recursive?: boolean;
  autoActivate?: boolean;
  matcher?: (text: string, description: string) => boolean;
}

export const loadSkills = (opts: LoadSkillsOptions = {}): Middleware => {
  // Implementation as shown in Option D above
};

async function scanForSkills(
  basePath: string,
  recursive: boolean,
): Promise<string[]> {
  // Scan for SKILL.md files
}

async function parseSkillFile(filePath: string): Promise<Skill> {
  // Parse SKILL.md with gray-matter
}

function createResourceLoader(skillDir: string) {
  // Lazy-load resource files
}

async function activateSkill(ctx: Ctx, skill: Skill): Promise<void> {
  // Load instructions into system prompt
}
```

**Tests:**

- Test skill directory scanning (recursive and non-recursive)
- Test SKILL.md parsing (valid frontmatter, invalid frontmatter)
- Test include/exclude filtering
- Test auto-activation
- Test error handling (missing files, invalid YAML)
- Test resource lazy-loading
- Mock filesystem with `memfs` for deterministic tests

**Deliverables:**

- ✅ Full filesystem loader
- ✅ SKILL.md parsing with validation
- ✅ Include/exclude filtering
- ✅ 100% test coverage with mocked filesystem

---

### Phase 3: CLI Tooling (Week 2)

**Packages:**

- `packages/cli-skills/` - New package (optional but recommended)

**Features:**

```bash
# List loaded skills
sisu skills list

# Validate skill directory
sisu skills validate ./skills

# Show skill details
sisu skills show web-design-guidelines

# Test skill activation
sisu skills test ./skills/my-skill --input "design a landing page"
```

**Implementation:**

```typescript
// packages/cli-skills/src/index.ts
import { Command } from "commander";
import { loadSkills } from "@sisu-ai/mw-load-skills";

const program = new Command();

program
  .command("list")
  .description("List all discovered skills")
  .option("-p, --paths <paths...>", "Skill directories")
  .action(async (opts) => {
    // Scan and list skills
  });

program
  .command("validate <path>")
  .description("Validate SKILL.md files")
  .action(async (path) => {
    // Validate all SKILL.md in path
  });

program.parse();
```

**Tests:**

- Test CLI commands with mocked filesystem
- Test error reporting
- Test output formatting

**Deliverables:**

- ✅ CLI tool for skill management
- ✅ Validation command
- ✅ List/show commands

---

### Phase 4: Integration Examples (Week 3)

**Create comprehensive examples:**

#### Example 1: Basic Filesystem Skills

```typescript
// examples/openai-skills-filesystem/src/index.ts
import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { loadSkills } from "@sisu-ai/mw-load-skills";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";
import { toolCalling } from "@sisu-ai/mw-tool-calling";

const agent = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  // Load all skills from ./skills
  .use(
    loadSkills({
      paths: "./skills",
      autoActivate: true,
    }),
  )
  .use(toolCalling);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Help me design a modern landing page",
  systemPrompt: "You are a helpful assistant.",
});

await agent.handler()(ctx);
```

#### Example 2: Ecosystem Skills (from skills.sh)

```bash
# Setup
cd examples/openai-skills-ecosystem
npx skills add vercel-labs/agent-skills/web-design-guidelines
npx skills add anthropics/skills/pdf
npx skills add browser-use/browser-use/browser-use

# Run
pnpm run dev
```

```typescript
// examples/openai-skills-ecosystem/src/index.ts
const agent = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(
    loadSkills({
      paths: "./skills",
      exclude: ["pdf"], // Don't need PDF for this task
    }),
  )
  .use(toolCalling);
```

#### Example 3: Custom + Ecosystem Mix

```typescript
// Use filesystem skills + custom in-memory skills
const agent = new Agent()
  .use(loadSkills({ paths: "./skills" })) // Filesystem
  .use(registerSkills([customTypedSkill])) // In-memory (future)
  .use(toolCalling);
```

**Deliverables:**

- ✅ 3+ working examples
- ✅ Instructions for using ecosystem skills
- ✅ Example skills included in repo

---

### Phase 5: Documentation (Week 3-4)

**Documentation packages:**

1. **Main README update**
   - Add skills section to feature list
   - Add to ecosystem table
   - Quick start with `loadSkills()`

2. **Middleware README**
   - `packages/middleware/load-skills/README.md`
   - Full API documentation
   - Options reference
   - SKILL.md format spec

3. **Skills Guide**
   - `docs/guides/skills-guide.md`
   - How to use ecosystem skills
   - How to create custom skills
   - Best practices

4. **Migration Guide**
   - Converting SISU tools to skills (when appropriate)
   - When to use tools vs. skills

**Deliverables:**

- ✅ Comprehensive documentation
- ✅ API reference
- ✅ Guide for skill authors
- ✅ Examples and tutorials

---

### Phase 6: Testing and Refinement (Week 4)

**Integration testing:**

- Test with real skills from skills.sh
- Test with large skill sets (50+ skills)
- Performance testing (startup time, memory)
- Error handling validation

**Real-world validation:**

- Use 5-10 popular skills from ecosystem
- Ensure compatibility
- Document any quirks or limitations

**Deliverables:**

- ✅ Integration tests with real skills
- ✅ Performance benchmarks
- ✅ Compatibility report
- ✅ Known limitations documented

---

### Timeline Summary

| Phase   | Duration | Deliverables                       |
| ------- | -------- | ---------------------------------- |
| Phase 1 | Week 1   | Core types, skills registry        |
| Phase 2 | Week 1-2 | Filesystem loader, SKILL.md parser |
| Phase 3 | Week 2   | CLI tooling                        |
| Phase 4 | Week 3   | Examples with ecosystem skills     |
| Phase 5 | Week 3-4 | Documentation                      |
| Phase 6 | Week 4   | Testing, validation                |

**Total: 4 weeks to MVP**

---

### Future Phases (Post-MVP)

**Phase 7: Option A Support (Optional)**

- Add `registerSkills()` for in-memory skills
- Support hybrid filesystem + in-memory
- Type-safe skill definitions

**Phase 8: Advanced Features**

- Embedding-based skill matching
- Skill dependency resolution
- Skill versioning and updates
- Performance optimizations (caching)

**Tests:**

- Unit tests for skill registration
- Tests for skill retrieval and listing

### Phase 2: Register Skills Middleware (Week 1-2)

**Packages:**

- `packages/middleware/register-skills/` - New package

**Implementation:**

```typescript
// packages/middleware/register-skills/src/index.ts
import type { Middleware, Skill } from "@sisu-ai/core";

export const registerSkills =
  (skills: Skill[]): Middleware =>
  async (ctx, next) => {
    for (const skill of skills) {
      ctx.log.debug(`Registering skill: ${skill.name}`, { skill: skill.name });
      ctx.skills.register(skill);
    }

    // Add metadata to system prompt
    const skillList = skills
      .map((s) => `[SKILL: ${s.name}] ${s.description}`)
      .join("\n");

    if (skillList) {
      ctx.systemPrompt =
        (ctx.systemPrompt || "") + "\n\n## Available Skills\n" + skillList;
    }

    await next();
  };
```

**Tests:**

- Test skill registration
- Test system prompt augmentation
- Test multiple skills
- Test empty skills array

### Phase 3: Skill Activation Middleware (Week 2)

**Packages:**

- `packages/middleware/skill-activation/` - New package

**Implementation:**

```typescript
// packages/middleware/skill-activation/src/index.ts
import type { Middleware } from "@sisu-ai/core";

export interface SkillActivationOptions {
  /** Minimum similarity score to trigger skill (0-1) */
  threshold?: number;
  /** Custom matcher function */
  matcher?: (text: string, description: string) => boolean;
}

export const skillActivation = (
  opts: SkillActivationOptions = {},
): Middleware => {
  const { threshold = 0.3, matcher = defaultMatcher } = opts;

  return async (ctx, next) => {
    const userMessages = ctx.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");

    const activated: string[] = [];

    for (const skill of ctx.skills.list()) {
      if (matcher(userMessages, skill.description)) {
        ctx.log.info(`Activating skill: ${skill.name}`);

        // Load instructions into system prompt
        const instructions = `\n\n## ${skill.name}\n${skill.instructions}`;
        ctx.systemPrompt = (ctx.systemPrompt || "") + instructions;

        // Register bundled tools
        if (skill.tools) {
          for (const tool of skill.tools) {
            ctx.tools.register(tool);
          }
        }

        activated.push(skill.name);
      }
    }

    if (activated.length > 0) {
      ctx.log.info("Skills activated", { skills: activated });
    }

    await next();
  };
};

function defaultMatcher(text: string, description: string): boolean {
  const keywords = description.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  return keywords.some((kw) => textLower.includes(kw));
}
```

**Tests:**

- Test skill activation on keyword match
- Test no activation when no match
- Test tool registration from skills
- Test custom matcher function
- Test threshold configuration

### Phase 4: Resource Loading (Week 3)

**Enhancement to skill activation:**

```typescript
// Add resource loading capability
export interface LoadedSkill extends Skill {
  loadResource(name: string): Promise<string>;
}

// In activation middleware
ctx.state.loadedSkills = new Map<string, LoadedSkill>();

for (const skill of activatedSkills) {
  const loaded: LoadedSkill = {
    ...skill,
    loadResource: async (name: string) => {
      const resource = skill.resources?.[name];
      if (!resource)
        throw new Error(`Resource ${name} not found in skill ${skill.name}`);

      if (typeof resource === "string") {
        return resource;
      }
      return await resource();
    },
  };

  ctx.state.loadedSkills.set(skill.name, loaded);
}
```

### Phase 5: Pre-built Skills (Week 3-4)

**Create example skills:**

```typescript
// packages/skills/pdf-processing/src/index.ts
import { z } from "zod";
import type { Skill } from "@sisu-ai/core";

export const pdfProcessingSkill: Skill = {
  name: "pdf-processing",
  description:
    "Extract text and tables from PDF files, fill forms, merge documents",
  instructions: `
# PDF Processing Skill

## Overview
This skill helps you work with PDF files: extract text, parse tables, fill forms, and merge documents.

## Quick Start
\`\`\`python
import pdfplumber
with pdfplumber.open(filepath) as pdf:
    for page in pdf.pages:
        text = page.extract_text()
\`\`\`

## Best Practices
1. Always validate PDF before processing
2. Handle large files in chunks
3. Check encoding for non-English text
  `,
  tools: [
    {
      name: "extractPdfText",
      description: "Extract text from a PDF file",
      schema: z.object({
        filePath: z.string(),
        pages: z.array(z.number()).optional(),
      }),
      handler: async ({ filePath, pages }) => {
        // Implementation using pdfplumber or similar
      },
    },
  ],
};
```

### Phase 6: Documentation and Examples (Week 4)

**Documentation:**

- `packages/middleware/register-skills/README.md`
- `packages/middleware/skill-activation/README.md`
- Update main README with skills section
- Add skills to ecosystem table

**Examples:**

- `examples/openai-skills-basic/` - Basic skill usage
- `examples/openai-skills-resources/` - Resource loading
- `examples/anthropic-skills/` - Skills with Anthropic
- `examples/ollama-skills/` - Skills with Ollama

**Example code:**

```typescript
// examples/openai-skills-basic/src/index.ts
import "dotenv/config";
import { Agent, createCtx } from "@sisu-ai/core";
import { openAIAdapter } from "@sisu-ai/adapter-openai";
import { registerSkills, skillActivation } from "@sisu-ai/mw-skills";
import { pdfProcessingSkill } from "@sisu-ai/skill-pdf-processing";
import { errorBoundary } from "@sisu-ai/mw-error-boundary";
import { traceViewer } from "@sisu-ai/mw-trace-viewer";

const agent = new Agent()
  .use(errorBoundary())
  .use(traceViewer())
  .use(registerSkills([pdfProcessingSkill]))
  .use(skillActivation())
  .use(toolCalling);

const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o" }),
  input: "Extract the executive summary from quarterly-report.pdf",
  systemPrompt: "You are a helpful assistant.",
});

await agent.handler()(ctx);
console.log(
  "Result:",
  ctx.messages.filter((m) => m.role === "assistant").pop()?.content,
);
```

## Alternatives Considered

### Alternative 1: Claude Skills Compatible Format

**Approach:** Exactly replicate Claude's filesystem-based SKILL.md format.

**Pros:**

- Direct compatibility with Claude skills
- Familiar to users of Claude.ai

**Cons:**

- Requires filesystem assumptions
- Doesn't fit SISU's in-memory, composable model
- Hard to test and mock
- Less type-safe

**Verdict:** ❌ Rejected - Violates SISU's explicit, composable design

### Alternative 2: Skills as Agents

**Approach:** Each skill is a sub-agent with its own pipeline.

**Pros:**

- Full agent capabilities per skill
- Maximum isolation

**Cons:**

- Too heavyweight for most use cases
- Complex to implement and debug
- High overhead

**Verdict:** ❌ Rejected - Over-engineered for the problem

### Alternative 3: Pure Prompt Templates

**Approach:** Skills are just prompt template functions.

```typescript
export type Skill = (ctx: Ctx) => string;
```

**Pros:**

- Extremely simple
- Low overhead

**Cons:**

- No tool bundling
- No resource loading
- No type safety
- Loses the "skill" concept

**Verdict:** ❌ Rejected - Too minimal, doesn't capture skill richness

## Success Criteria

### Functional Requirements (Option D Focus)

✅ **Skills load from filesystem** with standard SKILL.md format  
✅ **Include/exclude filtering** works as expected  
✅ **Skills activate automatically** based on semantic match  
✅ **Skills augment system prompts** with instructions  
✅ **Resource loading** works lazily from skill directories  
✅ **Skills are observable** in traces and logs  
✅ **Works with all adapters** (OpenAI, Anthropic, Ollama)  
✅ **Compatible with ecosystem skills** from skills.sh and GitHub  
✅ **Standard tooling works** (`npx skills add` integration)

### Ecosystem Integration Goals

✅ **Top 10 skills from skills.sh work without modification**:

- `vercel-labs/agent-skills/web-design-guidelines`
- `anthropics/skills/frontend-design`
- `browser-use/browser-use/browser-use`
- `anthropics/skills/pdf`
- `anthropics/skills/pptx`
- `anthropics/skills/docx`
- `anthropics/skills/xlsx`
- `vercel-labs/agent-skills/vercel-react-best-practices`
- `remotion-dev/skills/remotion-best-practices`
- `supabase/agent-skills/supabase-postgres-best-practices`

✅ **Skills remain portable**: Work in both SISU and other platforms  
✅ **No conversion required**: Use ecosystem skills as-is  
✅ **Documentation shows ecosystem usage**: Clear examples with real skills

### Non-Functional Requirements

✅ **Type-safe internally**: Parsed skills are typed objects  
✅ **Backward compatible**: No breaking changes to existing SISU APIs  
✅ **Testable**: Unit tests with mocked filesystem  
✅ **Observable**: Skill loading appears in trace viewer  
✅ **Documented**: Comprehensive README and examples  
✅ **Performant**:

- Minimal startup overhead (< 100ms for 10 skills)
- Skills cache after first load
- Lazy resource loading doesn't block

### User Experience Goals

✅ **Easy to get started**: `loadSkills()` just works  
✅ **Easy to use ecosystem skills**: `npx skills add owner/repo`  
✅ **Easy to create custom skills**: Markdown files, no coding  
✅ **Easy to debug**: Logs show skill discovery and activation  
✅ **Easy to compose**: Works with tools and other middleware  
✅ **Familiar**: Developers recognize SKILL.md pattern

### Quality Metrics

- **Test Coverage**: ≥80% (SISU standard)
- **Ecosystem Compatibility**: ≥90% of top 50 skills work
- **Performance**: < 100ms startup overhead for 10 skills
- **Documentation**: All features documented with examples
- **Error Messages**: Clear, actionable error messages for invalid skills

## Risks & Mitigations

### Risk 1: Token Consumption

**Risk:** Loading skill instructions into system prompt consumes significant tokens.

**Likelihood:** High  
**Impact:** Medium

**Mitigations:**

- Smart activation logic to minimize false positives
- Option to manually control which skills load
- Token usage tracking in trace viewer
- Recommendation to keep instructions concise

### Risk 2: Semantic Matching Accuracy

**Risk:** Simple keyword matching may have false positives/negatives.

**Likelihood:** Medium  
**Impact:** Medium

**Mitigations:**

- Start with conservative keyword matching
- Provide custom matcher option for advanced users
- Future enhancement: Embedding-based similarity
- Allow manual skill activation via API

### Risk 3: Confusion with Tools

**Risk:** Users may not understand when to use skills vs. tools.

**Likelihood:** Medium  
**Impact:** Low

**Mitigations:**

- Clear documentation explaining the difference
- Comparison table in README
- Examples showing both patterns
- Best practices guide

### Risk 4: Limited Code Execution

**Risk:** Unlike Claude, SISU skills can't execute bundled scripts directly.

**Likelihood:** High  
**Impact:** Low

**Mitigations:**

- Use tools for deterministic operations
- Skills provide guidance, tools provide execution
- Document this as intentional design choice
- Example showing skill + tool composition

## Migration Impact

**Breaking Changes:** None - this is a new feature.

**Backward Compatibility:** ✅ Full backward compatibility

- Existing agents work without changes
- Skills are opt-in via middleware
- No impact on tool system
- No impact on adapters

**Adoption Path:**

1. Optional for new projects
2. Can be added incrementally to existing projects
3. Works alongside all existing middleware

## Future Enhancements

### Phase 2 Enhancements (Post-MVP)

1. **Embedding-based matching**: Use vector similarity for skill activation
2. **Skill composition**: Skills can depend on other skills
3. **Skill packages**: Curated skill collections (`@sisu-ai/skills-data-analysis`)
4. **Skill marketplace**: Community-contributed skills
5. **Skill versioning**: Semantic versioning for skill compatibility
6. **Skill analytics**: Track skill usage and effectiveness
7. **Multi-language skills**: Support non-English instructions
8. **Skill caching**: Cache loaded resources across runs

### Integration Opportunities

1. **RAG integration**: Load skill resources from vector stores
2. **Control flow**: Branch based on activated skills
3. **Guardrails**: Validate skill activation and output
4. **Tracing**: Enhanced trace view showing skill timelines

## References

### External Documentation

- [Claude Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Skills Architecture](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Claude Skills Quickstart](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart)
- [Claude Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

### SISU Documentation

- [SISU README](../../README.md)
- [SISU AGENTS Guidelines](../../AGENTS.md)
- [Core Types](../../packages/core/src/types.ts)
- [Tool System](../../packages/middleware/register-tools/README.md)
- [Middleware Architecture](../../packages/middleware/README.md)

### Related Design Topics

- [DT 20260212-0900: Tool Typing and Schema Inference](./dt-20260212-0900-tool-typing-schema-inference.md)
- [DT 20260212-0930: Typed Tool Errors](./dt-20260212-0930-typed-tool-errors.md)

---

## Appendix A: Ecosystem Integration Patterns

### Installing Skills from skills.sh

```bash
# Method 1: Using npx (recommended)
npx skills add vercel-labs/agent-skills/web-design-guidelines

# Method 2: Manual clone and copy
git clone https://github.com/vercel-labs/agent-skills.git temp
cp -r temp/web-design-guidelines ./skills/
rm -rf temp

# Method 3: Download single skill
curl -L https://github.com/anthropics/skills/raw/main/pdf/SKILL.md \
  > ./skills/pdf/SKILL.md
```

### Directory Structure for Mixed Skills

```
project/
├── skills/                           # Ecosystem skills
│   ├── web-design-guidelines/        # From skills.sh
│   ├── browser-use/                  # From GitHub
│   └── pdf-processing/               # From Anthropic
├── team-skills/                      # Custom organization skills
│   ├── company-coding-standards/
│   └── api-guidelines/
└── src/
    └── index.ts
```

### Loading Configuration Patterns

```typescript
// Pattern 1: Load everything
.use(loadSkills())

// Pattern 2: Multiple directories
.use(loadSkills({
  paths: ['./skills', './team-skills']
}))

// Pattern 3: Selective loading
.use(loadSkills({
  paths: './skills',
  include: ['web-design-guidelines', 'pdf'],
  exclude: ['browser-use']  // Too heavy for this app
}))

// Pattern 4: Development vs. Production
const skillPaths = process.env.NODE_ENV === 'production'
  ? ['./skills/production']
  : ['./skills', './skills-dev'];

.use(loadSkills({ paths: skillPaths }))

// Pattern 5: Dynamic configuration
const config = await loadConfig();
.use(loadSkills(config.skills))
```

### Skill Update Workflow

```bash
# Update a skill from ecosystem
cd skills/web-design-guidelines
git pull origin main

# Or use npx to re-install
npx skills add vercel-labs/agent-skills/web-design-guidelines --force

# Verify skill still works
sisu skills validate ./skills/web-design-guidelines
```

### Creating SISU-Compatible Skills for Contribution

```markdown
## <!-- skills/my-awesome-skill/SKILL.md -->

name: my-awesome-skill
description: Brief description of what this skill does and when to use it

---

# My Awesome Skill

## Overview

High-level description of the skill's purpose.

## When to Use This Skill

- Use case 1
- Use case 2

## Instructions

Step-by-step guidance for the AI agent.

### Step 1: Analysis

Analyze the user's request and identify key requirements.

### Step 2: Planning

Create a plan based on best practices...

### Step 3: Implementation

Execute the plan with attention to...

## Best Practices

1. Practice 1
2. Practice 2

## Examples

### Example 1: Basic Usage

\`\`\`typescript
// Example code
\`\`\`

### Example 2: Advanced Usage

\`\`\`typescript
// More example code
\`\`\`

## References

- [Link to docs](https://example.com)
- [Related skill](../related-skill/SKILL.md)
```

### Publishing Skills to Ecosystem

```bash
# 1. Create GitHub repo
mkdir my-skills
cd my-skills
git init

# 2. Add skill(s)
mkdir my-awesome-skill
cat > my-awesome-skill/SKILL.md << 'EOF'
---
name: my-awesome-skill
description: Your description here
---
Your instructions here...
EOF

# 3. Push to GitHub
git add .
git commit -m "Add my-awesome-skill"
git remote add origin git@github.com:yourusername/my-skills.git
git push -u origin main

# 4. Others can now install with:
# npx skills add yourusername/my-skills/my-awesome-skill
```

---

## Appendix B: Key Differences from Claude Skills

| Aspect               | Claude Skills                       | SISU Skills (Option D)            |
| -------------------- | ----------------------------------- | --------------------------------- |
| **Format**           | SKILL.md (YAML + markdown)          | ✅ **Same**                       |
| **Storage**          | Filesystem                          | ✅ **Same**                       |
| **Discovery**        | Auto-scan directories               | ✅ **Same**                       |
| **Activation**       | System prompt metadata              | ✅ **Same**                       |
| **Progressive Load** | Metadata → Instructions → Resources | ✅ **Same**                       |
| **Resource Loading** | Bash reads from filesystem          | ✅ **Node.js fs/promises**        |
| **Code Execution**   | Direct script execution via bash    | ⚠️ **Via tool handlers**          |
| **Tool Bundling**    | Not directly supported              | ✅ **Can bundle tools**           |
| **Configuration**    | Hidden (auto-discovery)             | ✅ **Explicit middleware config** |
| **Filtering**        | Not available                       | ✅ **Include/exclude options**    |
| **Portability**      | Claude ecosystem                    | ✅ **Same + works in SISU**       |
| **CLI Tooling**      | `npx skills add`                    | ✅ **Compatible**                 |
| **Typing**           | None (runtime only)                 | ✅ **Typed internally**           |
| **Testing**          | Manual                              | ✅ **Unit testable**              |
| **Observability**    | Basic                               | ✅ **Full trace integration**     |

**Key SISU Advantages:**

1. **Explicit control**: Configure paths, includes, excludes
2. **Better observability**: Skills appear in structured logs and traces
3. **Testable**: Mock filesystem for deterministic tests
4. **Tool bundling**: Skills can register SISU tools
5. **Type-safe internally**: Parsed into typed objects

**Claude Advantages:**

1. **Direct code execution**: Can run bundled scripts via bash
2. **Zero config**: Just drop files in directory

**Verdict:** SISU's approach is more explicit and observable while maintaining full compatibility with the ecosystem format.

---

## Appendix C: Alternatives Considered (Revisited)

### Why Not Pure TypeScript Skills (Option A)?

**The ecosystem argument wins:**

- **54,000+ installs** across hundreds of skills
- **Active community** creating new skills daily
- **Standard format** recognized across multiple platforms
- **Zero conversion barrier** for adoption

**The TypeScript-only approach would:**

- ❌ Force rewriting all existing skills
- ❌ Limit skill authors to TypeScript developers
- ❌ Create SISU-specific ecosystem (network effects = 0)
- ❌ Require npm publishing for skill sharing

**But we can have both:**

```typescript
// Filesystem skills (ecosystem)
.use(loadSkills({ paths: './skills' }))

// TypeScript skills (future: Option A)
.use(registerSkills([customTypedSkill]))
```

This gives us:

- ✅ Immediate ecosystem access (Option D)
- ✅ Type-safe skills when needed (Option A, future)
- ✅ No forced choice, both work together

### Why Not Tool Factories (Option B)?

Skills are about **procedural knowledge**, not just function calling:

```markdown
<!-- Skill: Gives guidance -->

# When to Use This Skill

Use for designing modern, accessible web interfaces.

# Best Practices

1. Use semantic HTML
2. Ensure WCAG AA compliance
3. Test with screen readers

# Step-by-Step Process

1. Analyze requirements
2. Create wireframes
3. Implement with accessibility in mind
```

```typescript
// Tool: Executes function
const createLayout: Tool = {
  name: "createLayout",
  handler: async ({ type, content }) => {
    return generateHTML(type, content);
  },
};
```

**Skills provide guidance.** Tools provide execution. Both are valuable, different use cases.

### Why Not Per-Skill Middleware (Option C)?

Too low-level for most skill authors:

```typescript
// Option C: Requires middleware expertise
export const createPDFSkillMiddleware = (): Middleware => async (ctx, next) => {
  // Author must understand middleware lifecycle
  // Author must handle activation logic
  // Author must manage context state
  // Author must call await next() correctly
};
```

```markdown
## <!-- Option D: Author writes markdown -->

name: pdf-processing
description: Work with PDF files

---

# Instructions

Use pdfplumber to extract text...
```

**Option D has a lower barrier to entry** while still being composable.

---
