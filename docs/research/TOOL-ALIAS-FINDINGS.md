# Tool Alias Investigation: Critical Findings

**Date**: 2026-02-12  
**Context**: Investigating how to make SISU tools work with skills.sh ecosystem names

## Summary

**The current alias implementation is fundamentally broken.** Aliases defined in SISU's Tool interface are never sent to the LLM API, making alias resolution in middleware useless.

## The Problem

### What We Built (Broken)

1. **Tool definition with aliases** (`/packages/tools/terminal/src/index.ts:650`):

   ```typescript
   const runCommandTool: Tool = {
     name: "terminalRun",
     aliases: ["bash", "shell", "run", "exec", "execute_command"],
     // ...
   };
   ```

2. **Alias resolution in middleware** (`/packages/middleware/tool-calling/src/index.ts`):

   ```typescript
   function buildAliasMap(tools: Tool[]): Map<string, string> {
     // Maps alias → canonical name
     // e.g., "bash" → "terminalRun"
   }
   ```

3. **The Fatal Flaw**:
   - Middleware resolves tool calls by checking if the called name is an alias
   - But **models only call tools they know about** from the API's `tools` parameter
   - The OpenAI adapter (`/packages/adapters/openai/src/index.ts:41`) only sends `tool.name`:
     ```typescript
     function toOpenAiTool(tool: Tool) {
       return {
         type: "function",
         function: {
           name: tool.name, // ONLY this field is sent
           // aliases field is completely ignored
         },
       };
     }
     ```

### Why This Fails

**Flow of broken design**:

1. SISU registers tool with `name: "terminalRun"`, `aliases: ["bash"]`
2. OpenAI adapter sends to API: `{ name: "terminalRun" }` (aliases ignored)
3. Model sees only `terminalRun` in available tools
4. Skill says "use bash tool"
5. Model has NO KNOWLEDGE of tool named "bash"
6. Model either fails or tries to improvise
7. Alias resolution middleware waits to resolve calls that **will never happen**

**The alias resolution happens AFTER the model call, but models never call aliases because they don't know aliases exist.**

## How Cline Solves This

### Key Finding: Cline Uses Ecosystem Names Directly

From Cline source code investigation:

**Tools registered** (`/src/core/prompts/system-prompt/tools/*.ts`):

- `execute_command` (NOT "bash" but ecosystem-standard)
- `read_file` (exactly what skills expect)
- `write_to_file`
- `replace_in_file`
- `search_files`
- `list_files`

**Cline does NOT:**

- Use any alias system
- Register tools multiple times
- Have any translation layer

**How it works:**

1. Internal code uses enum `ClineDefaultTool.BASH`
2. Tool specs have `name: "execute_command"`
3. OpenAI API receives `{ name: "execute_command" }`
4. Skills reference `execute_command` → Direct match

**Their architecture**:

```typescript
// Internal tool spec
{
  variant: ModelFamily.GENERIC,
  id: ClineDefaultTool.BASH,         // Internal enum for code
  name: "execute_command",            // What API sees
  description: "...",
  parameters: [...]
}

// Conversion to OpenAI format
function toolSpecFunctionDefinition(tool: ClineToolSpec): OpenAITool {
  return {
    type: "function",
    function: {
      name: tool.name,  // Uses the ecosystem-standard name
      description: tool.description,
      parameters: {...}
    }
  }
}
```

**Key insight**: Cline designed around the ecosystem from day one. Their tool names ARE the ecosystem names.

## Solutions for SISU

### Option 1: Rename SISU Tools (Breaking Change)

**Rename tools to match ecosystem**:

- `terminalRun` → `execute_command` (or `bash`)
- `terminalReadFile` → `read_file`
- `terminalCd` → `cd`

**Pros**:

- ✅ Direct compatibility with skills ecosystem
- ✅ No alias system needed
- ✅ Clean, explicit design (SISU philosophy)
- ✅ Matches Cline/Claude/other frameworks

**Cons**:

