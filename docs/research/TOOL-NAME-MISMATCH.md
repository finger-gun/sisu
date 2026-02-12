# CRITICAL: Tool Name Mismatch Problem in SISU Skills

**Date**: 2025-02-12  
**Status**: 🔴 DESIGN ISSUE IDENTIFIED  
**Priority**: HIGH - Affects skills ecosystem compatibility

---

## The Problem

### What Skills Expect (from skills.sh ecosystem)

Skills are written by community for platforms like Cline, Claude, Windsurf. They reference tools by **generic names**:

```markdown
---
name: deploy-staging
allowed-tools: [bash, read_file, write_file]
---

# Deploy to Staging

Use `read_file` to check ./config.yaml
Then run `bash` to execute deployment.
```

**Expected tool names**: `bash`, `read_file`, `write_file`, `python`, etc.

### What SISU Actually Has

**SISU terminal tool provides**:

- ❌ `terminalRun` (NOT "bash")
- ❌ `terminalReadFile` (NOT "read_file")
- ❌ `terminalCd` (NOT "cd")

**Source**: `/packages/tools/terminal/src/index.ts:485-543`

```typescript
const runCommandTool: Tool = {
  name: 'terminalRun',  // <-- Not "bash"!
  ...
}

const readFileTool: Tool = {
  name: 'terminalReadFile',  // <-- Not "read_file"!
  ...
}
```

---

## Impact Assessment

### ❌ Problem 1: LLM Won't Find Tools

When skill says:

```markdown
Use `read_file` to load the template.
```

LLM looks for tool named `read_file` but SISU only has `terminalReadFile`.

**Result**: Tool not found, skill broken.

### ❌ Problem 2: Ecosystem Incompatibility

**54,000+ existing skills** from skills.sh expect:

- `bash` (not `terminalRun`)
- `read_file` (not `terminalReadFile`)
- `write_file` (not `terminalWrite`)
- `python` (not `terminalRunPython`)

**Result**: SISU skills won't work with existing ecosystem.

### ❌ Problem 3: Skill Validation Broken

If skills declare:

```yaml
allowed-tools: [bash, read_file]
```

Skills middleware checks if these tools exist. With SISU's naming:

- `bash` NOT FOUND (only `terminalRun` exists)
- `read_file` NOT FOUND (only `terminalReadFile` exists)

**Result**: All ecosystem skills fail validation.

---

## How Tool Matching Works

### LLM Tool Calling Process

1. **LLM receives tool definitions** in system prompt:

```json
{
  "tools": [
    {
      "name": "terminalRun",
      "description": "Execute commands...",
      ...
    },
    {
      "name": "terminalReadFile",
      "description": "Read files...",
      ...
    }
  ]
}
```

2. **Skill instructions say**: "Use `bash` to run deployment"

3. **LLM searches for tool** named `bash` in available tools

4. **❌ NOT FOUND** - only `terminalRun` exists

5. **LLM either**:
   - Tells user "I don't have a bash tool"
   - Tries to use `terminalRun` (if smart enough to infer)
   - Gives up

### The Inference Problem

**Modern LLMs MIGHT infer**:

- "bash" probably means `terminalRun`
- "read_file" probably means `terminalReadFile`

**BUT this is unreliable**:

- Not guaranteed across models
- Adds latency (LLM has to reason)
- Breaks explicit tool calling
- May choose wrong tool if multiple similar ones exist

---

## Solutions

### Option 1: Rename SISU Tools (Breaking Change) ❌ NOT RECOMMENDED

Change SISU terminal tool names to match ecosystem:

```typescript
// Change from:
const runCommandTool: Tool = {
  name: 'terminalRun',  // ❌ SISU-specific
  ...
}

// To:
const runCommandTool: Tool = {
  name: 'bash',  // ✅ Ecosystem standard
  ...
}
```

**Advantages**:

- ✅ Instant compatibility with 54K+ skills
- ✅ No translation layer needed
- ✅ Matches community expectations

**Disadvantages**:

- ❌ **BREAKING CHANGE** for existing SISU users
- ❌ "bash" is generic, doesn't clarify it's sandboxed
- ❌ Conflicts with SISU's explicit naming convention
- ❌ May have multiple "bash" tools from different packages

**Verdict**: Too disruptive for existing SISU codebase

---

### Option 2: Tool Alias System ✅ RECOMMENDED

Add **aliases** to SISU tools, keep original names:

