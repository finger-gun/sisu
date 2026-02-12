# Tool Alias System - Order of Operations

This document explains exactly how tool registration and alias resolution works in SISU, with concrete examples.

## Core Components

### 1. Tool Interface (`@sisu-ai/core/src/types.ts`)

```typescript
export interface Tool<TArgs = any, TResult = unknown> {
  name: string; // Primary/canonical name
  aliases?: string[]; // Optional alternative names
  description?: string;
  schema: any; // Zod schema
  handler: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}
```

### 2. Tool Registry (`@sisu-ai/core/src/util.ts`)

```typescript
export class SimpleTools implements ToolRegistry {
  private tools = new Map<string, Tool>();
  list() {
    return Array.from(this.tools.values());
  }
  get(name: string) {
    return this.tools.get(name);
  } // Only looks up by PRIMARY name
  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  } // Only stores by PRIMARY name
}
```

**Key Point**: The registry ONLY stores tools by their primary name. Aliases are NOT stored in the registry.

### 3. Alias Resolution (`@sisu-ai/mw-tool-calling/src/index.ts`)

```typescript
function buildAliasMap(
  tools: Array<{ name: string; aliases?: string[] }>,
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  for (const tool of tools) {
    // Map primary name to itself
    aliasMap.set(tool.name, tool.name);
    // Map each alias to the primary name
    if (tool.aliases) {
      for (const alias of tool.aliases) {
        if (aliasMap.has(alias)) {
          throw new Error(`Duplicate tool alias '${alias}'`);
        }
        aliasMap.set(alias, tool.name);
      }
    }
  }
  return aliasMap;
}
```

**Key Point**: Alias resolution happens in the middleware layer, NOT in the registry. The registry remains simple and only knows about primary names.

## Complete Order of Operations

### Example: Terminal Tool with Aliases

```typescript
// Step 1: Tool Definition
const runCommandTool: Tool = {
  name: "terminalRun", // PRIMARY name stored in registry
  aliases: ["bash", "shell", "run"], // Alternative names (NOT stored in registry)
  schema: z.object({ command: z.string() }),
  handler: async (args, ctx) => {
    /* ... */
  },
};
```

### Step 2: Application Setup

```typescript
import { createTerminalTool } from "@sisu-ai/tool-terminal";
import { registerTools } from "@sisu-ai/mw-register-tools";
import { iterativeToolCalling } from "@sisu-ai/mw-tool-calling";

// Create tools
const terminal = createTerminalTool({
  /* config */
});
// terminal.tools = [runCommandTool, cdTool, readFileTool]

// Build agent with middleware
const app = new Agent()
  .use(registerTools(terminal.tools)) // ← Registers tools in registry
  .use(iterativeToolCalling); // ← Resolves aliases during execution

// Create context
const ctx = createCtx({
  model: openAIAdapter({ model: "gpt-4o-mini" }),
  input: "List files in current directory",
});

// Execute
await app.handler()(ctx);
```

### Step 3: Tool Registration (happens during middleware execution)

```typescript
// registerTools middleware runs FIRST
export const registerTools =
  (tools: Tool[]): Middleware =>
  async (ctx, next) => {
    for (const t of tools) {
      ctx.tools.register(t); // Stores: Map('terminalRun' -> Tool)
      // Does NOT store: 'bash', 'shell', 'run'
    }
    await next();
  };
```

**Registry State After Registration:**

```typescript
ctx.tools = SimpleTools {
  tools: Map {
    'terminalRun' -> { name: 'terminalRun', aliases: ['bash', 'shell', 'run'], ... },
    'terminalCd' -> { name: 'terminalCd', aliases: ['cd', 'change_directory'], ... },
    'terminalReadFile' -> { name: 'terminalReadFile', aliases: ['read_file', 'cat'], ... }
  }
}
```

### Step 4: Model Receives Tool Definitions

```typescript
// iterativeToolCalling middleware
const toolList = ctx.tools.list(); // Returns all 3 Tool objects WITH their aliases field

const genOpts = {
  toolChoice: "auto",
  tools: toolList, // Full tool objects sent to LLM adapter
  // ...
};

const out = await ctx.model.generate(ctx.messages, genOpts);
```

**What the LLM adapter receives:**

```typescript
tools: [
  {
    name: 'terminalRun',
    aliases: ['bash', 'shell', 'run'],
    description: 'Run a non-interactive command...',
    schema: { ... }
  },
  // ... other tools
]
```

**What gets sent to OpenAI API** (see `toOpenAiTool()` in openai adapter):

