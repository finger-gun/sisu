# CRITICAL CLARIFICATION: Tools and Skills in SISU

**Date**: 2025-02-12  
**Context**: User question about tool availability for skills  
**Status**: ✅ RESOLVED

---

## User's Critical Question

> "You mentioned 'Existing tools handle resources = No code changes to read_file/bash', we do not have these tools, right? Also must user of SISU load required tools used in skills upfront, before skills?"

## Answer: Tools ARE Available! ✅

### SISU Has These Tools (Already Built)

**Package**: `@sisu-ai/tool-terminal`

Provides:

1. ✅ `run_command` - Execute bash/shell commands (equivalent to "bash tool")
2. ✅ `read_file` - Read files with path validation (equivalent to "read_file tool")
3. ✅ `cd` - Change working directory in session

**Source**: `/packages/tools/terminal/src/index.ts:472-564`

---

## How Skills Work With Tools in SISU

### Option 1: User Provides Tools (Explicit Control) ✅ RECOMMENDED

**User must register tools before using skills that need them.**

```typescript
import { Agent } from "@sisu-ai/core";
import { skillsMiddleware } from "@sisu-ai/mw-skills";
import { createTerminalTool } from "@sisu-ai/tool-terminal";

// User explicitly loads tools they want to allow
const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: true, exec: true },
});

const agent = Agent.create({
  model: openAIAdapter({ model: "gpt-4" }),
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
  tools: terminal.tools, // <-- User provides tools explicitly
});
```

**Flow**:

1. User loads skills middleware
2. User registers terminal tools (run_command, read_file, cd)
3. Skill activated: SKILL.md says "See ./deploy.sh for script"
4. LLM calls `read_file({ path: "./deploy.sh" })` tool
5. Tool validates path, reads file, returns content
6. LLM reads script, adapts it
7. LLM proposes `run_command({ command: "npm run build" })`
8. User approves execution
9. Tool runs command, returns output

**Advantages**:

- ✅ **Explicit control** - user decides which tools to enable
- ✅ **Security** - user configures tool permissions upfront
- ✅ **SISU philosophy** - explicit, not magical
- ✅ **Flexibility** - different tools for different agents

**Disadvantages**:

- User must know to load terminal tools if using skills with scripts/resources
- More configuration required

---

### Option 2: Skills Middleware Auto-Registers Tools (Convenience)

**Skills middleware automatically adds terminal tools if not present.**

```typescript
import { Agent } from "@sisu-ai/core";
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const agent = Agent.create({
  model: openAIAdapter({ model: "gpt-4" }),
  middleware: [
    skillsMiddleware({
      cwd: process.cwd(),
      autoRegisterTools: true, // <-- Auto-add terminal tools
    }),
  ],
  // tools: []  <-- No explicit tool registration needed
});
```

**Implementation**:

```typescript
// In @sisu-ai/mw-skills/src/index.ts
import { createTerminalTool } from "@sisu-ai/tool-terminal";

export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // Discover skills
    if (!ctx.skills) {
      ctx.skills = await discoverSkills(options.cwd);
    }

    // Add use_skill tool
    ctx.tools.push(useSkillTool(ctx.skills));

    // Auto-register terminal tools if enabled
    if (options.autoRegisterTools) {
      const hasTerminalTools = ctx.tools.some(
        (t) => t.name === "terminalRun" || t.name === "terminalReadFile",
      );

      if (!hasTerminalTools) {
        const terminal = createTerminalTool({
          roots: [options.cwd],
          capabilities: { read: true, write: false, exec: true },
        });
        ctx.tools.push(...terminal.tools);
        ctx.log.info("Skills: Auto-registered terminal tools");
      }
    }

    await next();
  };
}
```

**Advantages**:

- ✅ **Convenience** - skills "just work" out of the box
- ✅ **Less config** - user doesn't need to know about terminal tools

**Disadvantages**:

- ❌ **Implicit** - violates SISU's explicit philosophy
- ❌ **Less control** - user can't customize tool permissions
- ❌ **Dependency coupling** - skills package now depends on terminal package

---

## Recommended Approach for SISU

### ✅ Option 1 (Explicit) + Documentation

**Why**:

1. **Aligns with SISU philosophy** - explicit, observable, composable
2. **User control** - they decide tool permissions and capabilities
3. **Dependency-free** - skills middleware doesn't depend on terminal package
4. **Clear separation** - middleware provides skills, user provides execution environment

