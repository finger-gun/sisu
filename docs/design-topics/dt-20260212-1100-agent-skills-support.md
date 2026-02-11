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

## Recommended Approach: **Option A** (Enhanced System Prompts)

**Rationale:**

1. **Best alignment with SISU principles**: Explicit, composable, observable
2. **Preserves skill concept**: Instructions + tools + resources as a bundle
3. **Provider-agnostic**: Works across OpenAI, Anthropic, Ollama
4. **Progressive disclosure**: Can implement all three loading levels
5. **Type-safe and testable**: Full TypeScript support
6. **Observable**: Skill loading appears in traces
7. **Composable**: Works alongside existing tools and middleware

**Trade-offs accepted:**

- Token consumption from loaded instructions (mitigated by activation logic)
- Simple semantic matching initially (can enhance with embeddings later)
- No native script execution (use tools for deterministic operations)

## Implementation Plan

### Phase 1: Core Types and Registry (Week 1)

**Packages:**

- `packages/core/src/types.ts` - Add `Skill`, `SkillCtx` interfaces
- `packages/core/src/context.ts` - Add skills registry to context creation

**Files to modify:**

```typescript
// packages/core/src/types.ts
export interface Skill {
  name: string;
  description: string;
  instructions: string;
  resources?: Record<string, string | (() => Promise<string>)>;
  tools?: Tool[];
  schema?: z.ZodObject<any>;
}

// packages/core/src/context.ts
export function createCtx(config: CtxConfig): Ctx {
  // ... existing setup ...

  const skillsRegistry = new Map<string, Skill>();

  return {
    // ... existing fields ...
    skills: {
      register: (skill: Skill) => skillsRegistry.set(skill.name, skill),
      get: (name: string) => skillsRegistry.get(name),
      list: () => Array.from(skillsRegistry.values()),
      trigger: async (name: string, ctx: SkillCtx) => {
        const skill = skillsRegistry.get(name);
        if (!skill) throw new Error(`Skill not found: ${name}`);
        // Trigger logic
      },
    },
  };
}
```

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

### Functional Requirements

✅ **Skills can be registered** via middleware  
✅ **Skills activate automatically** based on semantic match  
✅ **Skills augment system prompts** with instructions  
✅ **Skills can bundle tools** for automatic registration  
✅ **Skills support resource loading** (lazy evaluation)  
✅ **Skills are observable** in traces and logs  
✅ **Skills work with all adapters** (OpenAI, Anthropic, Ollama)

### Non-Functional Requirements

✅ **Type-safe**: Full TypeScript typing with Zod validation  
✅ **Backward compatible**: No breaking changes to existing APIs  
✅ **Testable**: Unit tests for all components  
✅ **Observable**: Skill loading appears in trace viewer  
✅ **Documented**: Comprehensive README and examples  
✅ **Performant**: Minimal overhead when skills not activated

### User Experience Goals

✅ **Easy to create skills**: Simple interface, clear examples  
✅ **Easy to use skills**: Explicit registration, automatic activation  
✅ **Easy to debug**: Logs show skill activation and usage  
✅ **Easy to compose**: Works with tools and other middleware

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

## Appendix: Key Differences from Claude Skills

| Aspect               | Claude Skills           | SISU Skills (Proposed)           |
| -------------------- | ----------------------- | -------------------------------- |
| **Storage**          | Filesystem (SKILL.md)   | In-memory (TypeScript objects)   |
| **Loading**          | Bash reads from FS      | Function calls / string literals |
| **Activation**       | System prompt metadata  | Semantic matching in middleware  |
| **Code Execution**   | Direct script execution | Via tool handlers                |
| **Resources**        | Files on disk           | Lazy-loaded functions            |
| **Sharing**          | Zip files, API uploads  | npm packages, code               |
| **Discovery**        | Filesystem scan         | Explicit registration            |
| **Typing**           | None (markdown)         | Full TypeScript                  |
| **Testing**          | Manual                  | Unit tests with mocks            |
| **Provider Support** | Claude only             | OpenAI, Anthropic, Ollama        |

These differences reflect SISU's philosophy of **explicit, composable, type-safe** design while preserving the core value of Skills: bundled domain expertise with progressive disclosure.