- ❌ **BREAKING CHANGE** for existing SISU users
- ❌ Tool names less TypeScript-idiomatic (snake_case vs camelCase)
- ❌ Requires migration guide

**Migration path**:

1. Add deprecation warnings to current names
2. Release v3.0.0 with new names
3. Provide codemod for automatic migration

### Option 2: Register Each Tool Multiple Times

**Register the same tool handler under multiple names**:

```typescript
// In adapter's toOpenAiTool()
function toOpenAiTools(tools: Tool[]): OpenAITool[] {
  const result: OpenAITool[] = [];

  for (const tool of tools) {
    // Register primary name
    result.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toJsonSchema(tool.schema),
      },
    });

    // Register each alias as a separate tool
    if (tool.aliases) {
      for (const alias of tool.aliases) {
        result.push({
          type: "function",
          function: {
            name: alias,
            description: `Alias for ${tool.name}. ${tool.description}`,
            parameters: toJsonSchema(tool.schema),
          },
        });
      }
    }
  }

  return result;
}
```

**Pros**:

- ✅ No breaking changes
- ✅ Skills can use ecosystem names
- ✅ Existing code continues working

**Cons**:

- ❌ Token bloat (3 tools → 15+ tool definitions sent to API)
- ❌ May confuse models with many identical tools
- ❌ Higher API costs
- ❌ Violates SISU's explicit/minimal philosophy

**Performance impact**:

- Each tool with 5 aliases = 6x the API tokens
- 3 terminal tools with aliases = 18 tool definitions in API call
- Estimated: +500-1000 tokens per request

### Option 3: Adapter-Level Name Mapping

**Map names in adapter based on provider**:

```typescript
// In openai adapter
const NAME_MAP: Record<string, string> = {
  terminalRun: "execute_command",
  terminalReadFile: "read_file",
  terminalCd: "cd",
};

function toOpenAiTool(tool: Tool): OpenAITool {
  return {
    type: "function",
    function: {
      name: NAME_MAP[tool.name] || tool.name, // Map to ecosystem name
      description: tool.description,
      parameters: toJsonSchema(tool.schema),
    },
  };
}

// Tool call results need reverse mapping
function mapToolCallResult(toolCall: any): any {
  const reversedMap = Object.fromEntries(
    Object.entries(NAME_MAP).map(([k, v]) => [v, k]),
  );

  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      name: reversedMap[toolCall.function.name] || toolCall.function.name,
    },
  };
}
```

**Pros**:

- ✅ No breaking changes to SISU API
- ✅ No token bloat
- ✅ Per-provider customization possible
- ✅ Internal code keeps TypeScript-friendly names

**Cons**:

- ❌ Hidden translation layer (violates explicit philosophy)
- ❌ Debugging confusion (logs show different names than API)
- ❌ Need to maintain mappings for each provider
- ❌ Hard to discover what names are actually sent

### Option 4: Use Primary Aliases System Correctly

**Fix the alias system by sending aliases to API**:

