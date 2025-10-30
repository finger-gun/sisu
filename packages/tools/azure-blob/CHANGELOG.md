# @sisu-ai/tool-azure-blob

## 8.0.1

### Patch Changes

- 6679420: Fix ToolContext dependency injection and chromadb package installation
  - **@sisu-ai/tool-azure-blob**: Updated tests to use `ctx.deps` instead of `ctx.state` (aligning with implementation)
  - **@sisu-ai/tool-vec-chroma**: Fixed source code to use `ctx.deps` instead of `ctx.state` for proper dependency injection following the sandboxed tool architecture pattern.
  - All 207 tests now passing with 81.89% coverage.

- 6679420: Fix TypeScript compilation errors by migrating from ctx.state to ctx.deps

  Tools were incorrectly accessing ctx.state which doesn't exist on ToolContext interface. Updated to use ctx.deps for dependency injection following the sandboxed tool architecture pattern. This fixes CI build failures while maintaining backward compatibility with environment variables.

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

- b3b2f00: Azure Blob Storage tools for Sisu. Read, list, delete, and write blobs. Includes metadata operations.

### Minor Changes

- 6db8569: Add URL extraction and Azure Blob Storage tools.
