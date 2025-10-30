# @sisu-ai/tool-vec-chroma

## 6.0.2

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.2.1

## 6.0.1

### Patch Changes

- 6679420: Fix ToolContext dependency injection and chromadb package installation
  - **@sisu-ai/tool-azure-blob**: Updated tests to use `ctx.deps` instead of `ctx.state` (aligning with implementation)
  - **@sisu-ai/tool-vec-chroma**: Fixed source code to use `ctx.deps` instead of `ctx.state` for proper dependency injection following the sandboxed tool architecture pattern.
  - All 207 tests now passing with 81.89% coverage.

## 6.0.0

### Patch Changes

- Updated dependencies [7f0e07e]
  - @sisu-ai/core@2.2.0

## 5.0.0

### Patch Changes

- Updated dependencies [4c5a27a]
  - @sisu-ai/core@2.1.0

## 4.0.1

### Patch Changes

- Updated dependencies [bacf245]
  - @sisu-ai/core@2.0.1

## 4.0.0

### Patch Changes

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

- Updated dependencies [de89201]
  - @sisu-ai/core@2.0.0

## 3.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 2.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 2.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 2.0.1

### Patch Changes

- 82e8b95: Add CodeQL badges to documentation for enhanced security scanning
  - Added CodeQL badge to the main README.md for visibility.
  - Included CodeQL badge in the README.md files of various packages:
    - adapters: anthropic, ollama, openai
    - middleware: agent-run-api, context-compressor, control-flow, conversation-buffer, error-boundary, guardrails, invariants, rag, react-parser, register-tools, tool-calling, trace-viewer, usage-tracker
    - server
    - tools: aws-s3, azure-blob, extract-urls, github-projects, summarize-text, terminal, vec-chroma, web-fetch, web-search-duckduckgo, web-search-google, web-search-openai, wikipedia
    - vector: core
- Updated dependencies [82e8b95]
  - @sisu-ai/core@1.1.1
  - @sisu-ai/vector-core@1.0.4

## 2.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 1.0.1

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections
- Updated dependencies [03b0e75]
  - @sisu-ai/vector-core@1.0.3

## 1.0.0

### Major Changes

- 2b3af8b: ChromaDB adapter tools for Sisu vectors

### Patch Changes

- Updated dependencies [2b3af8b]
  - @sisu-ai/core@1.0.2
  - @sisu-ai/vector-core@1.0.2