1. **Keep current middleware alias resolution** (it's correct)

2. **Fix adapters to send primary alias to API**:

   ```typescript
   function toOpenAiTool(tool: Tool): OpenAITool {
     // Use first alias if available, otherwise tool name
     const apiName = tool.aliases?.[0] || tool.name;

     return {
       type: "function",
       function: {
         name: apiName, // Send ecosystem name to API
         description: tool.description,
         parameters: toJsonSchema(tool.schema),
       },
     };
   }
   ```

3. **Update tool definitions**:
   ```typescript
   const runCommandTool: Tool = {
     name: "terminalRun", // Internal/TypeScript name
     aliases: ["bash"], // Primary = what API sees
     description: "...",
   };
   ```

**Pros**:

- ✅ No breaking changes
- ✅ Explicit in tool definitions
- ✅ No token bloat
- ✅ Middleware already handles resolution

**Cons**:

- ❌ Convention-based (first alias = API name)
- ❌ Not immediately obvious without documentation
- ❌ Mixing concerns (internal name vs API name in same object)

## Recommendation

I recommend **Option 1 (Rename Tools)** for SISU's long-term health:

### Rationale

1. **Explicit over implicit** (SISU core principle)
   - Tool names directly reflect what the API sees
   - No hidden mappings or conventions
   - Debugging is straightforward

2. **Ecosystem alignment**
   - Cline, Claude, skills.sh all use these names
   - 54,000+ skills expect these names
   - Future skills will continue using these names

3. **TypeScript considerations are secondary**
   - SISU already has snake_case in types (e.g., `tool_calls`, `tool_choice`)
   - Consistency with API specs more important than internal aesthetics
   - Can still use camelCase in internal handler functions

4. **Breaking change is acceptable**
   - SISU is pre-1.0 (currently 0.x)
   - Better to break now than after wider adoption
   - Clean migration path with deprecation period

### Proposed Names

| Current (SISU)     | Proposed (Ecosystem) | Rationale                             |
| ------------------ | -------------------- | ------------------------------------- |
| `terminalRun`      | `execute_command`    | Matches Cline, more descriptive       |
| `terminalReadFile` | `read_file`          | Universal standard                    |
| `terminalCd`       | `change_directory`   | More explicit (or just `cd`)          |
| Other tools        | Keep as-is or review | Case-by-case based on ecosystem usage |

### Implementation Plan

**Phase 1: Add both names (v2.x)**

```typescript
// Keep old names, mark deprecated
export const terminalRun = createTerminalTool(...);  // @deprecated
export const execute_command = createTerminalTool(...);

// Or use aliases temporarily
const tool: Tool = {
  name: "execute_command",
  aliases: ["terminalRun"],  // Old name as alias
  // ...
};
```

**Phase 2: Document migration (v2.x)**

- Add migration guide
- Update all examples
- Provide codemod script

**Phase 3: Remove old names (v3.0.0)**

- Delete deprecated exports
- Update docs completely
- Announce breaking change

## Alternative: If Breaking Changes Unacceptable

If renaming is not an option, **Option 4 (Primary Aliases)** is the next best:

1. Document that `aliases[0]` is the API name
2. Update adapters to use `aliases[0] || name`
3. Keep middleware as-is (it's correct)
4. Update terminal tools:
   ```typescript
   {
     name: "terminalRun",
     aliases: ["execute_command", "bash", "shell"],  // First = API name
     // ...
   }
   ```

This maintains backward compatibility while enabling skills support.

## What to Remove

The current implementation should be:

1. **Keep**: Alias resolution in middleware (`buildAliasMap`, resolver logic)
2. **Fix**: Adapters to send aliases to API
3. **Update**: Tool definitions to use ecosystem-first aliases
4. **Document**: Convention that aliases[0] is the API name

OR:

1. **Remove**: Current alias system entirely
2. **Rename**: Tools to ecosystem names
3. **Update**: All examples and docs
4. **Release**: v3.0.0 with migration guide

## Next Steps

**Decision needed from maintainer**:

1. Is a breaking change (renaming) acceptable?
2. If yes → Implement Option 1 (Rename Tools)
3. If no → Implement Option 4 (Primary Aliases System)

**Do not implement Option 2** (multiple registrations) - it violates SISU's design principles.

**Do not implement Option 3** (adapter mapping) - it's too implicit and hard to debug.

---

**Files to modify** (for either solution):

- `/packages/adapters/openai/src/index.ts` - Update `toOpenAiTool()`
- `/packages/adapters/anthropic/src/index.ts` - Update similar function
- `/packages/adapters/ollama/src/index.ts` - Update similar function
- `/packages/tools/terminal/src/index.ts` - Update tool names/aliases
- `/packages/middleware/tool-calling/src/index.ts` - Already correct, keep as-is
- `/packages/middleware/tool-calling/test/tool-calling.test.ts` - Update tests

**Documentation to create**:

- Migration guide (if renaming)
- Convention guide for aliases (if using Option 4)
- Updated examples showing correct usage
