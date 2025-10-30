---
"@sisu-ai/core": major
"@sisu-ai/mw-tool-calling": major
"@sisu-ai/tool-aws-s3": major
"@sisu-ai/tool-github-projects": patch
"@sisu-ai/tool-summarize-text": patch
"@sisu-ai/tool-terminal": patch
"@sisu-ai/tool-vec-chroma": patch
"@sisu-ai/tool-web-search-openai": patch
"@sisu-ai/tool-wikipedia": patch
---

Implement tool handler sandboxing with restricted ToolContext

**Security Enhancement:**
Tool handlers now receive a sandboxed `ToolContext` instead of full `Ctx`, preventing:
- Tools from calling other tools (no `tools` registry access)
- Tools from manipulating conversation history (no `messages` access)
- Tools from accessing middleware state (no `state` access)
- Tools from interfering with user I/O (no `input`/`stream` access)

**New Types:**
- `ToolContext` interface with restricted properties: `memory`, `signal`, `log`, `model`, `deps`
- `Tool` interface updated to use `ToolContext` in handler signature

**Breaking Changes:**
- Tool handlers must now accept `ToolContext` instead of `Ctx`
- Custom tools need to update their handler signatures
- AWS S3 tool now uses `ctx.deps` for dependency injection instead of `ctx.state`

**Dependency Injection:**
- New `deps` property in `ToolContext` for proper dependency injection
- Middleware can provide dependencies via `ctx.state.toolDeps`
- Tools access dependencies via `ctx.deps?.dependencyName`

**Migration Guide:**
```typescript
// Before
const myTool: Tool = {
  handler: async (args, ctx: Ctx) => {
    // had access to full context
  }
};

// After  
const myTool: Tool = {
  handler: async (args, ctx: ToolContext) => {
    // restricted context with memory, signal, log, model, deps
  }
};