```typescript
// @sisu-ai/tool-terminal/src/index.ts
const runCommandTool: Tool = {
  name: 'terminalRun',
  aliases: ['bash', 'shell', 'exec'],  // <-- ADD THIS
  description: '...',
  schema: z.object(...),
  handler: async (args, ctx) => { ... }
}

const readFileTool: Tool = {
  name: 'terminalReadFile',
  aliases: ['read_file', 'readFile', 'cat'],  // <-- ADD THIS
  description: '...',
  schema: z.object(...),
  handler: async (args, ctx) => { ... }
}
```

**Core Type Update**:

```typescript
// @sisu-ai/core/src/types.ts
export interface Tool<TArgs = any, TResult = any> {
  name: string;
  aliases?: string[]; // <-- ADD THIS
  description: string;
  schema: z.ZodSchema<TArgs>;
  handler: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}
```

**Tool Calling Middleware Update**:

```typescript
// @sisu-ai/mw-tool-calling/src/index.ts
export function toolCalling(): Middleware {
  return async (ctx, next) => {
    // Build tool map with aliases
    const toolMap = new Map<string, Tool>();

    for (const tool of ctx.tools) {
      // Register by primary name
      toolMap.set(tool.name, tool);

      // Register by aliases
      if (tool.aliases) {
        for (const alias of tool.aliases) {
          if (toolMap.has(alias)) {
            ctx.log.warn(`Tool alias conflict: "${alias}" already exists`);
          } else {
            toolMap.set(alias, tool);
          }
        }
      }
    }

    // When LLM calls tool, lookup by name OR alias
    const requestedTool = toolMap.get(toolCall.name);
    if (requestedTool) {
      await requestedTool.handler(toolCall.args, ctx);
    }

    await next();
  };
}
```

**Advantages**:

- ✅ **Backward compatible** - existing SISU code works
- ✅ **Ecosystem compatible** - skills work with aliases
- ✅ **Explicit** - primary name still `terminalRun` (SISU convention)
- ✅ **Flexible** - can add multiple aliases per tool
- ✅ **No breaking changes**

**Disadvantages**:

- Small complexity in tool resolution
- Need to update tool-calling middleware
- Need to update core Tool type

**Verdict**: ✅ **BEST SOLUTION** for SISU

---

### Option 3: Skills Middleware Translation Layer ⚠️ ALTERNATIVE

Skills middleware translates tool names in skill instructions:

```typescript
// @sisu-ai/mw-skills/src/index.ts
const TOOL_ALIASES = {
  bash: "terminalRun",
  read_file: "terminalReadFile",
  write_file: "terminalWrite",
  python: "terminalRunPython",
};

export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // ... load skills ...

    // When loading skill content, translate tool references
    for (const skill of ctx.skills) {
      skill.instructions = translateToolNames(skill.instructions, TOOL_ALIASES);
    }

    await next();
  };
}

function translateToolNames(
  text: string,
  aliases: Record<string, string>,
): string {
  let result = text;

  // Replace `bash` with `terminalRun`
  for (const [from, to] of Object.entries(aliases)) {
    // Match backtick-wrapped tool names
    result = result.replace(new RegExp(`\`${from}\``, "g"), `\`${to}\``);
  }

  return result;
}
```

**Advantages**:

- ✅ No changes to tool-calling middleware
- ✅ Works with existing SISU tools
- ✅ Skills use ecosystem names

**Disadvantages**:

- ❌ **Text replacement is brittle** - may break code blocks
- ❌ **Only works in skill instructions** - doesn't help LLM tool calls
- ❌ **Doesn't solve `allowed-tools` validation**
- ❌ **Hacky and error-prone**

**Verdict**: ⚠️ Fragile, not recommended

---

### Option 4: Dual Tool Registration (Compatibility Mode) ⚠️ WORKAROUND

Register tools twice with different names:

```typescript
const terminal = createTerminalTool({ ... });

// Register with SISU names
ctx.tools.push(...terminal.tools);

// Also register with ecosystem aliases
ctx.tools.push(
  { ...terminal.tools[0], name: 'bash' },          // terminalRun as bash
  { ...terminal.tools[1], name: 'cd' },            // terminalCd as cd
  { ...terminal.tools[2], name: 'read_file' }      // terminalReadFile as read_file
);
```

**Advantages**:

- ✅ Works immediately without code changes
- ✅ Both naming conventions work

**Disadvantages**:

- ❌ **Duplicates tools** - 6 tools instead of 3
- ❌ **Confusing for users** - which one to use?
- ❌ **Tool list pollution**
- ❌ **Manual registration** required

**Verdict**: ⚠️ Quick workaround but not elegant

---

## Recommended Implementation: Option 2 (Aliases)

### Phase 1: Update Core Types

```typescript
// @sisu-ai/core/src/types.ts
export interface Tool<TArgs = any, TResult = any> {
  /** Primary tool name (used in SISU) */
  name: string;

