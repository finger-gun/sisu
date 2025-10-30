# @sisu-ai/tool-aws-s3

## 2.0.0

### Major Changes

- de89201: Implement tool handler sandboxing with restricted ToolContext

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
    },
  };

  // After
  const myTool: Tool = {
    handler: async (args, ctx: ToolContext) => {
      // restricted context with memory, signal, log, model, deps
    },
  };
  ```

## 1.0.2

### Patch Changes

- 82e8b95: Add CodeQL badges to documentation for enhanced security scanning
  - Added CodeQL badge to the main README.md for visibility.
  - Included CodeQL badge in the README.md files of various packages:
    - adapters: anthropic, ollama, openai
    - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
    - server
    - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
    - vector: core

## 1.0.1

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections

## 1.0.0

### Major Changes

- bf2c70e: AWS S3 tools for Sisu. Read, list, delete, and write objects. Includes metadata helpers.