```typescript
{
  type: 'function',
  function: {
    name: 'terminalRun',        // ← Only tool.name used, aliases ignored
    description: '...',
    parameters: { ... }          // JSON Schema from zod
  }
}
```

**Important**: The LLM adapter converts tools to the provider's format:

- **OpenAI adapter**: `toOpenAiTool(tool)` only uses `tool.name` for function name
- **The `aliases` field is NOT sent to the API** - it exists only in SISU's internal Tool object
- **The model only sees**: `terminalRun`, `terminalCd`, `terminalReadFile`
- **Aliases are resolved** only when the model calls a tool name that happens to be an alias

### Step 5: LLM Calls Tool (Using Alias - From Skills/User)

If a skill or external source tells the model to use `bash`, the model might try to call it:

```typescript
// Model response
{
  role: 'assistant',
  content: 'I will run a command',
  tool_calls: [
    { id: '1', name: 'bash', arguments: { command: 'ls -la' } }
    // ↑ Model is calling 'bash', NOT 'terminalRun'
  ]
}
```

**Problem**: The registry only has `terminalRun`, not `bash`!

### Step 6: Alias Resolution in Tool-Calling Middleware

```typescript
export const iterativeToolCalling: Middleware = async (ctx, next) => {
  await next();

  const toolList = ctx.tools.list(); // Get all tools with aliases
  const aliasMap = buildAliasMap(toolList); // Build mapping ONCE

  // aliasMap = Map {
  //   'terminalRun' -> 'terminalRun',   // Primary name maps to itself
  //   'bash' -> 'terminalRun',           // Alias maps to primary
  //   'shell' -> 'terminalRun',          // Alias maps to primary
  //   'run' -> 'terminalRun',            // Alias maps to primary
  //   'terminalCd' -> 'terminalCd',
  //   'cd' -> 'terminalCd',
  //   // ... etc
  // }

  for (let i = 0; i < maxIters; i++) {
    const out = await ctx.model.generate(ctx.messages, genOpts);
    const toolCalls = out.message.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        // call.name = 'bash'  (what model requested)

        // Step 6a: Resolve alias to canonical name
        const canonicalName = aliasMap.get(call.name);
        // canonicalName = 'terminalRun'

        if (!canonicalName) {
          throw new Error("Unknown tool: " + call.name);
        }

        // Step 6b: Look up tool by canonical name
        const tool = ctx.tools.get(canonicalName);
        // tool = { name: 'terminalRun', aliases: [...], handler: ... }

        // Step 6c: Execute tool
        const result = await tool.handler(args, toolCtx);

        // Step 6d: Append tool result to messages
        ctx.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
  }
};
```

### Step 7: Tool Result Returned

```typescript
// Messages after tool execution
ctx.messages = [
  { role: 'user', content: 'List files in current directory' },
  { role: 'assistant', content: 'I will run a command', tool_calls: [...] },
  { role: 'tool', tool_call_id: '1', content: '{"exitCode":0,"stdout":"file1.txt\nfile2.txt\n..."}' },
  { role: 'assistant', content: 'Here are the files: file1.txt, file2.txt...' }
]
```

## Key Insights

### 1. Registry Stays Simple

The `SimpleTools` registry ONLY stores tools by their **primary name**. No alias logic in the registry.

```typescript
ctx.tools.get("bash"); // ← Returns undefined (alias not in registry)
ctx.tools.get("terminalRun"); // ← Returns Tool object (primary name works)
```

### 2. Alias Resolution is Middleware Concern

The `toolCalling` and `iterativeToolCalling` middleware handle alias resolution:

- Build alias map once per agent run
- Resolve aliases before registry lookup
- Transparent to the tool implementation

### 3. Adapter Behavior

The LLM adapter (OpenAI, Anthropic, etc.):

- Receives full Tool objects including `aliases` field
- Converts to provider-specific format (only uses `tool.name`)
- **Model only sees primary names** in function calling schema
- Model cannot directly "see" aliases unless we tell it

### 4. How Does Model Know About Aliases?

**Current Implementation**: The model does NOT know about aliases at all:

- OpenAI/Anthropic adapters send only `tool.name` to the API (see `toOpenAiTool()`)
- The `aliases` field never leaves SISU - it's purely internal
- The model learns primary names like `terminalRun`, `terminalCd`, `terminalReadFile`
- Aliases are only used for **resolving** tool calls, not **advertising** tools

**For Skills to Work**: The skills middleware MUST:

1. **Tell the model about aliases explicitly** in the system prompt
2. When a skill says "use the `bash` tool", the model needs to know `bash` is valid
3. The middleware will resolve `bash` → `terminalRun` when the model calls it

**Two Implementation Options:**