**Implementation**:

```typescript
// packages/middleware/skills/src/index.ts
export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // 1. Discover skills
    if (!ctx.skills) {
      ctx.skills = await discoverSkills(options);
    }

    // 2. Add use_skill tool
    ctx.tools.push(useSkillTool(ctx.skills));

    // 3. Inject metadata into system prompt
    if (ctx.skills.length > 0) {
      const skillsList = ctx.skills
        .map((s) => `  - "${s.name}": ${s.description}`)
        .join("\n");

      ctx.systemPrompt =
        (ctx.systemPrompt || "") +
        `

SKILLS

Available skills:
${skillsList}

Use the use_skill tool to activate a skill when the user's request matches.
`;
    }

    // 4. Check if terminal tools available (warn if missing and skills need them)
    if (ctx.skills.length > 0) {
      const hasTerminalTools = ctx.tools.some(
        (t) => t.name === "terminalRun" || t.name === "terminalReadFile",
      );

      if (!hasTerminalTools) {
        ctx.log.warn(
          "Skills loaded but terminal tools (terminalRun, terminalReadFile) not found. " +
            "Skills may not work correctly. " +
            'Add: import { createTerminalTool } from "@sisu-ai/tool-terminal"',
        );
      }
    }

    await next();
  };
}
```

**Documentation** (in README):

````markdown
## Prerequisites

Skills often reference files and scripts. To use skills effectively, register terminal tools:

```typescript
import { createTerminalTool } from "@sisu-ai/tool-terminal";

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: {
    read: true, // Allow skills to read files
    write: false, // Prevent writing (optional)
    exec: true, // Allow running commands
  },
});

const agent = Agent.create({
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
  tools: terminal.tools, // <-- Required for skills with resources/scripts
});
```
````

**Note**: Without terminal tools, skills can still provide instructions, but the LLM cannot:

- Read skill resource files (templates, docs, etc.)
- Execute scripts referenced in skills
- Run diagnostic commands

The skills middleware will warn if terminal tools are missing.

````

---

## Tool Usage Patterns in Skills

### Pattern 1: Read-Only Skills (Common)

**Skill needs to read templates/docs but not execute anything.**

```typescript
// User config
const terminal = createTerminalTool({
  capabilities: { read: true, write: false, exec: false }
})
````

**Example skill**: `api-integration`

```markdown
# In SKILL.md

See `./templates/api-client.ts` for the client implementation.
```

**Flow**:

1. LLM calls `terminalReadFile({ path: "./templates/api-client.ts" })`
2. Tool reads file, returns content
3. LLM adapts template to user's project
4. LLM proposes creating file (user approves)

---

### Pattern 2: Script-Executing Skills (Power User)

**Skill needs to read scripts AND execute commands.**

```typescript
const terminal = createTerminalTool({
  capabilities: { read: true, write: false, exec: true },
  commands: {
    allow: ["npm", "git", "rsync", "ssh", "*"], // Be cautious!
  },
});
```

**Example skill**: `deploy-staging`

```markdown
# In SKILL.md

Use `./deploy.sh` for deployment.
```

**Flow**:

1. LLM calls `terminalReadFile({ path: "./deploy.sh" })`
2. Tool reads script
3. LLM understands script: "npm build && rsync to server"
4. LLM proposes `terminalRun({ command: "npm run build" })`
5. User approves
6. Tool executes, returns output
7. LLM proposes next step: `terminalRun({ command: "rsync ..." })`
8. User approves each step

---

### Pattern 3: Instructions-Only Skills (No Tools)

**Skill provides guidance without needing files or execution.**

```typescript
// No terminal tools needed
const agent = Agent.create({
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
  tools: [], // Empty is fine!
});
```

**Example skill**: `code-review-checklist`

```markdown
---
name: code-review-checklist
description: Provides code review checklist and best practices
---

# Code Review Checklist

When reviewing code:

1. Check for security vulnerabilities
2. Verify error handling
3. Validate input sanitization
   ...
```

**Flow**:

1. User: "Review this code"
2. LLM matches to `code-review-checklist` skill
3. LLM calls `use_skill({ skill_name: "code-review-checklist" })`
4. Skill loads, provides checklist
5. LLM follows checklist (no tool calls needed)

---

## Example Configurations

### Minimal (Instructions-Only)

```typescript
import { Agent } from "@sisu-ai/core";
import { skillsMiddleware } from "@sisu-ai/mw-skills";

