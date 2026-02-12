# @sisu-ai/mw-rag

## 8.0.1

### Patch Changes

- Infrastructure migration to pnpm + Turbo and tool aliasing support

  **Infrastructure Updates:**
  - Migrated from npm to pnpm for faster, more efficient dependency management
  - Added Turbo for optimized monorepo builds with caching
  - Updated all package dependencies and peer dependencies

  **New Feature:**
  - Added optional tool aliasing support in `registerTools` middleware - map SISU tool names to ecosystem-standard aliases (e.g., 'bash', 'read_file')

  **Example Usage:**

  ```typescript
  registerTools(terminal.tools, {
    aliases: {
      terminalRun: "bash",
      terminalReadFile: "read_file",
    },
  });
  ```

  **Maintenance:**
  - Code formatting standardization across packages
  - Internal improvements to tool-calling middleware

- Updated dependencies
  - @sisu-ai/core@2.3.1
  - @sisu-ai/vector-core@1.0.5

## 8.0.0

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

## 7.0.1

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@2.2.1

## 7.0.0

### Patch Changes

- Updated dependencies [7f0e07e]
  - @sisu-ai/core@2.2.0

## 6.0.0

### Patch Changes

- Updated dependencies [4c5a27a]
  - @sisu-ai/core@2.1.0

## 5.0.1

### Patch Changes

- Updated dependencies [bacf245]
  - @sisu-ai/core@2.0.1

## 5.0.0

### Patch Changes

- Updated dependencies [de89201]
  - @sisu-ai/core@2.0.0

## 4.0.0

### Patch Changes

- Updated dependencies [e9f7d6c]
  - @sisu-ai/core@1.2.0

## 3.0.3

### Patch Changes

- Updated dependencies
  - @sisu-ai/core@1.1.3

## 3.0.2

### Patch Changes

- Updated dependencies [0e36092]
  - @sisu-ai/core@1.1.2

## 3.0.1

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

## 3.0.0

### Patch Changes

- Updated dependencies [b2675b7]
  - @sisu-ai/core@1.1.0

## 2.0.3

### Patch Changes

- 03b0e75: docs: Update README files to include badges and community support sections
- Updated dependencies [03b0e75]
  - @sisu-ai/vector-core@1.0.3

## 2.0.2

### Patch Changes

- 2b3af8b: Documentation updates
- Updated dependencies [2b3af8b]
  - @sisu-ai/core@1.0.2
  - @sisu-ai/vector-core@1.0.2

## 2.0.1

### Patch Changes

- 94c8fd1: Add keywords to package metadata.
- Updated dependencies [94c8fd1]
  - @sisu-ai/core@1.0.1
  - @sisu-ai/vector-core@1.0.1

## 2.0.0

### Patch Changes

- Updated dependencies [8a5a90e]
  - @sisu-ai/core@1.0.0

## 1.0.0

### Major Changes

- b3b2f00: RAG-oriented middlewares for Sisu that glue vector tools to LLM prompting.

### Patch Changes

- Updated dependencies [b3b2f00]
  - @sisu-ai/vector-core@1.0.0