  /** Alternative names for ecosystem compatibility */
  aliases?: string[];

  /** Tool description for LLM */
  description: string;

  /** Zod schema for argument validation */
  schema: z.ZodSchema<TArgs>;

  /** Tool implementation */
  handler: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}
```

### Phase 2: Update Terminal Tool

```typescript
// @sisu-ai/tool-terminal/src/index.ts
const runCommandTool: Tool = {
  name: 'terminalRun',
  aliases: ['bash', 'shell', 'run', 'exec'],
  description: [
    'Execute a command in the sandboxed terminal.',
    'Also known as: bash, shell, run, exec'
  ].join(' '),
  schema: z.object({
    command: z.string(),
    sessionId: z.string().optional()
  }),
  handler: async (args, ctx) => { ... }
};

const readFileTool: Tool = {
  name: 'terminalReadFile',
  aliases: ['read_file', 'readFile', 'cat', 'read'],
  description: [
    'Read a file from the sandboxed workspace.',
    'Also known as: read_file, readFile, cat, read'
  ].join(' '),
  schema: z.object({
    path: z.string(),
    encoding: z.enum(['utf8', 'base64']).optional(),
    sessionId: z.string().optional()
  }),
  handler: async (args, ctx) => { ... }
};

const cdTool: Tool = {
  name: 'terminalCd',
  aliases: ['cd', 'chdir', 'change_directory'],
  description: [
    'Change working directory in terminal session.',
    'Also known as: cd, chdir, change_directory'
  ].join(' '),
  schema: z.object({
    path: z.string(),
    sessionId: z.string().optional()
  }),
  handler: async (args, ctx) => { ... }
};
```

### Phase 3: Update Tool Calling Middleware

```typescript
// @sisu-ai/mw-tool-calling/src/index.ts
export function toolCalling(): Middleware {
  return async (ctx, next) => {
    // Build tool map: name + aliases → tool
    const toolMap = new Map<string, Tool>();

    for (const tool of ctx.tools) {
      // Primary name
      if (toolMap.has(tool.name)) {
        ctx.log.warn(`Tool name conflict: "${tool.name}"`);
      } else {
        toolMap.set(tool.name, tool);
      }

      // Aliases
      if (tool.aliases) {
        for (const alias of tool.aliases) {
          if (toolMap.has(alias)) {
            ctx.log.warn(
              `Tool alias "${alias}" conflicts with existing tool. ` +
                `Skipping alias for "${tool.name}".`,
            );
          } else {
            toolMap.set(alias, tool);
            ctx.log.debug(`Registered alias: ${alias} → ${tool.name}`);
          }
        }
      }
    }

    // When generating: Send tool definitions to LLM
    // Include both primary name AND common alias in description
    const toolDefinitions = Array.from(new Set(toolMap.values())).map(
      (tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.schema),
      }),
    );

    // When LLM calls tool: Resolve by name or alias
    ctx.on("tool-call", async (toolCall) => {
      const tool = toolMap.get(toolCall.name);

      if (!tool) {
        ctx.log.error(`Tool not found: ${toolCall.name}`);
        return { error: `Unknown tool: ${toolCall.name}` };
      }

      // Log if alias was used
      if (toolCall.name !== tool.name) {
        ctx.log.debug(`Tool alias used: ${toolCall.name} → ${tool.name}`);
      }

      // Execute tool
      const result = await tool.handler(toolCall.args, ctx);
      return result;
    });

    await next();
  };
}
```

### Phase 4: Update Skills Middleware

```typescript
// @sisu-ai/mw-skills/src/index.ts
export function skillsMiddleware(options: SkillsOptions): Middleware {
  return async (ctx, next) => {
    // ... discover skills ...

    // Validate allowed-tools using aliases
    for (const skill of ctx.skills) {
      if (skill.allowedTools) {
        const missing = skill.allowedTools.filter((requiredTool) => {
          // Check if tool exists by name OR alias
          return !ctx.tools.some(
            (tool) =>
              tool.name === requiredTool ||
              tool.aliases?.includes(requiredTool),
          );
        });

        if (missing.length > 0) {
          ctx.log.warn(
            `Skill "${skill.name}" requires tools not found: ${missing.join(", ")}`,
          );
        }
      }
    }

    await next();
  };
}
```

---

## Tool Naming Standard for SISU

### Primary Names (SISU Convention)

Use explicit, namespaced names:

- `terminalRun` (not `bash`)
- `terminalReadFile` (not `read_file`)
- `terminalCd` (not `cd`)
- `webSearch` (not `search`)
- `githubCreatePR` (not `create_pr`)

**Rationale**:

- Explicit: Clear what the tool does
- Namespaced: Avoids conflicts
- TypeScript-friendly: camelCase

### Aliases (Ecosystem Compatibility)

Add common ecosystem names as aliases:

- `bash`, `shell`, `run`, `exec` → `terminalRun`
- `read_file`, `cat`, `read` → `terminalReadFile`
- `cd`, `chdir` → `terminalCd`
- `search`, `google` → `webSearch`

**Rationale**:

- Compatibility: Works with existing skills
- Flexibility: Multiple aliases per tool
- Discoverability: LLM can find tools by common names

---

## Testing Alias System

```typescript
// @sisu-ai/mw-tool-calling/test/aliases.test.ts
import { describe, it, expect } from 'vitest';
import { toolCalling } from '../src';
import { createTerminalTool } from '@sisu-ai/tool-terminal';

