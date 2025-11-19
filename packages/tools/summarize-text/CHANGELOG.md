# @sisu-ai/tool-summarize-text

## 9.0.0

### Patch Changes

- chore: Update peer dependencies to use caret ranges

  Changed all peer dependencies from exact versions to caret ranges (e.g., `"2.2.1"` → `"^2.2.1"`).

  **Benefits:**
  - Prevents unnecessary major version bumps when core package receives minor/patch updates
  - Follows semantic versioning best practices
  - Aligns with standard npm ecosystem conventions
  - Reduces version number inflation across the monorepo

  **Technical Details:**
  - `^2.2.1` accepts any version ≥2.2.1 and <3.0.0 (backwards compatible updates)
  - Only breaking changes (major version bumps) will now trigger major bumps in dependent packages
  - No runtime behavior changes - this is purely a metadata update

  This is a non-breaking change that improves the maintainability of the monorepo.

- Updated dependencies
  - @sisu-ai/core@2.3.0

## 8.0.1

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.2.1

## 8.0.0

### Patch Changes

- Updated dependencies [7f0e07e]
  - @sisu-ai/core@2.2.0

## 7.0.0

### Patch Changes

- Updated dependencies [4c5a27a]
  - @sisu-ai/core@2.1.0

## 6.0.1

### Patch Changes

- Updated dependencies [bacf245]
  - @sisu-ai/core@2.0.1

## 6.0.0

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

## 5.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 4.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 4.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 4.0.1

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

## 4.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 3.0.3

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections

## 3.0.2

### Patch Changes

- 2b3af8b: Documentation updates
- Updated dependencies [2b3af8b]
  - @sisu-ai/core@1.0.2

## 3.0.1

### Patch Changes

- 94c8fd1: Add keywords to package metadata.
- Updated dependencies [94c8fd1]
  - @sisu-ai/core@1.0.1

## 3.0.0

### Patch Changes

- Updated dependencies [8a5a90e]
  - @sisu-ai/core@1.0.0

## 2.0.0

### Major Changes

- b3b2f00: A utility tool that asks the active model to summarize large text bodies into concise outputs. Designed for use alongside `webFetch` or other content tools.