**Option A: System Prompt (Simpler, Recommended)**

```typescript
// Skills middleware injects:
const aliasInfo = availableTools
  .map((t) => {
    const aliases = t.aliases?.length
      ? ` (aliases: ${t.aliases.join(", ")})`
      : "";
    return `- ${t.name}${aliases}`;
  })
  .join("\n");

const systemPrompt = `
Available tools:
${aliasInfo}

When skills reference a tool by an alias (e.g., "bash"), call it using that exact alias name.
The framework will resolve it to the correct tool.
`;
```

**Option B: Modify Adapter (More Complex)**

```typescript
// Would need to change toOpenAiTool() to register multiple functions
function toOpenAiTool(tool: Tool): OpenAITool[] {
  const tools = [
    {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toJsonSchema(tool.schema),
      },
    },
  ];

  // Register each alias as a separate function
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      tools.push({
        type: "function",
        function: {
          name: alias,
          description: `Alias for ${tool.name}. ${tool.description}`,
          parameters: toJsonSchema(tool.schema),
        },
      });
    }
  }

  return tools;
}
```

**Recommendation**: Use Option A (system prompt). It's:

- Simpler to implement
- Doesn't change adapter behavior
- More transparent (model sees aliases are aliases)
- Less token overhead (one description, not N duplicated descriptions)

**Example Skills System Prompt:**

```
You have access to these tools:
- terminalRun (aliases: bash, shell, run): Run a command
- terminalCd (aliases: cd, chdir): Change directory
- terminalReadFile (aliases: read_file, cat): Read a file

Skills may reference tools by their aliases. Use the alias names when specified in skills.
```

## Benefits of This Design

### 1. Clean Separation of Concerns

- **Registry**: Simple key-value store (primary names only)
- **Middleware**: Handles alias resolution logic
- **Tools**: Define aliases alongside primary name

### 2. Zero Performance Overhead

- Alias map built once per agent run (not per tool call)
- O(1) lookup for both primary names and aliases
- No changes to registry lookup performance

### 3. Backward Compatible

- Existing tools without aliases work unchanged
- Optional `aliases` field
- No breaking changes to Tool interface

### 4. Explicit Error Handling

- Duplicate aliases detected at alias map build time
- Clear error messages: "Duplicate tool alias 'bash'"
- Unknown tools fail fast with helpful messages

### 5. Ecosystem Compatible

- Skills can reference tools by ecosystem names (`bash`, `read_file`)
- SISU tools keep clean, descriptive primary names (`terminalRun`, `terminalReadFile`)
- Best of both worlds

## Example: Skills Middleware Integration

```typescript
// Future skills middleware
export const skillsMiddleware =
  ({ cwd }: { cwd: string }): Middleware =>
  async (ctx, next) => {
    // 1. Discover skills from filesystem
    const skills = await discoverSkills(cwd);

    // 2. Build tool name mapping
    const availableTools = ctx.tools.list();
    const toolNames = new Set<string>();
    for (const tool of availableTools) {
      toolNames.add(tool.name);
      if (tool.aliases) {
        tool.aliases.forEach((alias) => toolNames.add(alias));
      }
    }

    // 3. Filter skills that have compatible tools
    const compatibleSkills = skills.filter((skill) =>
      skill.allowedTools.every((toolName) => toolNames.has(toolName)),
    );

    // 4. Inject skills into system prompt
    const skillPrompt = `
You have access to these skills:
${compatibleSkills.map((s) => `- ${s.name}: ${s.description}`).join("\n")}

Available tools and their aliases:
${availableTools.map((t) => `- ${t.name}${t.aliases ? ` (aliases: ${t.aliases.join(", ")})` : ""}`).join("\n")}

When a skill references a tool by alias (like "bash"), you can call it using either the primary name or the alias.
`;

    // 5. Prepend to messages
    ctx.messages.unshift({ role: "system", content: skillPrompt });

    await next();
  };
```

## Summary

**Order of Operations:**

1. **Tool Definition**: Tool created with `name` and optional `aliases`
2. **Registration**: Tool stored in registry by PRIMARY name only
3. **Model Call**: Adapter sends tools to LLM (currently only primary names)
4. **LLM Response**: Model calls tool (might use alias if skills tell it to)
5. **Alias Resolution**: Middleware maps alias → primary name
6. **Registry Lookup**: Tool retrieved by primary name
7. **Execution**: Tool handler executes
8. **Result**: Returned to LLM via tool message

**Key Takeaway**: Aliases are resolved in the middleware layer, keeping the registry simple. The model needs to be _told_ about aliases (via system prompt or adapter enhancement) to actually use them.