const agent = Agent.create({
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
  // No tools - skills can only provide text instructions
});
```

**Works for**: Guidelines, checklists, best practices, explanations

---

### Standard (Read + Execute)

```typescript
import { createTerminalTool } from "@sisu-ai/tool-terminal";

const terminal = createTerminalTool({
  roots: [process.cwd()],
  capabilities: { read: true, write: false, exec: true },
  commands: { allow: ["npm", "git", "ls", "cat", "grep", "*"] },
});

const agent = Agent.create({
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
  tools: terminal.tools,
});
```

**Works for**: 95% of skills (templates, scripts, workflows)

---

### Power User (Full Access)

```typescript
const terminal = createTerminalTool({
  roots: [process.cwd(), "/home/user"],
  capabilities: { read: true, write: true, delete: true, exec: true },
  commands: { allow: ["*"] }, // Allow all commands
  allowPipe: true,
  allowSequence: true,
});

const agent = Agent.create({
  middleware: [skillsMiddleware({ cwd: process.cwd() })],
  tools: terminal.tools,
});
```

**Works for**: Advanced automation, DevOps workflows, system administration

**⚠️ Warning**: Full write/delete access is powerful - use with caution!

---

## Tool Validation in Skills (Optional Enhancement)

### Skill Frontmatter Declares Required Tools

```markdown
---
name: deploy-staging
description: Deploy to staging environment
required-tools: [terminalRun, terminalReadFile]
---
```

**Skills middleware validates**:

```typescript
export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // ... discovery code ...

    // Validate required tools
    if (options.validateTools !== false) {
      for (const skill of ctx.skills) {
        if (skill.requiredTools) {
          const missing = skill.requiredTools.filter(
            (toolName) => !ctx.tools.some((t) => t.name === toolName),
          );

          if (missing.length > 0) {
            ctx.log.warn(
              `Skill "${skill.name}" requires tools: ${missing.join(", ")}. ` +
                `Add these tools for full skill functionality.`,
            );
          }
        }
      }
    }

    await next();
  };
}
```

**Benefits**:

- ✅ Early detection of missing tools
- ✅ Better user experience (clear error messages)
- ✅ Skills self-document dependencies

---

## Recommendation Summary

### ✅ Final Design

1. **Skills middleware does NOT auto-register tools** (explicit philosophy)
2. **User must provide terminal tools** if skills need them
3. **Skills middleware warns** if tools missing but skills present
4. **Skills can optionally declare** `required-tools` in frontmatter
5. **Documentation clearly explains** tool requirements with examples

### Configuration Levels

```typescript
// Level 1: Instructions only (no tools)
skillsMiddleware({ cwd: process.cwd() })

// Level 2: Read-only (recommended default)
skillsMiddleware({ cwd: process.cwd() })
+ terminal.tools with { read: true, write: false, exec: false }

// Level 3: Read + Execute (recommended for most users)
skillsMiddleware({ cwd: process.cwd() })
+ terminal.tools with { read: true, write: false, exec: true }

// Level 4: Full power (use with caution)
skillsMiddleware({ cwd: process.cwd() })
+ terminal.tools with { read: true, write: true, exec: true }
```

### Package Dependencies

```json
// @sisu-ai/mw-skills/package.json
{
  "dependencies": {
    "zod": "^3.x" // Only dependency
  },
  "peerDependencies": {
    "@sisu-ai/tool-terminal": "^1.x" // Optional, for full functionality
  },
  "peerDependenciesMeta": {
    "@sisu-ai/tool-terminal": {
      "optional": true // Not required, but recommended
    }
  }
}
```

---

## This Resolves the Question

**Q**: "Must user of SISU load required tools used in skills upfront, before skills?"

**A**: **YES** ✅ User must explicitly load terminal tools if skills need to:

- Read resource files (templates, docs, scripts)
- Execute commands

This aligns with SISU's explicit philosophy - user controls what tools the agent can use.

**Q**: "We do not have these tools, right?"

**A**: **WRONG** ❌ SISU DOES have these tools!

- `@sisu-ai/tool-terminal` provides `terminalRun`, `terminalReadFile`, `cd`
- These are equivalent to "bash" and "read_file" mentioned in research
- User just needs to import and register them

---

**Updated Research Status**: ✅ Tool availability confirmed, design clarified, recommendation validated