describe('Tool Aliases', () => {
  it('resolves tool by primary name', async () => {
    const ctx = createContext();
    const terminal = createTerminalTool({ roots: ['/tmp'] });
    ctx.tools = terminal.tools;

    const middleware = toolCalling();
    await middleware(ctx, async () => {});

    // LLM calls using primary name
    const result = await ctx.callTool('terminalRun', {
      command: 'echo test'
    });

    expect(result).toBeDefined();
  });

  it('resolves tool by alias', async () => {
    const ctx = createContext();
    const terminal = createTerminalTool({ roots: ['/tmp'] });
    ctx.tools = terminal.tools;

    const middleware = toolCalling();
    await middleware(ctx, async () => {});

    // LLM calls using alias
    const result = await ctx.callTool('bash', {
      command: 'echo test'
    });

    expect(result).toBeDefined();
  });

  it('warns on alias conflicts', async () => {
    const ctx = createContext();
    const logs: string[] = [];
    ctx.log.warn = (msg: string) => logs.push(msg);

    ctx.tools = [
      { name: 'tool1', aliases: ['run'], ... },
      { name: 'tool2', aliases: ['run'], ... }  // Conflict!
    ];

    const middleware = toolCalling();
    await middleware(ctx, async () => {});

    expect(logs).toContain(
      expect.stringContaining('alias conflict')
    );
  });
});
```

---

## Migration Guide for SISU Users

### Before (SISU-specific names only)

```typescript
const agent = Agent.create({
  tools: [
    createTerminalTool({ ... }).tools
  ]
});

// Skills must use: terminalRun, terminalReadFile
```

### After (With aliases)

```typescript
const agent = Agent.create({
  tools: [
    createTerminalTool({ ... }).tools
  ]
});

// Skills can use EITHER:
// - terminalRun (SISU primary name)
// - bash (ecosystem alias)
// Both work!
```

**No breaking changes** - existing code continues to work.

---

## Conclusion

### ✅ Action Items

1. **Add `aliases` field** to `Tool` interface in `@sisu-ai/core`
2. **Update terminal tool** with ecosystem aliases
3. **Update tool-calling middleware** to resolve aliases
4. **Update skills middleware** to validate using aliases
5. **Document alias system** in README
6. **Add tests** for alias resolution

### ✅ Benefits

- Ecosystem compatibility (54K+ skills work)
- Backward compatible (no breaking changes)
- Explicit primary names (SISU convention)
- Flexible (multiple aliases per tool)
- Testable (clear resolution logic)

### ⏱️ Estimated Effort

- Core type update: 30 minutes
- Terminal tool aliases: 1 hour
- Tool-calling middleware: 2-3 hours
- Skills middleware validation: 1 hour
- Tests: 2 hours
- Documentation: 1 hour

**Total**: 1 day

---

**Status**: 🔴 CRITICAL ISSUE → ✅ SOLUTION IDENTIFIED  
**Next**: Implement alias system before skills middleware
